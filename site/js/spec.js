// Single source of truth for the F-35B VTOL digital twin.
// Units: millimetres, grams, degrees. Axes: +X nose, +Y up, +Z starboard (right wing).
// Everything a later simulator needs (masses, stations, thrusters, joints) lives here.

export const D = {
  xNose: 450, xNoseJoin: 230, xFanAft: 30, xTrayAft: -170, xBridgeAft: -260, xNotch: -215, xBoomAft: -430,
  halfW: 108, yT: 22, longZ: 92, tubeR: 4,
  fanX: 130, fanR: 81,
  pivotX: -300, propOffset: 58,
  sparX: -200, sparY: -9, rollZ: 445,
  wing: { rootZ: 108, midZ: 254, tipZ: 400, rootLE: 10, rootC: 300, tipC: 100, sweep: 34, y: -9 },
  stab: { pivotX: -400, rootZ: 110, tipZ: 265, rootLE: -335, rootC: 150, tipC: 45, sweep: 34 },
  fin: { rootLE: -255, rootC: 170, tipC: 55, h: 150, sweep: 40, cant: 25, z: 96 },
  groundY: -85,
  battery: { xDefault: -40, xMin: -100, xMax: -40 },
};

// Thrust figures are ESTIMATES until measured on the kitchen-scale thrust stand.
export const THRUSTERS = [
  { id: 'F', name: 'Front lift', part: 'motorF', pos: [D.fanX, 10, 0], maxG: 1000, spin: 'CW', prop: '6 in' },
  { id: 'M', name: 'Main (vectored)', part: 'motorM', pos: [D.pivotX, 0, 0], maxG: 1000, spin: 'CCW', prop: '6 in' },
  { id: 'L', name: 'Roll left', part: 'motorL', pos: [D.sparX, 20, -D.rollZ], maxG: 700, spin: 'CW', prop: '5 in' },
  { id: 'R', name: 'Roll right', part: 'motorR', pos: [D.sparX, 20, D.rollZ], maxG: 700, spin: 'CCW', prop: '5 in' },
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
  { n: 1, title: 'Backbone', text: 'Push the spar through the spar carrier, then snap the carrier onto both longerons at the marked station. This cross is the test frame: everything else hangs off it.' },
  { n: 2, title: 'Lift-fan mount', text: 'Snap the X-shaped fan spider onto the longerons. Bolt the front motor to its pad (4 x M3: one of only three places screws are used).' },
  { n: 3, title: 'Vectoring mount', text: 'Snap both tilt bearings onto the longerons. Drop the tilt servo into the left bearing, press the yoke onto its spline, and seat the right stub axle. Yaw servo drops into the yoke; cradle presses onto its horn. Bolt on the main motor.' },
  { n: 4, title: 'Tray and skids', text: 'Clip the centre tray up onto the longerons from below. Skids snap on outside it. Slide the battery tray into its rails.' },
  { n: 5, title: 'Electronics', text: 'Flight-controller sled slides into the left rail; receiver and regulator into the right. Speed controllers press into their clips. Plug in servos and motors. Bench-test with propellers OFF.' },
  { n: 6, title: 'Body shells', text: 'Slide the fan bay on from the front. Clip the aft bridge over the spar carrier, then slide the two tail booms on from the rear until they click.' },
  { n: 7, title: 'Tail', text: 'Tail servos press into the boom pockets. Stabilators push onto their pivot pins. Fins plug into the boom sockets and snap.' },
  { n: 8, title: 'Wings and roll motors', text: 'Slide each wing panel along the spar until the root latch clicks. Push a roll pod onto each spar end (spring button). Motors are pre-bolted to the pods.' },
  { n: 9, title: 'Nose', text: 'Clip the bayonet ring to the longeron ends. Offer up the nose, push and twist a quarter turn. Canopy snaps into the nose.' },
  { n: 10, title: 'Fly-ready', text: 'Strap in the battery and set its position for balance. Fit the hatch: tongue in at the front, press down at the rear. Propellers go on LAST.' },
];

