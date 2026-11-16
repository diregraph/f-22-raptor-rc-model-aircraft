// Three-bearing swivel nozzle: geometry and control maths. Pure functions, shared by the bench viewer,
// the headless check (tools/nozzle-test.mjs) and, ported line for line, the flight-controller firmware.
//
// Nozzle frame: +X is the flow direction with the nozzle straight, +Y up, +Z right (same as the aircraft
// with X reversed: the nozzle points aft). Three joints in series:
//   joint 1  turns everything about X (the duct axis)
//   joint 2  turns about an axis canted ALPHA from the duct axis
//   joint 3  turns about an axis canted ALPHA the other way
// Turning joints 2 and 3 by equal and opposite angles (+b, -b) bends the flow by 4*asin(sin(ALPHA)*sin(b/2)); joint 1 then
// rotates that bend to point straight down and adds the small left/right swing used for yaw.
// Drive: one gearmotor per joint, as on proven 3BSM models. Each bearing collar is a ring gear keyed to the part downstream of
// the bearing; an N20 gearmotor with a magnetic encoder on the part upstream turns it through a 14-tooth pinion. At power-up each
// motor drives its joint slowly onto a stop (a lug on the collar meets the motor plate) and counts from there.
// gear: ring teeth per collar, pinion teeth, gearbox ratio, encoder counts per motor turn (both edges, both channels), and the
// joint angle at each homing stop (cad/propulsion.py prints the same numbers)
export const NOZZLE = { alpha: 40, bore: 80, maxDeflection: 100, maxYaw: 20,
  gear: { ring: [100, 110, 110], pinion: 14, gearbox: 100, cpr: 12, stop: [-62, -8, 8] },
  len: [58, 104, 56] };   // len: bearing 1 to 2, 2 to 3, 3 to the exit, mm (cad/propulsion.py L1, L2, L3)
const RAD = Math.PI / 180;

const rot = (ax, t) => {   // Rodrigues rotation matrix about unit axis ax
  const [x, y, z] = ax, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
};
const mv = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const mm = (a, b) => a.map((r, i) => b[0].map((_, j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
export const axes = (alpha = NOZZLE.alpha) => ({ n1: [1, 0, 0], n2: [Math.cos(alpha * RAD), Math.sin(alpha * RAD), 0], n3: [Math.cos(alpha * RAD), -Math.sin(alpha * RAD), 0] });

// forward kinematics: joint angles (degrees) -> unit exit direction in the nozzle frame
export function exitDirection(a, b, c, alpha = NOZZLE.alpha) {
  const { n1, n2, n3 } = axes(alpha);
  return mv(mm(mm(rot(n1, a * RAD), rot(n2, b * RAD)), rot(n3, c * RAD)), [1, 0, 0]);
}
export const bendFor = (b, alpha = NOZZLE.alpha) => 4 * Math.asin(Math.sin(alpha * RAD) * Math.sin(b * RAD / 2)) / RAD;

// past 90 degrees the yaw swing is tapered from 20 to 8 degrees: it keeps the nozzle clear of the tail booms
export const yawLimit = d => NOZZLE.maxYaw - Math.max(0, d - 90) * 1.2;

// inverse: wanted deflection (0 = straight aft, 90 = straight down) and yaw swing -> the three joint angles
export function solve(deflection, yaw = 0, alpha = NOZZLE.alpha) {
  const d = Math.min(Math.max(deflection, 0), NOZZLE.maxDeflection), sa = Math.sin(alpha * RAD);
  const b = 2 * Math.asin(Math.min(1, Math.sin(d * RAD / 4) / sa)) / RAD;        // joints 2 and 3 turn together
  const bz = Math.max(b, 0.5), e = exitDirection(0, bz, -bz, alpha);              // near straight, hold joint 1 at its limiting angle so it never jumps
  const az = Math.atan2(e[2], -e[1]) / RAD;                                        // where the bend points, measured from straight down toward +Z
  const yl = yawLimit(d);
  const a = az - Math.min(Math.max(yaw, -yl), yl);                               // joint 1 turns it back to straight down, then adds the yaw swing
  return { a, b, c: -b };
}
// joint angle -> encoder counts from the homing stop, and back. Joint i turns ring/pinion times slower than the gearbox output.
export const countsPerDeg = i => NOZZLE.gear.ring[i] / NOZZLE.gear.pinion * NOZZLE.gear.gearbox * NOZZLE.gear.cpr / 360;
export const jointCounts = j => [j.a, j.b, j.c].map((q, i) => (q - NOZZLE.gear.stop[i]) * countsPerDeg(i));
export function travel() {   // range of each joint over every pose the mixer can ask for
  const r = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]];
  for (let d = 0; d <= NOZZLE.maxDeflection; d += 1) for (const y of [-1, 0, 1]) {
    const j = solve(d, y * yawLimit(d)); [j.a, j.b, j.c].forEach((q, i) => { r[i] = [Math.min(r[i][0], q), Math.max(r[i][1], q)]; });
  }
  return r;
}

// Where everything is for given joint angles: bearing centres p1..p3, exit centre e, jet direction d, the three bearing
// axes in their current orientation, and the mid-points of segments 2 and 3 (used for their weight). Nozzle frame, mm.
export function chain(a, b, c, alpha = NOZZLE.alpha) {
  const { n1, n2, n3 } = axes(alpha), [l1, l2, l3] = NOZZLE.len;
  const R1 = rot(n1, a * RAD), R12 = mm(R1, rot(n2, b * RAD)), R123 = mm(R12, rot(n3, c * RAD));
  const along = (p, R, l) => { const v = mv(R, [l, 0, 0]); return [p[0] + v[0], p[1] + v[1], p[2] + v[2]]; };
  const p1 = [0, 0, 0], p2 = [l1, 0, 0], p3 = along(p2, R12, l2), e = along(p3, R123, l3);
  return { p: [p1, p2, p3], e, d: mv(R123, [1, 0, 0]), n: [n1, mv(R1, n2), mv(R12, n3)], up: [[1, 0, 0], [1, 0, 0], mv(R12, [1, 0, 0])],
    mid2: along(p2, R12, l2 / 2), mid3: along(p3, R123, l3 / 2) };
}
