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
export const NOZZLE = { alpha: 40, bore: 80, gearRatio: 2, servoTravel: 170, maxDeflection: 100, maxYaw: 20 };
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

// inverse: wanted deflection (0 = straight aft, 90 = straight down) and yaw swing -> the three joint angles
export function solve(deflection, yaw = 0, alpha = NOZZLE.alpha) {
  const d = Math.min(Math.max(deflection, 0), NOZZLE.maxDeflection), sa = Math.sin(alpha * RAD);
  const b = 2 * Math.asin(Math.min(1, Math.sin(d * RAD / 4) / sa)) / RAD;        // joints 2 and 3 turn together
  const bz = Math.max(b, 0.5), e = exitDirection(0, bz, -bz, alpha);              // near straight, hold joint 1 at its limiting angle so it never jumps
  const az = Math.atan2(e[2], -e[1]) / RAD;                                        // where the bend points, measured from straight down toward +Z
  const a = az - Math.min(Math.max(yaw, -NOZZLE.maxYaw), NOZZLE.maxYaw);          // joint 1 turns it back to straight down, then adds the yaw swing
  return { a, b, c: -b };
}
// joint angle -> servo angle (degrees from the servo's own centre), given where each joint sits at servo centre
export function servoAngles(j, centre = jointCentres()) {
  return { s1: (j.a - centre.a) * NOZZLE.gearRatio, s2: (j.b - centre.b) * NOZZLE.gearRatio, s3: (j.c - centre.c) * NOZZLE.gearRatio };
}
export function jointCentres() {   // mid-travel of each joint over the whole working range
  const full = solve(NOZZLE.maxDeflection, 0), a0 = solve(0, 0).a;
  const aMin = Math.min(a0, full.a) - NOZZLE.maxYaw, aMax = Math.max(a0, full.a) + NOZZLE.maxYaw;
  return { a: (aMin + aMax) / 2, b: full.b / 2, c: full.c / 2, aRange: aMax - aMin, bRange: full.b };   // c is negative: joint 3 mirrors joint 2
}