// [id, name, group, material, process, mass g, [x,y,z] station, step, lock, note]
const rows = [
  // ---- Backbone
  ['longeronL', 'Longeron, left', 'Backbone', 'Aluminium', 'Cut', 39, [-100, 0, -92], 1, 'Everything snaps onto this tube with C-clips.', '8 mm tube, 650 mm long. Runs nose to tail and doubles as the tail boom.'],
  ['longeronR', 'Longeron, right', 'Backbone', 'Aluminium', 'Cut', 39, [-100, 0, 92], 1, 'Everything snaps onto this tube with C-clips.', '8 mm tube, 650 mm long.'],
  ['spar', 'Wing spar', 'Backbone', 'Aluminium', 'Cut', 54, [-200, -9, 0], 1, 'Captured by the spar carrier saddles.', '8 mm tube, 910 mm long. Carries both wings and both roll motors, so roll loads never pass through printed shells.'],
  ['sparCarrier', 'Spar carrier', 'Backbone', 'PETG', 'Print', 22, [-200, -8, 0], 1, 'Two C-clips onto the longerons; spar slides through two saddles.', 'The one joint that sets the airframe square. Print flat, 4 walls, 40% infill.'],
  // ---- Airframe shells
  ['nose', 'Nose section', 'Airframe shells', 'LW-PLA', 'Print', 40, [320, 2, 0], 9, 'Bayonet: push on, quarter turn.', 'First thing to hit the ground. Print upright, single wall. Keep two spares.'],
  ['noseRing', 'Nose bayonet ring', 'Airframe shells', 'PETG', 'Print', 8, [230, 0, 0], 9, 'C-clips onto the longeron ends.', 'Gives the soft LW-PLA nose a hard bayonet to lock onto.'],
  ['canopy', 'Canopy', 'Airframe shells', 'PETG', 'Print', 8, [330, 40, 0], 9, 'Four snap tabs into the nose.', 'Print in clear PETG, vase mode. A cut-down drinks bottle also works.'],
  ['fanbay', 'Lift-fan bay', 'Airframe shells', 'LW-PLA', 'Print', 40, [130, 0, 0], 6, 'Slides over both longerons from the front; trapped by the nose ring.', '162 mm duct for the 152 mm (6 in) propeller. Print flat.'],
  ['tray', 'Centre tray', 'Airframe shells', 'LW-PLA', 'Print', 35, [-70, -4, 0], 4, 'Four C-clips up onto the longerons.', 'Open-top tub for battery and electronics. Print flat, floor down.'],
  ['hatch', 'Top hatch', 'Airframe shells', 'LW-PLA', 'Print', 20, [-70, 28, 0], 10, 'Front tongue plus rear snap latch. No tools.', 'Lift off for battery swaps. The dorsal spine stiffens it.'],
  ['aftBridge', 'Aft bridge', 'Airframe shells', 'LW-PLA', 'Print', 12, [-192, 0, 0], 6, 'Clips down over the spar carrier.', 'U-shaped: the notch is the swing space for the main propeller.'],
  ['boomL', 'Tail boom, left', 'Airframe shells', 'LW-PLA', 'Print', 9, [-345, 0, -96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  ['boomR', 'Tail boom, right', 'Airframe shells', 'LW-PLA', 'Print', 9, [-345, 0, 96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  // ---- Wings & tail
  ['wingInL', 'Wing, inner left', 'Wings & tail', 'LW-PLA', 'Print', 38, [-135, -9, -180], 8, 'Slides along the spar; root latch clicks into the body.', 'Print upright (span vertical), placed diagonally on the bed.'],
  ['wingInR', 'Wing, inner right', 'Wings & tail', 'LW-PLA', 'Print', 38, [-135, -9, 180], 8, 'Slides along the spar; root latch clicks into the body.', 'Print upright (span vertical), placed diagonally on the bed.'],
  ['wingOutL', 'Wing, outer left', 'Wings & tail', 'LW-PLA', 'Print', 22, [-205, -9, -325], 8, 'Dovetail to the inner panel; held by the roll pod.', 'Crash consumable. No electronics inside.'],
  ['wingOutR', 'Wing, outer right', 'Wings & tail', 'LW-PLA', 'Print', 22, [-205, -9, 325], 8, 'Dovetail to the inner panel; held by the roll pod.', 'Crash consumable. No electronics inside.'],
  ['latchL', 'Wing root latch, left', 'Wings & tail', 'PETG', 'Print', 2, [-120, -9, -108], 8, 'Cantilever snap: squeeze to release the wing.', 'Print 4 extra. Lying flat so layers run along the spring.'],
  ['latchR', 'Wing root latch, right', 'Wings & tail', 'PETG', 'Print', 2, [-120, -9, 108], 8, 'Cantilever snap: squeeze to release the wing.', 'Print 4 extra.'],
  ['stabL', 'Stabilator, left', 'Wings & tail', 'LW-PLA', 'Print', 15, [-420, 0, -180], 7, 'Pushes onto the pivot pin; horn clips to the pushrod.', 'All-moving tail. Both together = pitch, opposite = roll.'],
  ['stabR', 'Stabilator, right', 'Wings & tail', 'LW-PLA', 'Print', 15, [-420, 0, 180], 7, 'Pushes onto the pivot pin; horn clips to the pushrod.', 'All-moving tail.'],
  ['finL', 'Fin, left', 'Wings & tail', 'LW-PLA', 'Print', 15, [-350, 85, -125], 7, 'Tab into the boom socket with a snap barb.', 'Fixed, canted 25 degrees. No rudder: yaw comes from the vectored motor.'],
  ['finR', 'Fin, right', 'Wings & tail', 'LW-PLA', 'Print', 15, [-350, 85, 125], 7, 'Tab into the boom socket with a snap barb.', 'Fixed, canted 25 degrees.'],
  // ---- Propulsion
  ['fanSpider', 'Lift-fan spider', 'Propulsion', 'PETG', 'Print', 18, [130, -12, 0], 2, 'Four C-clips onto the longerons.', 'X-brace that carries the front motor in the middle of the duct.'],
  ['motorF', 'Front lift motor', 'Propulsion', 'Bought', 'Owned', 34, [130, 0, 0], 2, '4 x M3 screws into the spider pad.', 'EMAX ECO II 2306 1700KV. Spins clockwise.'],
  ['propF', 'Front propeller, 6 in', 'Propulsion', 'Bought', 'Buy', 6, [130, 17, 0], 10, 'Motor nut. Fit last.', '6040 or 6045, clockwise. Main crash consumable.'],
  ['podL', 'Roll pod, left', 'Propulsion', 'PETG', 'Print', 12, [-200, -4, -430], 8, 'Spring button into a hole in the spar end.', 'Also traps the outer wing panel on the spar.'],
  ['podR', 'Roll pod, right', 'Propulsion', 'PETG', 'Print', 12, [-200, -4, 430], 8, 'Spring button into a hole in the spar end.', 'Also traps the outer wing panel on the spar.'],
  ['motorL', 'Roll motor, left', 'Propulsion', 'Bought', 'Owned', 34, [-200, 18, -445], 8, '4 x M3 screws into the pod.', 'EMAX ECO II 2306 1700KV. Idles in hover; speeds up or slows down to roll.'],
  ['motorR', 'Roll motor, right', 'Propulsion', 'Bought', 'Owned', 34, [-200, 18, 445], 8, '4 x M3 screws into the pod.', 'EMAX ECO II 2306 1700KV. Opposite spin to the left one.'],
  ['propL', 'Roll propeller, left, 5 in', 'Propulsion', 'Bought', 'Buy', 4, [-200, 36, -445], 10, 'Motor nut. Fit last.', '5 in three-blade.'],
  ['propR', 'Roll propeller, right, 5 in', 'Propulsion', 'Bought', 'Buy', 4, [-200, 36, 445], 10, 'Motor nut. Fit last.', '5 in three-blade.'],
  // ---- Vectoring mount
  ['bearingL', 'Tilt bearing, left', 'Vectoring mount', 'PETG', 'Print', 8, [-300, 0, -92], 3, 'C-clip onto the longeron.', 'Holds the tilt servo.'],
  ['bearingR', 'Tilt bearing, right', 'Vectoring mount', 'PETG', 'Print', 8, [-300, 0, 92], 3, 'C-clip onto the longeron.', 'Plain bearing for the yoke stub axle.'],
  ['tiltServo', 'Tilt servo', 'Vectoring mount', 'Bought', 'Owned', 14, [-294, 0, -71], 3, 'Press-fit pocket with a retaining clip.', 'TowerPro MG90S (metal gears). Rotates the yoke 0 to 100 degrees.'],
  ['yoke', 'Tilt yoke', 'Vectoring mount', 'PETG', 'Print', 16, [-300, 0, 12], 3, 'Presses onto the servo spline; stub axle in the right bearing.', 'The thrust line passes through this axis, so the servo only fights friction, not thrust.'],
  ['yawServo', 'Yaw servo', 'Vectoring mount', 'Bought', 'Owned', 14, [-306, 2, 0], 3, 'Press-fit pocket in the yoke.', 'TowerPro MG90S. Swings the motor 20 degrees each way.'],
  ['cradle', 'Motor cradle', 'Vectoring mount', 'PETG', 'Print', 6, [-322, 0, 0], 3, 'Presses onto the yaw servo horn; pin at the bottom.', 'C-bracket that wraps the yaw servo.'],
  ['motorM', 'Main motor', 'Vectoring mount', 'Bought', 'Owned', 34, [-342, 0, 0], 3, '4 x M3 screws into the cradle.', 'EMAX ECO II 2306 1700KV. Spins anticlockwise to cancel the front motor torque.'],
  ['propM', 'Main propeller, 6 in', 'Vectoring mount', 'Bought', 'Buy', 6, [-358, 0, 0], 10, 'Motor nut. Fit last.', '6040 or 6045, anticlockwise (pusher).'],
  // ---- Electronics
  ['battery', 'Battery, 4-cell 3300 mAh', 'Electronics', 'Bought', 'Owned', 370, [-40, -3, 0], 10, 'Hook-and-loop strap on the tray.', 'Heaviest part: sliding it sets the balance point.'],
  ['batteryTray', 'Battery tray', 'Electronics', 'PETG', 'Print', 12, [-40, -19, 0], 4, 'Slides in floor rails; detent every 10 mm.', 'Lets you shift the battery to trim balance without tools.'],
  ['fcSled', 'Flight-controller sled', 'Electronics', 'PETG', 'Print', 8, [-70, -12, -55], 5, 'Slides into a rail; snap tab.', 'Carries the ESP32 and gyro so the whole brain lifts out for bench work.'],
  ['esp32', 'ESP32 DevKit v1', 'Electronics', 'Bought', 'Owned', 10, [-52, -7, -55], 5, 'Pin headers into the sled socket.', 'Runs madflight. Reads the gyro and receiver, drives 4 motors and 4 servos.'],
  ['imu', 'Gyro board (MPU6050)', 'Electronics', 'Bought', 'Buy', 3, [-98, -8, -55], 5, 'Foam tape on the sled.', 'Sits close to the balance point so it feels rotation, not sideways shake.'],
  ['rx', 'Receiver FS-iA6B', 'Electronics', 'Bought', 'Owned', 15, [-52, -7, 55], 5, 'Snap clip.', 'Set to PPM output: one wire carries all channels.'],
  ['ubec', '5 V regulator', 'Electronics', 'Bought', 'Buy', 12, [-98, -9, 55], 5, 'Snap clip.', 'Feeds servos and ESP32 from the flight battery.'],
  ['escF', 'Speed controller, front', 'Electronics', 'Bought', 'Buy', 26, [2, -10, -55], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escM', 'Speed controller, main', 'Electronics', 'Bought', 'Buy', 26, [2, -10, 55], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escL', 'Speed controller, left roll', 'Electronics', 'Bought', 'Buy', 26, [-140, -10, -55], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['escR', 'Speed controller, right roll', 'Electronics', 'Bought', 'Buy', 26, [-140, -10, 55], 5, 'Press-in clip.', '30 to 40 A, 4-cell rated.'],
  ['stabServoL', 'Tail servo, left', 'Electronics', 'Bought', 'Owned', 10, [-365, 0, -96], 7, 'Press-fit pocket in the boom.', '9 g servo.'],
  ['stabServoR', 'Tail servo, right', 'Electronics', 'Bought', 'Owned', 10, [-365, 0, 96], 7, 'Press-fit pocket in the boom.', '9 g servo.'],
  // ---- Landing gear
  ['skidF', 'Front skid', 'Landing gear', 'PETG', 'Print', 14, [10, -55, 0], 4, 'C-clips onto both longerons.', 'Keeps the main propeller 9 mm off the ground. Flexes on hard landings.'],
  ['skidR', 'Rear skid', 'Landing gear', 'PETG', 'Print', 14, [-150, -55, 0], 4, 'C-clips onto both longerons.', 'Flexes on hard landings; cheap to reprint.'],
];

export const WIRING_G = 45; // harness, connectors: spread around the balance point

export const PARTS = rows.map(([id, name, group, material, process, mass, cg, step, lock, note]) =>
  ({ id, name, group, material, process, mass, cg, step, lock, note }));

export const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));

// Mass properties. batteryX overrides the battery (and tray) station.
export function massProps(batteryX = D.battery.xDefault) {
  let m = WIRING_G, mx = WIRING_G * -90, my = WIRING_G * -5, mz = 0;
  const pts = [{ m: WIRING_G, p: [-90, -5, 0] }];
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
export function hoverTrim(mp, tiltDeg = 90, rollIdleG = 60) {
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
