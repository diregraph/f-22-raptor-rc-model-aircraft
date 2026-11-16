// Loads on the three-bearing swivel nozzle and what the three joint gearmotors must hold. Pure functions, used by the
// bench viewer, tools/nozzle-loads.mjs and the docs.
//
// Model, in plain words:
//   * The jet leaves the exit along d. Its reaction, -T_exit * d, acts on the nozzle at the exit centre. The flow coming
//     in at each bearing runs along the upstream segment's axis through the bearing centre, so it has no lever about
//     that bearing. Generalised force on joint q = (jet reaction) . (d exit / d q), plus the weight of segments 2 and 3.
//   * Bearings are plain printed flanges clamped by a collar. Each one carries an axial force Fa on its faces (mean
//     radius rm), a radial force Fr on the collar bore (radius ro) and a tilting moment Mt on its faces. Friction torque
//     = mu * (Fa * rm + Fr * ro + 4/pi * Mt). The 4/pi comes from a cosine pressure pattern round the face ring.
//   * Each joint has its own motor: it holds that joint's generalised force plus its bearing's friction, through the
//     ring gear and pinion (ratio ring / pinion) at a printed-spur efficiency.
// Everything is an estimate to be checked on the bench: friction coefficients are the least certain input.
import { NOZZLE, solve, chain, yawLimit } from './nozzle.js';

const RAD = Math.PI / 180, G = 9.81e-3;   // newtons per gram
const sub = (a, b) => a.map((v, i) => v - b[i]), sc = (a, k) => a.map(v => v * k), add = (a, b) => a.map((v, i) => v + b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const LOADS = {
  thrustMax: 958, loss90: 0.25,                 // main fan, grams straight (site/js/spec.js THRUSTERS), and the estimated bend loss (spec.js D.nozzle.loss90)
  mass2: 42.7, mass3: 26.7,                     // segment + collar, grams (cad/kit-report.json)
  rMean: [43.6, 48.7, 48.7], rOuter: [46.6, 51.7, 51.7],   // bearing face mean radius and flange rim radius, mm
  mesh: 0.85,                                                // printed spur mesh efficiency, ring gear to pinion
};
// Friction cases: plain printed flanges, and with the PTFE seal washers.
export const FRICTION = {
  plain: { label: 'PETG on PETG, greased', mu: 0.20 },
  ptfe: { label: 'PTFE seal washers', mu: 0.08 },
};
// Joint motors. Stall torque (kg cm) and free speed (rpm) at the gearbox shaft on 6 V; "budget" is the share of stall we let
// the nozzle use continuously: a brushed motor holding a load draws current in proportion, so it must not sit near stall.
export const MOTORS = {
  n20_100: { label: 'N20 100:1 high-power, 6 V', stall: 2.2, rpm: 320, budget: 0.5, g: 10.5 },
  n20_50: { label: 'N20 50:1 high-power, 6 V', stall: 1.1, rpm: 625, budget: 0.5, g: 10.5 },
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

// Torque each joint motor must hold at its gearbox shaft (N m) for one pose and thrust.
export function motorTorque(deflection, yaw, thrustG, fr = FRICTION.ptfe) {
  const { Q, bearings } = jointLoads(deflection, yaw, thrustG), g = NOZZLE.gear;
  const friction = bearings.map(b => b.perMu * fr.mu);
  return { m: Q.map((q, i) => (Math.abs(q) + friction[i]) * g.pinion / g.ring[i] / LOADS.mesh), Q, friction };
}
export const kgcm = nm => nm / 0.0981;

// Worst motor over yaw left, centre and right at the yaw limit.
export function worstMotor(deflection, thrustG, fr) {
  let w = 0;
  for (const s of [-1, 0, 1]) w = Math.max(w, ...motorTorque(deflection, s * yawLimit(deflection), thrustG, fr).m);
  return w;
}

// Largest main-fan thrust (grams) at each deflection that keeps every motor inside its budget.
export function thrustEnvelope(motor = MOTORS.n20_100, fr = FRICTION.ptfe, step = 5) {
  const lim = motor.stall * motor.budget * 0.0981, out = [];
  for (let d = 0; d <= NOZZLE.maxDeflection; d += step) {
    let lo = 0, hi = LOADS.thrustMax;
    if (worstMotor(d, hi, fr) <= lim) lo = hi;
    else for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (worstMotor(d, m, fr) <= lim) lo = m; else hi = m; }
    out.push([d, Math.floor(lo)]);
  }
  return out;
}

// Fastest each joint can turn (deg/s) while holding torque tau (N m): a brushed motor's speed falls in a straight line to stall.
export const jointSpeed = (motor, i, tau = 0) => motor.rpm * 6 * Math.max(0, 1 - kgcm(tau) / motor.stall) * NOZZLE.gear.pinion / NOZZLE.gear.ring[i];
