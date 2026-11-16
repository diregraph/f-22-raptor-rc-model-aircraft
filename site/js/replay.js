// Plays back a flight recorded with real ArduPilot (tools/sitl-run.py) through the same interface as createSim(),
// so the 3D model, HUD and camera code in app.js draw it unchanged. Data: site/analysis/sitl/<scenario>.json.
import { createSim } from './sim.js';

export const FLIGHTS = [
  { id: 'hover', name: 'Hover', blurb: 'Take-off, 60 s position hold, quarter turn, landing' },
  { id: 'mission', name: 'Mission', blurb: 'Take-off, transition, wing-borne lap, back-transition, landing' },
  { id: 'gust', name: 'Gust', blurb: 'Hover in 3 m/s wind with a 5 m/s side gust' },
  { id: 'weak-roll-motor', name: 'Weak motor', blurb: 'Left roll fan drops to 70% thrust in the hover' },
];

const lerp = (a, b, k) => a + (b - a) * k;

export async function loadReplay(id, batteryX) {
  const d = await (await fetch(`analysis/sitl/${id}.json`)).json();
  const ref = createSim(batteryX), P = d.physics, A = d.autopilot || [], E = (d.events || []).filter(e => e.mode);
  // start a second before the motors spin up, end a few seconds after they stop
  const firstOn = P.findIndex(r => r.T.some(t => t > 0.05)), lastOn = P.length - 1 - [...P].reverse().findIndex(r => r.T.some(t => t > 0.05));
  const t0 = P[Math.max(0, firstOn - 20)].t, t1 = P[Math.min(P.length - 1, lastOn + 60)].t;
  const s = { ...ref.s, t: 0, att: { roll: 0, pitch: 0, heading: 0 } };
  let i = Math.max(0, firstOn - 20), clock = t0, done = false;
  const modeAt = t => { let m = ''; for (const e of E) if (e.t <= t + 0.05) m = e.mode; return m; };
  const apAt = t => { let lo = 0, hi = A.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (A[mid].t < t) lo = mid; else hi = mid; } return A[hi] || null; };
  function attitude(q) {
    const [x, y, z, w] = q, f = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
    const up = 1 - 2 * (x * x + z * z), ry = 2 * (y * z - x * w);
    return { pitch: Math.asin(Math.max(-1, Math.min(1, f[1]))), heading: Math.atan2(-f[2], f[0]), roll: Math.atan2(-ry, up), up };
  }
  function step(dt) {
    if (done) return s;
    clock += dt;
    if (clock >= t1) { clock = t1; done = true; }
    while (i < P.length - 2 && P[i + 1].t <= clock) i++;
    const a = P[i], b = P[i + 1] || a, k = b.t > a.t ? Math.min(1, Math.max(0, (clock - a.t) / (b.t - a.t))) : 0;
    s.p = a.p.map((v, j) => lerp(v, b.p[j], k)); s.v = a.v.map((v, j) => lerp(v, b.v[j], k));
    let q = a.q.map((v, j) => lerp(v, (a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3] < 0 ? -1 : 1) * b.q[j], k));
    const n = Math.hypot(...q); s.q = q.map(c => c / n);
    s.T = a.T.map((v, j) => lerp(v, b.T[j], k)); s.tilt = lerp(a.tilt, b.tilt, k); s.nozzle = lerp(a.nozzle, b.nozzle, k);
    s.tailL = lerp(a.tailL, b.tailL, k); s.tailR = lerp(a.tailR, b.tailR, k); s.gear = lerp(a.gear, b.gear, k);
    s.att = attitude(s.q); s.speed = Math.hypot(...s.v); s.onGround = s.p[1] <= ref.rest + 0.02; s.impact = 0;
    s.wingW = s.tilt < 5 ? 1 : s.tilt < 60 ? 0.3 : 0; s.t = clock - t0;
    s.apMode = modeAt(clock); s.ap = apAt(clock); s.done = done;
    return s;
  }
  function reset() { i = Math.max(0, firstOn - 20); clock = t0; done = false; step(0); }
  const seek = sec => { reset(); step(sec); };
  reset();
  return { s, step, reset, seek, rest: ref.rest, m: ref.m, cg: ref.cg, thrusters: ref.thrusters, duration: t1 - t0, meta: d, replay: true };
}
