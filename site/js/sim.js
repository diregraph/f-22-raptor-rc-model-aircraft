// First-pass flight physics: 6-DOF rigid body, four thrusters, vectored main motor,
// simple wing/tail aerodynamics and a flight controller that mirrors the planned mixer.
// Pure maths, no rendering: runs in the browser and in Node (see tools/sim-test.mjs).
// SI units inside. Body axes match the twin: +X nose, +Y up, +Z right wing.
import { D, THRUSTERS, massProps, hoverTrim, nozzleExit } from './spec.js';

const G = 9.81, RHO = 1.2, DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// quaternion [x,y,z,w], body -> world
const qrot = (q, v) => { const u = [q[0], q[1], q[2]], t = mul(cross(u, v), 2); return add(add(v, mul(t, q[3])), cross(u, t)); };
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qnorm = q => { const n = Math.hypot(...q); return q.map(c => c / n); };

// Lift slope and the point where lift acts come from the vortex-lattice model (analysis/baseline_aero.py):
// about 2.5 per radian on 0.158 m2, neutral point 36 mm behind the datum.
export const AERO = {
  wingS: 0.20, wingX: -0.011, wingZ: 0.175,      // wing + lifting body area (m^2), aerodynamic centre station, half-span arm
  tailS: 0.024, tailX: -0.41, tailZ: 0.155,
  finS: 0.035, finX: -0.35, sideS: 0.04,
  CLa: 2.0, camber: 0.07, alphaStall: 0.40, CD0: 0.04, kInduced: 7.3,
  downwash: 0.45, pitchSpeed: 34,                // tail sees less incidence behind the wing; propeller thrust fades to zero at this airspeed
  kq: 0.015,                                    // propeller reaction torque per newton of thrust (m)
  rotDamp: 0.012, motorTau: 0.07, tiltRate: 150, nozzleRate: 300, tailRate: 400,
  gearCD: 0.012, gearRate: 0.45,                 // three legs hanging out cost this much drag; and they take about 2 s to fold
};

