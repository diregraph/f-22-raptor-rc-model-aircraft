// Single source of truth for the F-35B VTOL digital twin.
// Units: millimetres, grams, degrees. Axes: +X nose, +Y up, +Z starboard (right wing).
// Everything a later simulator needs (masses, stations, thrusters, joints) lives here.

export const D = {
  xNose: 508, xNoseJoin: 230, xFanAft: 30, xTrayAft: -170, xBridgeAft: -260, xNotch: -215, xBoomAft: -430,
  halfW: 108, yT: 22, longZ: 92, tubeR: 4,
  fanX: 130, fanR: 81,
  pivotX: -300, propOffset: 58,
  sparX: -130, sparY: -9, sparHalf: 338, rollX: -108, rollZ: 240, rollPadY: -27, rollPropY: 2, tubeFront: 212, tubeRear: -425,
  wing: { rootZ: 108, midZ: 180, tipZ: 345, rootLE: 70, rootC: 300, tipC: 95, sweep: 34, y: -9 },
  stab: { pivotX: -400, pivotY: -9, rootZ: 110, tipZ: 217, rootLE: -328, rootC: 160, tipC: 62, sweep: 34 },
  fin: { rootLE: -255, rootC: 170, tipC: 55, h: 150, sweep: 40, cant: 25, z: 96 },
  groundY: -85,
  battery: { xDefault: -52, xMin: -56, xMax: -52 },
};

// Thrust figures are ESTIMATES until measured on the kitchen-scale thrust stand.
export const THRUSTERS = [
  { id: 'F', name: 'Front lift', part: 'motorF', pos: [D.fanX, 10, 0], maxG: 1000, spin: 'CW', prop: '6 in' },
  { id: 'M', name: 'Main (vectored)', part: 'motorM', pos: [D.pivotX, 0, 0], maxG: 1000, spin: 'CCW', prop: '6 in' },
  { id: 'L', name: 'Roll left', part: 'motorL', pos: [D.rollX, D.rollPropY, -D.rollZ], maxG: 500, spin: 'CW', prop: '4 in' },
  { id: 'R', name: 'Roll right', part: 'motorR', pos: [D.rollX, D.rollPropY, D.rollZ], maxG: 500, spin: 'CCW', prop: '4 in' },
];

export const JOINTS = {
  tilt: { axis: 'Z', pivot: [D.pivotX, 0, 0], min: 0, max: 100, servo: 'MG90S', note: '0 = forward flight, 90 = hover, 100 = braking / backing up' },
  yaw: { axis: 'local Y of tilt yoke', min: -20, max: 20, servo: 'MG90S', note: 'Swings the main thrust left/right. In hover this is yaw control.' },
  stab: { axis: 'Z', pivot: [D.stab.pivotX, 0, 0], min: -25, max: 25, servo: '9 g', note: 'All-moving tails: together = pitch, opposite = roll.' },
};

export const MATERIALS = {
  'LW-PLA': { color: '#9aa4ad', blurb: 'Foaming PLA, single wall. Light aero shells; cheap to reprint after a crash.' },
  'PETG': { color: '#ff7a1a', blurb: 'Tough, slightly flexible. Every load-bearing or snap-fit part.' },
  'Aluminium': { color: '#cfd4d9', blurb: '8 mm x 1 mm tube from a hardware store. Carbon arrow shafts save about 55 g.' },
  'Bought': { color: '#4aa3ff', blurb: 'Off-the-shelf electronics and hardware.' },
};

export const GROUPS = ['Backbone', 'Airframe shells', 'Wings & tail', 'Propulsion', 'Vectoring mount', 'Electronics', 'Landing gear'];

