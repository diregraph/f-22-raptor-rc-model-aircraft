// Loads on the three-bearing swivel nozzle and what the two cord servos must hold. Pure functions, used by the
// bench viewer, tools/nozzle-loads.mjs (which also writes the firmware's thrust-limit table) and the docs.
//
// Model, in plain words:
//   * The jet leaves the exit along d. Its reaction, -T_exit * d, acts on the nozzle at the exit centre. The flow coming
//     in at each bearing runs along the upstream segment's axis through the bearing centre, so it has no lever about
//     that bearing. Generalised force on joint q = (jet reaction) . (d exit / d q), plus the weight of segments 2 and 3.
//   * Bearings are plain printed flanges clamped by a collar. Each one carries an axial force Fa on its faces (mean
//     radius rm), a radial force Fr on the collar bore (radius ro) and a tilting moment Mt on its faces. Friction torque
//     = mu * (Fa * rm + Fr * ro + 4/pi * Mt). The 4/pi comes from a cosine pressure pattern round the face ring.
//   * Cords lose tension where they turn: capstan factor e^(mu * angle). Servo 1 turns 90 deg at its fairlead; servo 2
//     the same, plus about 80 deg over posts between the ring and bearing 2; the slave loop about 120 deg.
//   * Servo coordinates are the bearing-1 collar angle u = a and the drive-ring angle v = a + k b, with c = -b.
//     Virtual work gives tau_v = (Q_b - Q_c) / k and tau_u = Q_a - (Q_b - Q_c) / k.
// Everything is an estimate to be checked on the bench: friction coefficients are the least certain input.
import { NOZZLE, solve, chain, yawLimit } from './nozzle.js';

const RAD = Math.PI / 180, G = 9.81e-3;   // newtons per gram
const sub = (a, b) => a.map((v, i) => v - b[i]), sc = (a, k) => a.map(v => v * k), add = (a, b) => a.map((v, i) => v + b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const LOADS = {
  thrustMax: 958, loss90: 0.15,                 // main fan, grams straight (site/js/spec.js THRUSTERS), and the guessed bend loss
  mass2: 42.7, mass3: 26.7,                     // segment + collar, grams (cad/kit-report.json)
  rMean: [43.6, 48.7, 48.7], rOuter: [46.6, 51.7, 51.7],   // bearing face mean radius and flange rim radius, mm
  wrap: { fairlead: 90, stage: 80, slave: 120 },             // degrees each cord bends over printed parts
};
// Friction cases. "plain" is the drawn design before this change; "ptfe" is with the PTFE seal washers and liners.
export const FRICTION = {
  plain: { label: 'PETG on PETG, greased', mu: 0.20, cord: 0.25 },
  ptfe: { label: 'PTFE washers, collar liner and fairlead tubes', mu: 0.08, cord: 0.10 },
};
// Servos that fit the existing pocket. Stall torque at the voltage given; "budget" is the share of stall we let the
// nozzle use continuously, so the servo does not sit near stall and cook.
export const SERVOS = {
  mg90s_5v: { label: 'MG90S on 5 V', stall: 1.9, budget: 0.7, g: 13.4 },
  mg90s_6v: { label: 'MG90S on 6 V', stall: 2.2, budget: 0.7, g: 13.4 },
};

// Generalised forces (N m) on joints a, b, c and the friction torque (N m, per unit mu) of each bearing.
export function jointLoads(deflection, yaw, thrustG, grav = [0, -1, 0]) {
  const j = solve(deflection, yaw), q = [j.a, j.b, j.c], c0 = chain(...q);
  const Te = thrustG * G * (1 - LOADS.loss90 * Math.min(deflection, 90) / 90), Fj = sc(c0.d, -Te);
  const W2 = sc(grav, LOADS.mass2 * G), W3 = sc(grav, LOADS.mass3 * G), h = 1e-3;
  const Q = [0, 1, 2].map(i => {
    const qp = [...q]; qp[i] += h; const c1 = chain(...qp);
    return (dot(Fj, sub(c1.e, c0.e)) + dot(W2, sub(c1.mid2, c0.mid2)) + dot(W3, sub(c1.mid3, c0.mid3))) / (h * RAD) / 1000;
  });
  const bearings = [0, 1, 2].map(i => {
    const p = c0.p[i], n = c0.n[i], lever = v => sc(sub(v, p), 1e-3);
    let F = add(sc(c0.up[i], thrustG * G), Fj), M = cross(lever(c0.e), Fj);         // flow in along the upstream axis, out along d
    for (const [W, at] of (i < 2 ? [[W2, c0.mid2], [W3, c0.mid3]] : [[W3, c0.mid3]])) { F = add(F, W); M = add(M, cross(lever(at), W)); }
    const Fa = Math.abs(dot(F, n)), Fr = nrm(sub(F, sc(n, dot(F, n)))), Mt = nrm(sub(M, sc(n, dot(M, n))));
    return { Fa, Fr, Mt, perMu: Fa * LOADS.rMean[i] / 1000 + Fr * LOADS.rOuter[i] / 1000 + 4 / Math.PI * Mt };
  });
  return { j, Q, bearings, Te };
}

// Torque each servo must hold (N m at the servo shaft) for one pose and thrust.
export function servoTorque(deflection, yaw, thrustG, fr = FRICTION.ptfe) {
  const { Q, bearings } = jointLoads(deflection, yaw, thrustG), c = NOZZLE.cord, k = c.collar / c.ring;
  const [f1, f2, f3] = bearings.map(b => b.perMu * fr.mu), cap = deg => Math.exp(fr.cord * deg * RAD);
  const Qbc = Q[1] - Q[2], loopB = (f2 + f3 * cap(LOADS.wrap.slave)) / k * cap(LOADS.wrap.stage);
  const tv = Math.abs(Qbc) / k * cap(LOADS.wrap.stage) + loopB;                 // at the drive ring
  const tu = Math.abs(Q[0] - Qbc / k) + 1.3 * f1 + loopB;                         // at the bearing-1 collar; the ring also drags on its sleeve
  return { s1: tu * c.drum / c.band1 * cap(LOADS.wrap.fairlead), s2: tv * c.drum / c.ring * cap(LOADS.wrap.fairlead), Q, friction: [f1, f2, f3] };
}
export const kgcm = nm => nm / 0.0981;

// Worst case over yaw left, centre and right at the yaw limit.
export function worstServo(deflection, thrustG, fr) {
  let w = 0;
  for (const s of [-1, 0, 1]) { const r = servoTorque(deflection, s * yawLimit(deflection), thrustG, fr); w = Math.max(w, r.s1, r.s2); }
  return w;
}

// Largest main-fan thrust (grams) at each deflection that keeps both servos inside their budget.
export function thrustEnvelope(servo = SERVOS.mg90s_6v, fr = FRICTION.ptfe, step = 5) {
  const lim = servo.stall * servo.budget * 0.0981, out = [];
  for (let d = 0; d <= NOZZLE.maxDeflection; d += step) {
    let lo = 0, hi = LOADS.thrustMax;
    if (worstServo(d, hi, fr) <= lim) lo = hi;
    else for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (worstServo(d, m, fr) <= lim) lo = m; else hi = m; }
    out.push([d, Math.floor(lo)]);
  }
  return out;
}