export function createSim(batteryX = D.battery.xDefault) {
  const mp = massProps(batteryX), m = mp.mass / 1000, cg = mp.cg.map(c => c / 1000);
  const I = [mp.inertia.roll * 1e-9, mp.inertia.yaw * 1e-9, mp.inertia.pitch * 1e-9];
  const th = THRUSTERS.map(t => ({ id: t.id, r: sub(t.pos.map(c => c / 1000), cg), max: t.maxG / 1000 * G, spin: t.spin === 'CW' ? 1 : -1 }));
  const [F, M, L, R] = th, rest = (mp.cg[1] - D.groundY) / 1000, rollShare = hoverTrim(mp, 90).rollShare;
  const exitAt = d => { const e = nozzleExit(d); return { r: sub(e.pos.map(c => c / 1000), cg), eff: e.eff }; };   // where the jet leaves and how much thrust the bends cost
  const s = { t: 0, p: [0, rest, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0], T: [0, 0, 0, 0], tilt: 90, nozzle: 0, tailL: 0, tailR: 0, gear: 0,
    iVy: 0, iPitch: 0, iAtt: [0, 0, 0], onGround: true, att: { roll: 0, pitch: 0, heading: 0 }, alpha: 0, speed: 0, cmd: [0, 0, 0, 0], armed: false };

  function attitude(q) {
    const f = qrot(q, [1, 0, 0]), u = qrot(q, [0, 1, 0]), r = qrot(q, [0, 0, 1]);
    return { pitch: Math.asin(clamp(f[1], -1, 1)), heading: Math.atan2(-f[2], f[0]), roll: Math.atan2(-r[1], u[1]), up: u[1] };
  }
  // lift/drag of one flat surface: velocity seen at the surface (body axes), incidence offset, area
  function surface(vb, inc, S, wash = 0, cd0 = AERO.CD0) {
    const vx = vb[0], vy = vb[1], V2 = vx * vx + vy * vy;
    if (V2 < 1e-4) return [0, 0, 0];
    const V = Math.sqrt(V2), a0 = Math.atan2(-vy, vx), a = (Math.abs(a0) < 0.5 ? a0 * (1 - wash) : a0) + inc, wgt = 1 / (1 + Math.exp((Math.abs(a) - AERO.alphaStall) / 0.035));
    const cla = AERO.CLa * a, CL = wgt * cla + (1 - wgt) * 1.1 * Math.sin(2 * a), CD = cd0 + wgt * cla * cla / AERO.kInduced + (1 - wgt) * 1.3 * Math.sin(a) ** 2;
    const qS = 0.5 * RHO * V2 * S, dx = vx / V, dy = vy / V;
    return [qS * (-CL * dy - CD * dx), qS * (CL * dx - CD * dy), 0];
  }

  // The controller: pilot inputs -> actuator targets. ArduPilot replaces this in tools/sitl-bridge.mjs.
  function control(dt, inp) {
    const att = attitude(s.q); s.att = att;
    const vb = qrot(qinv(s.q), s.v), V = Math.hypot(vb[0], vb[1]);
    const wingW = sstep(15, 20, vb[0]), hoverW = 1 - wingW;          // 0 = fans carry the weight, 1 = wing-borne
    s.speed = Math.hypot(...s.v); s.alpha = V > 1 ? Math.atan2(-vb[1], vb[0]) : 0; s.wingW = wingW;
    const armed = inp.armed !== false; s.armed = armed;

    // ---- flight controller -------------------------------------------------
    const vyD = Math.abs(inp.thr - 0.5) < 0.06 ? 0 : (inp.thr - 0.5) * 5;        // climb-rate command, +/- 2.5 m/s
    const eVy = vyD - s.v[1], fly = armed && !s.onGround;
    if (fly) { s.iVy = clamp(s.iVy + eVy * dt, -3, 3); s.iPitch = clamp(s.iPitch + eVy * dt * wingW, -1.5, 1.5); }
    const pitchWing = clamp(0.17 + 0.10 * eVy + 0.12 * s.iPitch, -0.3, 0.38);    // wing-borne: hold height with pitch
    const pitchD = hoverW * inp.pitch * 20 * DEG + wingW * (inp.altHold ? pitchWing + inp.pitch * 10 * DEG : inp.pitch * 25 * DEG + 0.08);
    const rollD = inp.roll * (30 + 15 * wingW) * DEG;
    const eR = rollD - att.roll, eP = pitchD - att.pitch;
    if (fly) { s.iAtt[0] = clamp(s.iAtt[0] + eR * dt, -0.4, 0.4); s.iAtt[2] = clamp(s.iAtt[2] + eP * dt, -1, 1); }
    const wD = [5 * eR + 4 * s.iAtt[0], -inp.yaw * 1.8, 5 * eP + 4 * s.iAtt[2]];
    if (wingW > 0.5 && V > 6) wD[1] = -G * Math.tan(att.roll) / V * 0.9;         // coordinated turn when wing-borne
    if (fly) s.iAtt[1] = clamp(s.iAtt[1] + (wD[1] - s.w[1]) * dt, -0.6, 0.6);
    const u = [I[0] * 11 * (wD[0] - s.w[0]), I[1] * (7 * (wD[1] - s.w[1]) + 6 * s.iAtt[1]), I[2] * 11 * (wD[2] - s.w[2])];   // torque demand

    // ---- mixer: main motor carries its share while it points down; the roll pair takes over as it swings aft
    let Fv = (inp.altHold ? m * (G + 4 * eVy + 2 * s.iVy) / clamp(att.up, 0.6, 1) : inp.thr * (F.max + M.max)) * hoverW;
    const fans = sstep(0, 0.15, hoverW), sinT = Math.sin(s.tilt * DEG);
    const fwd = (1 - sstep(30, 80, s.tilt)) * (inp.altHold ? 0.78 : inp.thr) * M.max;
    const ex = exitAt(s.tilt), aF = F.r[0], aM = ex.r[0], aR = L.r[0], zArm = R.r[2] - L.r[2];
    let tF = 0, tM = 0, c = 0;
    for (let k = 0; k < 4; k++) {
      const idle = rollShare / 2 * Fv * fans;                      // the roll pair carries its share of the lift (from the static trim)
      const want = Math.max(0, ((Fv - 2 * idle) * aF + 2 * idle * aR - u[2]) / (aF - aM));
      tM = clamp(Math.max(sinT > 0.3 ? want / (sinT * ex.eff) : 0, fwd), 0, M.max);
      const tMv = tM * sinT * ex.eff, S = Fv - tMv, Mo = u[2] - tMv * aM;
      tF = (Mo - S * aR) / (aF - aR); c = (S - tF) / 2;
      const over = Math.max(tF - F.max, 2 * (c - 0.8 * L.max), 0);
      if (over <= 0) break; Fv -= over * 1.4;
    }
    c = Math.max(c, 0);
    const tL = (c + u[0] / zArm) * fans, tR = (c - u[0] / zArm) * fans; tF *= fans;
    const cmd = armed ? [clamp(tF, 0, F.max), clamp(tM, 0, M.max), clamp(tL, 0, L.max), clamp(tR, 0, R.max)] : [0, 0, 0, 0];
    s.cmd = cmd;
    const nozzleD = clamp(Math.asin(clamp(u[1] / (-ex.r[0] * Math.max(s.T[1] * ex.eff, 1.5) * Math.max(sinT, 0.3)), -1, 1)) / DEG, -20, 20);   // yaw: swing the bent jet sideways
    const qbar = 0.5 * RHO * Math.max(V * V, 9);
    const dP = -2.5 * u[2] / (qbar * AERO.tailS * AERO.CLa * -AERO.tailX), dA = 2 * u[0] / (qbar * AERO.tailS * AERO.CLa * AERO.tailZ);
    const tailLD = clamp((dP + dA) / DEG, -25, 25), tailRD = clamp((dP - dA) / DEG, -25, 25);

    // ---- actuator targets ----------------------------------------------------
    // With the nozzle straight nothing aft of the balance point can hold the tail up, so until the wing is flying the
    // controller keeps the nozzle at least partly down, whatever the pilot asks for.
    // Until the fins have airspeed, the only thing that can yaw the aircraft is the bent jet, so the controller keeps the
    // nozzle part way down well past the point where the wing could carry it.
    const dMin = s.onGround ? 0 : 35 * (1 - sstep(6, 17, vb[0]));
    const gearUp = inp.gear !== undefined ? inp.gear : (s.gear > 0.5 ? (vb[0] > 8 ? 1 : 0) : (vb[0] > 11 && !s.onGround ? 1 : 0));
    return { T: cmd, tilt: clamp(Math.max(inp.tilt, dMin), 0, 100), nozzle: nozzleD, tailL: tailLD, tailR: tailRD, gear: gearUp };
  }

  // The physics: actuator targets (thrust N per fan, nozzle deflection and yaw swing deg, tail angles deg, gear 0..1)
  // -> motion. Motors lag, servos slew at their rated speed, then forces are integrated.
  function physics(dt, act) {
    const slew = (v, tgt, rate) => v + clamp(tgt - v, -rate * dt, rate * dt);
    for (let i = 0; i < 4; i++) s.T[i] += (act.T[i] - s.T[i]) * Math.min(1, dt / AERO.motorTau);
    s.gear += clamp(act.gear - s.gear, -AERO.gearRate * dt, AERO.gearRate * dt);
    s.tilt = slew(s.tilt, act.tilt, AERO.tiltRate); s.nozzle = slew(s.nozzle, act.nozzle, AERO.nozzleRate);
    s.tailL = slew(s.tailL, act.tailL, AERO.tailRate); s.tailR = slew(s.tailR, act.tailR, AERO.tailRate);
    const vb = qrot(qinv(s.q), s.wind ? sub(s.v, s.wind) : s.v);   // air velocity in body axes (s.wind: world m/s, optional)
    s.att = attitude(s.q); s.speed = Math.hypot(...s.v); s.alpha = Math.hypot(vb[0], vb[1]) > 1 ? Math.atan2(-vb[1], vb[0]) : 0;

    // ---- forces and torques in body axes ----------------------------------
    let Fb = [0, 0, 0], Tb = [0, 0, 0];
    const push = (f, r) => { Fb = add(Fb, f); Tb = add(Tb, cross(r, f)); };
    const ct = Math.cos(s.tilt * DEG), st = Math.sin(s.tilt * DEG), cn = Math.cos(s.nozzle * DEG), sn = Math.sin(s.nozzle * DEG);
    const mDir = [ct, st * cn, st * sn];                           // a straight nozzle cannot push sideways
    const vAx = vb[0] * mDir[0] + vb[1] * mDir[1] + vb[2] * mDir[2], jet = exitAt(s.tilt), tMain = s.T[1] * jet.eff * clamp(1 - Math.max(vAx, 0) / AERO.pitchSpeed, 0, 1);
    push([0, s.T[0], 0], F.r); push(mul(mDir, tMain), jet.r); push([0, s.T[2], 0], L.r); push([0, s.T[3], 0], R.r);
    Tb = add(Tb, [0, AERO.kq * (F.spin * s.T[0] + L.spin * s.T[2] + R.spin * s.T[3]), 0]); Tb = add(Tb, mul(mDir, AERO.kq * M.spin * s.T[1]));
    const at = (r) => add(vb, cross(s.w, r));
    for (const sg of [-1, 1]) {
      const rw = [AERO.wingX - cg[0], 0, sg * AERO.wingZ]; push(surface(at(rw), AERO.camber, AERO.wingS / 2, 0, AERO.CD0 + AERO.gearCD * (1 - s.gear)), rw);
      const rt = [AERO.tailX - cg[0], 0, sg * AERO.tailZ]; push(surface(at(rt), (sg < 0 ? s.tailL : s.tailR) * DEG, AERO.tailS / 2, AERO.downwash), rt);
    }
    { const rf = [AERO.finX - cg[0], 0.05, 0], vf = at(rf), V2 = vf[0] * vf[0] + vf[2] * vf[2];
      if (V2 > 1e-4) { const b = Math.atan2(vf[2], vf[0]); push([0, 0, -0.5 * RHO * V2 * AERO.finS * 1.1 * Math.sin(2 * b)], rf); }
      Fb[2] -= 0.5 * RHO * vb[2] * Math.abs(vb[2]) * AERO.sideS * 1.1; }
    Tb = sub(Tb, mul(s.w, AERO.rotDamp));

    // ---- integrate ---------------------------------------------------------
    const Fw = add(qrot(s.q, Fb), [0, -m * G, 0]);
    s.Fb = Fb;                                                     // body-axis force without gravity: what an accelerometer feels in the air
    s.v = add(s.v, mul(Fw, dt / m));
    const Iw = [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]], gyro = cross(s.w, Iw);
    s.w = [s.w[0] + (Tb[0] - gyro[0]) / I[0] * dt, s.w[1] + (Tb[1] - gyro[1]) / I[1] * dt, s.w[2] + (Tb[2] - gyro[2]) / I[2] * dt];
    s.p = add(s.p, mul(s.v, dt));
    const dq = qmul(s.q, [s.w[0], s.w[1], s.w[2], 0]); s.q = qnorm(s.q.map((c, i) => c + dq[i] * 0.5 * dt));

    // ---- ground: skids, friction, and settling level -----------------------
    s.onGround = s.p[1] <= rest + 1e-4;
    if (s.onGround) {
      s.p[1] = rest; s.impact = Math.max(s.impact || 0, -s.v[1]);
      if (s.v[1] < 0) s.v[1] = 0;
      const k = Math.min(1, 6 * dt); s.v[0] *= 1 - k; s.v[2] *= 1 - k; s.w = mul(s.w, 1 - Math.min(1, 12 * dt));
      const h = attitude(s.q).heading, lvl = [0, Math.sin(h / 2), 0, Math.cos(h / 2)], a = Math.min(1, 8 * dt);
      const dot = lvl[0] * s.q[0] + lvl[1] * s.q[1] + lvl[2] * s.q[2] + lvl[3] * s.q[3];
      s.q = qnorm(s.q.map((c, i) => c + (lvl[i] * Math.sign(dot || 1) - c) * a));
      s.iVy = Math.min(s.iVy, 0.2);
    }
    s.t += dt;
    return s;
  }
  const step = (dt, inp) => physics(dt, control(dt, inp));
  function reset() { Object.assign(s, { t: 0, p: [0, rest, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0], T: [0, 0, 0, 0], tilt: 90, nozzle: 0, tailL: 0, tailR: 0, iVy: 0, iPitch: 0, iAtt: [0, 0, 0], onGround: true, impact: 0 }); }
  return { s, step, control, physics, reset, cg, rest, m, thrusters: th, hoverThrottle: () => (m * G) / (F.max + M.max) };
}
