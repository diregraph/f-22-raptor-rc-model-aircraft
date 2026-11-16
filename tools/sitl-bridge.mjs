// Flies the F-35B physics from site/js/sim.js with real ArduPilot in charge: ArduPilot SITL talks to this
// process over its JSON simulator interface (UDP 9002), sends servo and motor PWM, and gets back sensors.
//   node tools/sitl-bridge.mjs [--log out.jsonl]
// then start ArduPlane SITL with --model JSON:127.0.0.1 (tools/sitl-run.py does both).
// Axes: sim body +X nose, +Y up, +Z right; ArduPilot body is forward-right-down, world is north-east-down.
// The mapping (x, y, z) -> (x, z, -y) is a proper rotation, used for both.
import dgram from 'node:dgram';
import { createWriteStream } from 'node:fs';
import { createSim } from '../site/js/sim.js';
import { solve, exitDirection } from '../site/js/nozzle.js';

const args = process.argv.slice(2), logPath = args.includes('--log') ? args[args.indexOf('--log') + 1] : null;
const log = logPath ? createWriteStream(logPath) : null;
const G = 9.81, DEG = 180 / Math.PI, EXPO = 0.65;
const sim = createSim(), s = sim.s;
const ch = n => n - 1;                                   // output numbers as in ardupilot/f35b.parm
const OUT = { elevL: ch(1), elevR: ch(2), F: ch(5), M: ch(6), L: ch(7), R: ch(8), s1: ch(10), s2: ch(11), gear: ch(12) };
const TAIL_SIGN = -1;                                    // ArduPilot: higher PWM = trailing edge down? set from the first cruise test