export const STEPS = [
  { n: 1, title: 'Backbone', text: 'Lay out the two 637 mm longerons and the 676 mm spar. Nothing is fixed yet: the shells slide on first, then the PETG parts clip up from below and lock each shell in place.' },
  { n: 2, title: 'Lift-fan mount', text: 'Bolt the front motor to the fan spider (4 x M3). With the fan bay on the tubes, snap the spider up onto both longerons through the four pockets in the bay floor.' },
  { n: 3, title: 'Vectoring mount', text: 'Snap both tilt bearings onto the longerons. Fit the tilt servo to the left bearing, seat the yoke on its horn and stub axle. Yaw servo drops into the yoke; cradle seats on its horn. Bolt on the main motor.' },
  { n: 4, title: 'Centre section and skids', text: 'Slide the centre section onto the longerons behind the fan bay. Clip both skids up through the floor pockets: they lock it. Drop in the battery tray.' },
  { n: 5, title: 'Electronics', text: 'Flight-controller sled on the left of the bay, receiver and regulator on the right, speed controllers stacked in pairs behind the spar. Plug in servos and motors. Bench-test with propellers OFF.' },
  { n: 6, title: 'Body shells', text: 'Fan bay slides on from the front until the tubes bottom out. Aft bridge and the two tail booms slide on from the rear. Push the spar through the centre section, across the bay, and clip a carrier block up onto each longeron around it.' },
  { n: 7, title: 'Tail', text: 'Tail servos drop into the boom pockets from below. Each stabilator turns on a 3 mm wire pushed through the boom. Fins seat in their sockets on the boom tops.' },
  { n: 8, title: 'Wings and roll motors', text: 'Slide each inner panel along the spar into its root socket, then the outer panel with its skewer pin. Pin each wing tip to the spar. Clip a roll-motor mount onto the spar inside each wing duct and pin it.' },
  { n: 9, title: 'Nose', text: 'Glue the nose cone to the nose section on its two skewer dowels, and the PETG plug into the back, once. Push the nose into the fan bay and drop the two skewer pins in from the top. Canopy is glued or taped on.' },
  { n: 10, title: 'Fly-ready', text: 'Strap in the battery and slide it to set the balance. Fit the hatch: tongue in at the front, press down at the rear until the latch clicks. Propellers go on LAST.' },
];

