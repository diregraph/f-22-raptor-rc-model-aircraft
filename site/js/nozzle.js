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
// Drive: no servo rides on the nozzle. Two servos in the body each turn a cord drum.
//   servo 1 -> the bearing-1 collar, which is keyed to segment 1: it sets joint 1 (angle a)
//   servo 2 -> a free ring just behind bearing 1; cords from that ring cross to the bearing-2 collar, so the ring sits at a + k*b
//   joint 3 is not driven at all: a cord loop from segment 1 to the bearing-3 collar makes it mirror joint 2
// cord: radius of the cord centre on each pulley, mm (cad/propulsion.py prints the same numbers)
export const NOZZLE = { alpha: 40, bore: 80, servoTravel: 170, maxDeflection: 100, maxYaw: 20, cord: { band1: 48.3, ring: 50.0, collar: 53.4, drum: 27.5 },
  len: [58, 104, 56] };   // len: bearing 1 to 2, 2 to 3, 3 to the exit, mm (cad/propulsion.py L1, L2, L3)
export const ringRatio = () => NOZZLE.cord.collar / NOZZLE.cord.ring;            // k: ring degrees per degree of joint 2
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

// past 90 degrees the yaw swing is tapered from 20 to 8 degrees: it keeps the nozzle clear of the tail booms and the ring inside the servo's travel
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
// what the two cord pulleys do: the bearing-1 collar follows joint 1, the drive ring leads it by k times joint 2
export const pulleys = j => ({ band: j.a, ring: j.a + ringRatio() * j.b });
// joint angles -> servo angles (degrees from each servo's own centre)
export function servoAngles(j, centre = jointCentres()) {
  const p = pulleys(j), c = NOZZLE.cord;
  return { s1: (p.band - centre.band) * c.band1 / c.drum, s2: (p.ring - centre.ring) * c.ring / c.drum };
}
export function jointCentres() {   // mid-travel of each pulley over every pose the mixer can ask for
  let band = [1e9, -1e9], ring = [1e9, -1e9];
  for (let d = 0; d <= NOZZLE.maxDeflection; d += 1) for (const y of [-1, 0, 1]) {
    const p = pulleys(solve(d, y * yawLimit(d)));
    band = [Math.min(band[0], p.band), Math.max(band[1], p.band)]; ring = [Math.min(ring[0], p.ring), Math.max(ring[1], p.ring)];
  }
  return { band: (band[0] + band[1]) / 2, ring: (ring[0] + ring[1]) / 2, bandRange: band[1] - band[0], ringRange: ring[1] - ring[0], bRange: solve(NOZZLE.maxDeflection, 0).b };
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