// Motor model: no thrust below 12% throttle, full thrust at 95%, curved between (matches Q_M_SPIN_MIN, Q_M_SPIN_MAX and
// Q_M_THST_EXPO in f35b.parm). The real numbers come from the thrust stand; until then the autopilot's model of its motors is exact.
const SPIN_MIN = 0.12, SPIN_MAX = 0.95;
const thrust = (pwm, max) => { const t = Math.min(Math.max(((pwm - 1000) / 1000 - SPIN_MIN) / (SPIN_MAX - SPIN_MIN), 0), 1); return max * ((1 - EXPO) * t + EXPO * t * t); };
// nozzle-board pulses (deflection, yaw) -> joint angles, as the board solves them -> direction the jet pushes the aircraft
// (sim body axes) -> tilt and side swing. The board's joints follow within a degree (tools/nozzle-firmware-test.mjs).
function nozzleFromServos(p1, p2) {
  const defl = Math.min(Math.max((p1 - 1000) / 10, 0), 100), yaw = Math.min(Math.max((p2 - 1500) / 25, -20), 20);   // Nozzle3BSM.h decode()
  const j = solve(defl, yaw), e = exitDirection(j.a, j.b, j.c), t = [e[0], -e[1], -e[2]];   // flow leaves aft-down; the push is the opposite way
  return { tilt: Math.atan2(Math.hypot(t[1], t[2]), t[0]) * DEG, nozzle: Math.atan2(t[2], t[1]) * DEG };
}
function rotm(q) {                                       // body -> world, sim axes, q = [x, y, z, w]
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
const toNED = v => [v[0], v[2], -v[1]];
const P = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
const mmul = (a, b) => a.map(r => b[0].map((_, j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const T = m => m[0].map((_, j) => m.map(r => r[j]));

const sock = dgram.createSocket('udp4');
let lastFrame = -1, vPrev = [0, 0, 0], rc = null;
sock.on('message', (buf, rinfo) => {
  const magic = buf.readUInt16LE(0); if (magic !== 18458 && magic !== 29569) return;
  const rate = buf.readUInt16LE(2), frame = buf.readUInt32LE(4), n = magic === 18458 ? 16 : 32;
  const pwm = Array.from({ length: n }, (_, i) => buf.readUInt16LE(8 + 2 * i));
  if (frame < lastFrame) { sim.reset(); vPrev = [0, 0, 0]; }                    // SITL restarted
  if (frame === lastFrame) { reply(rinfo); return; }
  lastFrame = frame;
  const dt = Math.min(1 / Math.max(rate, 1), 1 / 200), th = sim.thrusters, nz = nozzleFromServos(pwm[OUT.s1], pwm[OUT.s2]);
  const tail = p => TAIL_SIGN * (p - 1500) / 500 * 25;
  sim.physics(dt, { T: [OUT.F, OUT.M, OUT.L, OUT.R].map((c, i) => thrust(pwm[c], th[i].max) * thrustScale[i]),
    tilt: nz.tilt, nozzle: nz.nozzle, tailL: tail(pwm[OUT.elevL]), tailR: tail(pwm[OUT.elevR]), gear: pwm[OUT.gear] < 1500 ? 1 : 0 });   // ArduPilot retracts to the low end of the gear output
  const aw = s.onGround ? [0, 0, 0] : s.v.map((v, i) => (v - vPrev[i]) / dt); vPrev = s.v.slice();
  const Rw = rotm(s.q), sf = mmul(T(Rw), [[aw[0]], [aw[1] + G], [aw[2]]]).map(r => r[0]);   // specific force, body axes
  const Rn = mmul(mmul(P, Rw), T(P));
  s.out = { sf, Rn, pwm };
  if (log && frame % 60 === 0) log.write(JSON.stringify({ t: +s.t.toFixed(3), p: s.p.map(v => +v.toFixed(3)), q: s.q.map(v => +v.toFixed(4)), v: s.v.map(v => +v.toFixed(2)),
    T: s.T.map(v => +v.toFixed(2)), tilt: +s.tilt.toFixed(1), nozzle: +s.nozzle.toFixed(1), tailL: +s.tailL.toFixed(1), tailR: +s.tailR.toFixed(1), gear: +s.gear.toFixed(2), pwm: [1, 2, 5, 6, 7, 8, 9, 10, 11, 12].map(c => pwm[c - 1]) }) + '\n');
  reply(rinfo);
});
function reply(rinfo) {
  const o = s.out; if (!o) return;
  const Rn = o.Rn, vb = mmul(T(rotm(s.q)), s.v.map(v => [v])).map(r => r[0]);
  const msg = { timestamp: s.t, imu: { gyro: toNED(s.w), accel_body: toNED(o.sf) }, position: toNED(s.p.map((v, i) => i === 1 ? v - sim.rest : v)),
    velocity: toNED(s.v), attitude: [Math.atan2(Rn[2][1], Rn[2][2]), -Math.asin(Math.max(-1, Math.min(1, Rn[2][0]))), Math.atan2(Rn[1][0], Rn[0][0])],
    airspeed: Math.max(0, vb[0]) };
  if (rc) msg.rc = rc;
  sock.send('\n' + JSON.stringify(msg) + '\n', rinfo.port, rinfo.address);
}
// optional stick input from the scenario driver on UDP 9003: {"rc_1":1500,...}
// Scenario control on UDP 9003 from tools/sitl-run.py: {"rc": {...}, "wind": [n, e, d] m/s, "thrustScale": [F, M, L, R]}
let thrustScale = [1, 1, 1, 1];
const ctl = dgram.createSocket('udp4');
ctl.on('message', b => { try { const m = JSON.parse(b.toString()); if (m.rc) rc = m.rc;
  if (m.wind) s.wind = [m.wind[0], -m.wind[2], m.wind[1]]; if (m.thrustScale) thrustScale = m.thrustScale; } catch {} });
ctl.bind(9003);
sock.bind(9002, () => console.log('sitl-bridge: waiting for ArduPilot on UDP 9002'));
process.on('SIGINT', () => { log?.end(); process.exit(0); });