// [id, name, group, material, process, mass g, [x,y,z] station, step, lock, note]
const rows = [
  // ---- Backbone
  ['longeronL', 'Longeron, left', 'Backbone', 'Aluminium', 'Cut', 38, [-106,  0,  -92], 1, 'Everything snaps onto this tube with C-clips.', '8 mm tube, 637 mm long. Runs nose to tail and doubles as the tail boom.'],
  ['longeronR', 'Longeron, right', 'Backbone', 'Aluminium', 'Cut', 38, [-106,  0,  92], 1, 'Everything snaps onto this tube with C-clips.', '8 mm tube, 637 mm long.'],
  ['spar', 'Wing spar', 'Backbone', 'Aluminium', 'Cut', 40, [-130, -9, 0], 1, 'Slides through both carrier blocks and across the electronics bay.', '8 mm tube, 676 mm long. Carries both wings and both roll-motor mounts, so roll loads never pass through printed shells.'],
  ['sparCarrier', 'Spar carrier', 'Backbone', 'PETG', 'Print', 15, [-130, -9, 0], 1, 'Each block clips up onto its longeron through a pocket in the body floor; the spar slides through both.', 'A pair of blocks in one file. The spar ties them together and sets the airframe square. The notch under each bore carries the roll-motor wires.'],
  // ---- Airframe shells
  ['nose', 'Nose section', 'Airframe shells', 'LW-PLA', 'Print', 58, [300, -4, 0], 9, 'Pushes onto the nose plug; two 3 mm bamboo-skewer pins drop in from the top.', 'Rear half of the nose. Carries the canopy and the PETG plug.'],
  ['noseCone', 'Nose cone', 'Airframe shells', 'LW-PLA', 'Print', 18, [425, -6, 0], 9, 'Glued to the nose section; two 3 mm bamboo-skewer dowels line it up.', 'The nose is 278 mm long, taller than the printer, so it prints in two pieces. This tip is the first thing to hit the ground: keep spares.'],
  ['noseRing', 'Nose plug', 'Airframe shells', 'PETG', 'Print', 17, [224,  -6,  0], 9, 'Glued into the back of the nose. Plugs 12 mm into the fan bay.', 'A hard PETG collar so the soft nose seats the same way every time.'],
  ['canopy', 'Canopy', 'Airframe shells', 'PETG', 'Print', 15, [335, 45, 0], 9, 'Glued or taped to the nose.', 'Print in clear PETG, vase mode.'],
  ['fanbay', 'Lift-fan bay', 'Airframe shells', 'LW-PLA', 'Print', 86, [135, -6, 0], 6, 'Slides onto both longerons from the front until the tubes bottom out; the fan spider clips in from below and locks it.', '162 mm duct, 84 mm deep, for the 152 mm (6 in) propeller. The dark recesses at the front corners are the intakes.'],
  ['tray', 'Centre tray', 'Airframe shells', 'LW-PLA', 'Print', 93, [-70,  -18,  0], 4, 'Slides onto both longerons; the skids and spar carrier blocks clip on through its floor and lock it.', 'Open-top bay for battery and electronics, with pockets in the floor for the skids.'],
  ['hatch', 'Top hatch', 'Airframe shells', 'LW-PLA', 'Print', 47, [-70,  26,  0], 10, 'Front tongue under the fan bay, rear PETG latch. No tools.', 'Lift off for battery swaps. The dorsal spine stiffens it.'],
  ['aftBridge', 'Aft bridge', 'Airframe shells', 'LW-PLA', 'Print', 41, [-210,  -6,  0], 6, 'Slides onto the longerons between the centre section and the booms.', 'U-shaped: the notch is the swing space for the main propeller. The spar passes through it.'],
  ['boomL', 'Tail boom, left', 'Airframe shells', 'LW-PLA', 'Print', 10, [-345, 0, -96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  ['boomR', 'Tail boom, right', 'Airframe shells', 'LW-PLA', 'Print', 11, [-345, 0, 96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  // ---- Wings & tail
  ['wingInL', 'Wing, inner left', 'Wings & tail', 'LW-PLA', 'Print', 28, [-80, -9, -142], 8, 'Slides along the spar; the root keys 5 mm into a socket in the body.', 'Print upright (span vertical), placed diagonally on the bed: the root chord is 304 mm.'],
  ['wingInR', 'Wing, inner right', 'Wings & tail', 'LW-PLA', 'Print', 28, [-80, -9, 142], 8, 'Slides along the spar; the root keys 5 mm into a socket in the body.', 'Print upright (span vertical), placed diagonally on the bed: the root chord is 304 mm.'],
  ['wingOutL', 'Wing, outer left', 'Wings & tail', 'LW-PLA', 'Print', 22, [-105, -9, -262], 8, 'Slides on the spar; a skewer pin aligns it to the inner panel and a 2 mm pin through the tip and spar holds both panels on.', 'Has the 110 mm duct for the roll propeller. The spar crosses the duct and carries the motor mount.'],
  ['wingOutR', 'Wing, outer right', 'Wings & tail', 'LW-PLA', 'Print', 22, [-105, -9, 262], 8, 'Slides on the spar; a skewer pin aligns it to the inner panel and a 2 mm pin through the tip and spar holds both panels on.', 'Has the 110 mm duct for the roll propeller. The spar crosses the duct and carries the motor mount.'],
  ['hatchLatch', 'Hatch latch', 'Airframe shells', 'PETG', 'Print', 1, [-158, 17, 0], 10, 'Glued into the rear of the hatch; its ridge clicks into a groove in the centre section.', 'The only spring part on the hatch. Print a few.'],
  ['stabL', 'Stabilator, left', 'Wings & tail', 'LW-PLA', 'Print', 11, [-410, -9, -156], 7, 'Turns on a 3 mm wire through the boom; pushrod hooks into the horn under the root.', 'All-moving tail. Both together = pitch, opposite = roll.'],
  ['stabR', 'Stabilator, right', 'Wings & tail', 'LW-PLA', 'Print', 11, [-410, -9, 156], 7, 'Turns on a 3 mm wire through the boom; pushrod hooks into the horn under the root.', 'All-moving tail.'],
  ['finL', 'Fin, left', 'Wings & tail', 'LW-PLA', 'Print', 15, [-320, 80, -125], 7, 'Root sits in a matching socket moulded into the boom top; glue or tape.', 'Fixed, canted 25 degrees. No rudder: yaw comes from the vectored motor.'],
  ['finR', 'Fin, right', 'Wings & tail', 'LW-PLA', 'Print', 15, [-320, 80, 125], 7, 'Root sits in a matching socket moulded into the boom top; glue or tape.', 'Fixed, canted 25 degrees.'],
  // ---- Propulsion
  ['fanSpider', 'Lift-fan spider', 'Propulsion', 'PETG', 'Print', 32, [130, -12, 0], 2, 'Four C-clips onto the longerons.', 'X-brace that carries the front motor in the middle of the duct.'],
  ['motorF', 'Front lift motor', 'Propulsion', 'Bought', 'Owned', 34, [130, 0, 0], 2, '4 x M3 screws into the spider pad.', 'EMAX ECO II 2306 1700KV. Spins clockwise.'],
  ['propF', 'Front propeller, 6 in', 'Propulsion', 'Bought', 'Buy', 6, [130, 17, 0], 10, 'Motor nut. Fit last.', '6040 or 6045, clockwise. Main crash consumable.'],
  ['podL', 'Roll motor mount, left', 'Propulsion', 'PETG', 'Print', 5, [-118, -22, -240], 8, 'Clips up onto the spar inside the wing duct; a 2 mm pin through clip and spar stops it sliding.', 'Hangs the motor just ahead of the spar so the propeller sits at the upper surface of the wing. Replaces the old wing-tip pod.'],
  ['podR', 'Roll motor mount, right', 'Propulsion', 'PETG', 'Print', 5, [-118, -22, 240], 8, 'Clips up onto the spar inside the wing duct; a 2 mm pin through clip and spar stops it sliding.', 'Hangs the motor just ahead of the spar so the propeller sits at the upper surface of the wing. Replaces the old wing-tip pod.'],
  ['motorL', 'Roll motor, left', 'Propulsion', 'Bought', 'Owned', 34, [-108, -14, -240], 8, '4 x M3 screws up through the mount pad.', 'EMAX ECO II 2306 1700KV, buried in the wing. Carries part of the weight in hover and speeds up or slows down to roll.'],
  ['motorR', 'Roll motor, right', 'Propulsion', 'Bought', 'Owned', 34, [-108, -14, 240], 8, '4 x M3 screws up through the mount pad.', 'EMAX ECO II 2306 1700KV, buried in the wing. Opposite spin to the left one.'],
  ['propL', 'Roll propeller, left, 4 in', 'Propulsion', 'Bought', 'Buy', 4, [-108, 2, -240], 10, 'Motor nut. Fit last.', '4 in three-blade, turning in a 110 mm duct through the wing.'],
  ['propR', 'Roll propeller, right, 4 in', 'Propulsion', 'Bought', 'Buy', 4, [-108, 2, 240], 10, 'Motor nut. Fit last.', '4 in three-blade, turning in a 110 mm duct through the wing.'],
  // ---- Vectoring mount
  ['bearingL', 'Tilt bearing, left', 'Vectoring mount', 'PETG', 'Print', 8, [-300, 0, -92], 3, 'C-clip onto the longeron.', 'Holds the tilt servo.'],
  ['bearingR', 'Tilt bearing, right', 'Vectoring mount', 'PETG', 'Print', 7, [-300, 0, 92], 3, 'C-clip onto the longeron.', 'Plain bearing for the yoke stub axle.'],
  ['tiltServo', 'Tilt servo', 'Vectoring mount', 'Bought', 'Owned', 14, [-306, 0, -73], 3, 'Slides into the bearing plate window from inboard; two servo screws.', 'TowerPro MG90S (metal gears). Rotates the yoke 0 to 100 degrees.'],
  ['yoke', 'Tilt yoke', 'Vectoring mount', 'PETG', 'Print', 20, [-300, 0, 12], 3, 'Stock servo horn sits in a recess on the left end; stub axle runs in the right bearing.', 'The thrust line passes through this axis, so the servo only fights friction, not thrust.'],
  ['yawServo', 'Yaw servo', 'Vectoring mount', 'Bought', 'Owned', 14, [-306, 2, 0], 3, 'Drops into the yoke frame from above; two servo screws.', 'TowerPro MG90S. Swings the motor 20 degrees each way.'],
  ['cradle', 'Motor cradle', 'Vectoring mount', 'PETG', 'Print', 6, [-322, 0, 0], 3, 'Stock servo horn sits in a recess under the top arm; a printed pin pivots in the yoke stirrup.', 'C-bracket that wraps the yaw servo.'],
  ['motorM', 'Main motor', 'Vectoring mount', 'Bought', 'Owned', 34, [-342, 0, 0], 3, '4 x M3 screws into the cradle.', 'EMAX ECO II 2306 1700KV. Spins anticlockwise to cancel the front motor torque.'],
  ['propM', 'Main propeller, 6 in', 'Vectoring mount', 'Bought', 'Buy', 6, [-358, 0, 0], 10, 'Motor nut. Fit last.', '6040 or 6045, anticlockwise (pusher).'],
  // ---- Electronics
  ['battery', 'Battery, 4-cell 3300 mAh', 'Electronics', 'Bought', 'Owned', 370, [-52,  -3,  0], 10, 'Hook-and-loop strap on the tray.', 'Heaviest part. It sits against the front of the bay, just ahead of the spar, with only a few millimetres of slide.'],
  ['batteryTray', 'Battery tray', 'Electronics', 'PETG', 'Print', 14, [-52,  -19,  0], 4, 'Sits on the bay floor and slides fore and aft; hook-and-loop underneath.', 'Lets you shift the battery to trim balance without tools.'],
  ['fcSled', 'Flight-controller sled', 'Electronics', 'PETG', 'Print', 7, [-66, -15, -55], 5, 'Stands on the bay floor on two feet; hook-and-loop underneath.', 'Carries the ESP32 and gyro so the whole brain lifts out for bench work.'],
  ['esp32', 'ESP32 DevKit v1', 'Electronics', 'Bought', 'Owned', 10, [-52, -7, -55], 5, 'Pin headers into the sled socket.', 'Runs madflight. Reads the gyro and receiver, drives 4 motors and 4 servos.'],
  ['imu', 'Gyro board (MPU6050)', 'Electronics', 'Bought', 'Buy', 3, [-98, -8, -55], 5, 'Foam tape on the sled.', 'Sits close to the balance point so it feels rotation, not sideways shake.'],
  ['rx', 'Receiver FS-iA6B', 'Electronics', 'Bought', 'Owned', 15, [-52, -7, 55], 5, 'Snap clip.', 'Set to PPM output: one wire carries all channels.'],
  ['ubec', '5 V regulator', 'Electronics', 'Bought', 'Buy', 12, [-95, -13, 68], 5, 'Snap clip.', 'Feeds servos and ESP32 from the flight battery.'],
  ['escF', 'Speed controller, front', 'Electronics', 'Bought', 'Buy', 26, [-149, -8, -47], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escM', 'Speed controller, main', 'Electronics', 'Bought', 'Buy', 26, [-149, -8, 47], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escL', 'Speed controller, left roll', 'Electronics', 'Bought', 'Buy', 26, [-149, -17, -47], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escR', 'Speed controller, right roll', 'Electronics', 'Bought', 'Buy', 26, [-149, -17, 47], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['harness', 'Wiring harness', 'Electronics', 'Bought', 'Solder', 45, [-110, -8, 0], 5, 'Plugs: XT60 to the battery, 3-pin leads to the ESP32 sled, bullet plugs to the motors.', 'Red and black 14 AWG power pair to each speed controller; three thin wires from each controller to its motor; servo and signal leads to the ESP32. Solder it once on the bench as one loom so it lifts out whole.'],
  ['stabServoL', 'Tail servo, left', 'Electronics', 'Bought', 'Owned', 10, [-362,  -20,  -96], 7, 'Drops into a pocket from under the boom; a clip holds it.', '9 g servo, shaft down. The horn and pushrod run under the tail so the fin root stays clear.'],
  ['stabServoR', 'Tail servo, right', 'Electronics', 'Bought', 'Owned', 10, [-362,  -20,  96], 7, 'Drops into a pocket from under the boom; a clip holds it.', '9 g servo, shaft down. The horn and pushrod run under the tail so the fin root stays clear.'],
  // ---- Landing gear
  ['skidF', 'Front skid', 'Landing gear', 'PETG', 'Print', 14, [10,  -62,  0], 4, 'C-clips up onto both longerons through pockets in the body floor.', 'Keeps the main propeller 9 mm off the ground. Flexes on hard landings.'],
  ['skidR', 'Rear skid', 'Landing gear', 'PETG', 'Print', 14, [-150,  -60,  0], 4, 'C-clips up onto both longerons through pockets in the body floor.', 'Flexes on hard landings; cheap to reprint.'],
];

export const WIRING_G = 0; // wiring is now the 'harness' part

export const PARTS = rows.map(([id, name, group, material, process, mass, cg, step, lock, note]) =>
  ({ id, name, group, material, process, mass, cg, step, lock, note }));

export const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));

// Mass properties. batteryX overrides the battery (and tray) station.
export function massProps(batteryX = D.battery.xDefault) {
  let m = WIRING_G, mx = WIRING_G * -90, my = WIRING_G * -5, mz = 0;
  const pts = [];
  for (const p of PARTS) {
    const c = [...p.cg];
    if (p.id === 'battery' || p.id === 'batteryTray') c[0] = batteryX;
    m += p.mass; mx += p.mass * c[0]; my += p.mass * c[1]; mz += p.mass * c[2];
    pts.push({ m: p.mass, p: c });
  }
  const cg = [mx / m, my / m, mz / m];
  let Ixx = 0, Iyy = 0, Izz = 0; // point-mass estimate, g*mm^2
  for (const { m: mi, p } of pts) {
    const dx = p[0] - cg[0], dy = p[1] - cg[1], dz = p[2] - cg[2];
    Ixx += mi * (dy * dy + dz * dz); Iyy += mi * (dx * dx + dz * dz); Izz += mi * (dx * dx + dy * dy);
  }
  return { mass: m, cg, inertia: { roll: Ixx, yaw: Iyy, pitch: Izz } };
}

// Static hover trim: thrust each motor must make to hold a level hover.
export function hoverTrim(mp, tiltDeg = 90, rollShare = 0.25) {   // the roll pair carries a quarter of the weight so no motor runs near its limit
  const rollIdleG = mp.mass * rollShare / 2;
  const [F, M, L] = THRUSTERS;
  const s = Math.sin(tiltDeg * Math.PI / 180);
  const W = mp.mass, xc = mp.cg[0];
  const aF = F.pos[0] - xc, aM = M.pos[0] - xc, aR = L.pos[0] - xc;
  // tF + tMv + 2r = W ; tF*aF + tMv*aM + 2r*aR = 0
  const r = rollIdleG;
  const tMv = (-(W - 2 * r) * aF - 2 * r * aR) / (aM - aF);
  const tF = W - 2 * r - tMv;
  const tM = tMv / Math.max(s, 0.5);
  return { F: tF, M: tM, L: r, R: r, split: tF / (tF + tMv) };
}

// Print notes per twin part id. Geometry, file names and bed sizes come from cad/build.py via site/cad/manifest.json.
const P1 = 'Flat on its base, no supports.', UP = 'Standing on its tail end (nose up), no supports.', SPAN = 'Span vertical, root on the bed.';
export const CAD = {
  sparCarrier: 'Two blocks in one file: split to objects in the slicer and print them side by side, flat on their bases.', fanSpider: 'Flat, clips up, no supports. Counterbores face the bed.', bearingL: 'Floor on the bed; the servo window bridges 23 mm.', bearingR: P1,
  noseCone: UP + ' Split face on the bed, tip up.', yoke: 'Upside down on its flat top face; the stirrup bridges 22 mm.', cradle: 'On its side so the two arms are not layered across their bend.', podL: 'Upside down, motor pad on the bed.', podR: 'Upside down, motor pad on the bed.',
  skidF: 'Lying on its front face.', skidR: 'Lying on its front face.', batteryTray: P1, fcSled: P1, noseRing: 'Flat, 12 mm tall.', hatchLatch: 'On its side so layers run along the spring.',
  canopy: 'Clear PETG, vase mode (single spiral wall), open base down.',
  nose: UP + ' Back face on the bed, tip up.', fanbay: UP, tray: UP, hatch: 'Upside down on its top.', aftBridge: UP, boomL: UP, boomR: UP,
  wingInL: SPAN + ' Place diagonally: the root chord is 304 mm.', wingInR: SPAN + ' Place diagonally: the root chord is 304 mm.', wingOutL: SPAN, wingOutR: SPAN, stabL: SPAN, stabR: SPAN,
  finL: 'Flat on its inboard face.', finR: 'Flat on its inboard face.',
};
export const PRINT_LW = 'LW-PLA: the files are solid bodies. Slice with 1 wall (0.5 mm), 4% gyroid infill, 3 bottom layers and 0 top layers so each shell prints hollow and light. Foaming temperature per your filament (about 240 C); calibrate flow first.';
export const PRINT_PETG = 'PETG, 0.2 mm layers, 4 walls, 40% gyroid, 240 C nozzle / 80 C bed. Snap bores are 8.2 mm for an 8.0 mm tube: print one clip first and adjust CLIP_ID in cad/build.py if it is loose or will not snap.';

// Suggested wiring. ESP32 pin numbers are a starting map; set the same numbers in the madflight config.
// [from part, to part, what, wire, ESP32 pin or note]
export const WIRING = [
  ['battery', 'harness', 'Battery power', 'XT60, 14 AWG red/black', '14.8 V'],
  ['harness', 'escF', 'Power', '14 AWG pair', ''], ['harness', 'escM', 'Power', '14 AWG pair', ''],
  ['harness', 'escL', 'Power', '14 AWG pair', ''], ['harness', 'escR', 'Power', '14 AWG pair', ''],
  ['harness', 'ubec', 'Power', '20 AWG pair', '14.8 V in, 5 V out'],
  ['escF', 'motorF', '3 phase wires', '18 AWG x 3', 'swap any two to reverse'], ['escM', 'motorM', '3 phase wires', '18 AWG x 3', 'swap any two to reverse'],
  ['escL', 'motorL', '3 phase wires', '18 AWG x 3', 'runs along the spar'], ['escR', 'motorR', '3 phase wires', '18 AWG x 3', 'runs along the spar'],
  ['esp32', 'escF', 'Throttle signal', 'signal + ground', 'GPIO 32'], ['esp32', 'escM', 'Throttle signal', 'signal + ground', 'GPIO 33'],
  ['esp32', 'escL', 'Throttle signal', 'signal + ground', 'GPIO 25'], ['esp32', 'escR', 'Throttle signal', 'signal + ground', 'GPIO 26'],
  ['esp32', 'tiltServo', 'Servo signal', '3-wire lead', 'GPIO 16'], ['esp32', 'yawServo', 'Servo signal', '3-wire lead', 'GPIO 17'],
  ['esp32', 'stabServoL', 'Servo signal', '3-wire lead', 'GPIO 18'], ['esp32', 'stabServoR', 'Servo signal', '3-wire lead', 'GPIO 19'],
  ['rx', 'esp32', 'PPM (all channels)', '1 signal wire + 5 V + ground', 'GPIO 35 (input only)'],
  ['imu', 'esp32', 'I2C data / clock', '4 wires: 3.3 V, ground, SDA, SCL', 'SDA 21, SCL 22'],
  ['ubec', 'esp32', '5 V supply', 'red/black', 'VIN and GND'],
  ['ubec', 'harness', '5 V servo rail', 'red/black to all four servo plugs', 'servos must not be fed from the ESP32 3.3 V pin'],
];
