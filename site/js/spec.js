// Single source of truth for the F-35B VTOL digital twin.
// Units: millimetres, grams, degrees. Axes: +X nose, +Y up, +Z starboard (right wing).
// Everything a later simulator needs (masses, stations, thrusters, joints) lives here.

export const D = {
  xNose: 578, xNoseJoin: 300, xFanAft: 96, xTrayAft: -140, xBridgeAft: -260, xNotch: -215, xBoomAft: -430,
  halfW: 108, yT: 22, longZ: 92, tubeR: 4,
  fanX: 210, fanR: 81,
  pivotX: -300, propOffset: 58,
  sparX: -160, sparY: -9, sparHalf: 300, rollX: -139, rollZ: 193, rollHoleR: 68.5, rollPadY: -27, rollPropY: 2, tubeFront: 282, tubeRear: -425,
  wing: { rootZ: 108, midZ: 278, tipZ: 345, rootLE: -5, rootC: 300, tipC: 95, sweep: 34, y: -9 },
  stab: { pivotX: -400, pivotY: -9, rootZ: 110, tipZ: 240, rootLE: -328, rootC: 195, tipC: 76, sweep: 34 },
  fin: { rootLE: -255, rootC: 170, tipC: 55, h: 150, sweep: 40, cant: 25, z: 96 },
  groundY: -150,
  nozzle: { xJ1: -272, yAx: 2, L: [58, 104, 56], loss90: 0.15 },   // main fan + swivel nozzle (cad/propulsion.py kit frame sits here, turned to face aft)
  lift: { y0: -60 },
  battery: { xDefault: -9, xMin: -73, xMax: 16 },
  noseBay: { x0: 344, x1: 414, floor: -14 },
  escBay: { x: 65, y: -18.5, z: [43, 65] },
  gear: { noseX: 437, noseY: -25.7, mainX: [-83, -121], mainZ: 80, mainY: [-32.1, -31.4], footZ: 128, retractDeg: 90 },
  wireCh: { z0: 66, z1: 84, roof: -30, x0: -66, x1: 300 },
};

// Thrust figures are ESTIMATES until measured on the kitchen-scale thrust stand. Lift fan and main fan come from analysis/fan_bem.py.
// where the main jet leaves the nozzle, and which way it pushes, for a given deflection (planar approximation of site/js/nozzle.js)
export function nozzleExit(deflectionDeg) {
  const d = deflectionDeg * Math.PI / 180, [l1, l2, l3] = D.nozzle.L;
  return { pos: [D.nozzle.xJ1 - (l1 + l2 * Math.cos(d / 2) + l3 * Math.cos(d)), D.nozzle.yAx - (l2 * Math.sin(d / 2) + l3 * Math.sin(d)), 0],
    eff: 1 - D.nozzle.loss90 * Math.min(deflectionDeg, 90) / 90 };
}
export const THRUSTERS = [
  { id: 'F', name: 'Lift fan', part: 'motorF', pos: [D.fanX, 10, 0], maxG: 1344, spin: 'CW', prop: '140 mm printed fan on a 1,500 KV motor' },
  { id: 'M', name: 'Main fan (swivel nozzle)', part: 'motorM', pos: nozzleExit(90).pos, maxG: 958, spin: 'CCW', prop: '80 mm printed fan' },
  { id: 'L', name: 'Roll left', part: 'motorL', pos: [D.rollX, D.rollPropY, -D.rollZ], maxG: 823, spin: 'CW', prop: '5 in three-blade in a 137 mm duct' },
  { id: 'R', name: 'Roll right', part: 'motorR', pos: [D.rollX, D.rollPropY, D.rollZ], maxG: 823, spin: 'CCW', prop: '5 in three-blade in a 137 mm duct' },
];

export const JOINTS = {
  tilt: { name: 'nozzle deflection', min: 0, max: 100, servo: '3 x MG90S', note: '0 = straight aft, 90 = straight down, 100 = braking. Solved into three bearing angles by site/js/nozzle.js.' },
  yaw: { name: 'nozzle yaw swing', min: -20, max: 20, note: 'Bearing 1 swings the bent jet left or right. Only works when the nozzle is deflected.' },
  stab: { axis: 'Z', pivot: [D.stab.pivotX, D.stab.pivotY, 0], min: -25, max: 25, servo: '9 g', note: 'All-moving tails: together = pitch, opposite = roll.' },
  gear: { name: 'landing gear', min: 0, max: 1, servo: '3 x 9 g', note: '0 = down and locked against its stop, 1 = folded flat into the belly. The nose leg swings 90 degrees aft about a Z axis; each main leg swings 114 degrees inboard about an X axis at the belly edge.' },
};

export const MATERIALS = {
  'LW-PLA': { color: '#9aa4ad', blurb: 'Foaming PLA, single wall. Light aero shells; cheap to reprint after a crash.' },
  'PETG': { color: '#ff7a1a', blurb: 'Tough, slightly flexible. Every load-bearing or snap-fit part.' },
  'Carbon': { color: '#4a4f55', blurb: '8 mm x 1 mm pultruded tube: three carbon arrow shafts, cut down. Stiffer and 24 g lighter than aluminium, for about $12.' },
  'Bought': { color: '#4aa3ff', blurb: 'Off-the-shelf electronics and hardware.' },
};

export const GROUPS = ['Backbone', 'Airframe shells', 'Wings & tail', 'Propulsion', 'Main fan & nozzle', 'Electronics', 'Landing gear'];

export const STEPS = [
  { n: 1, title: 'Backbone', text: 'Lay out the two 637 mm longerons and the 676 mm spar. Nothing is fixed yet: the shells slide on first, then the PETG parts clip up from below and lock each shell in place.' },
  { n: 2, title: 'Lift-fan mount', text: 'Bolt the lift-fan motor to the fan spider (4 x M3). With the fan bay on the tubes, snap the spider up onto both longerons through the four pockets in the bay floor.' },
  { n: 3, title: 'Reserved', text: 'The old tilt mount was deleted when the swivel nozzle replaced it. Nothing to fit at this step.' },
  { n: 4, title: 'Centre section and landing legs', text: 'Slide the centre section onto the longerons behind the fan bay. Clip both gear brackets up through the belly pockets: they lock it. Push a 3 mm wire through each bracket and leg, push the leg servos up into their pockets, and set each leg so it rests on its down-stop. The nose leg goes in with the nose: doubler glued into the well roof first. Drop in the battery tray.' },
  { n: 5, title: 'Electronics and wiring', text: 'The lift-fan controller, flight-controller sled, receiver and regulator go in the nose bay under the canopy; the other three controllers and the power board sit beside the battery under the top hatch. Then wire it: every run is a separate cut length with a connector at each end, laid into the belly raceway rather than bundled. Slide the four cover strips into their T-slots last. Bench-test with the fans OFF their shafts.' },
  { n: 6, title: 'Body shells and main fan', text: 'Fan bay slides on from the front; press the shroud ring into it. Aft bridge and tail booms slide on from the rear. Push the spar through and clip on its carrier blocks. Bolt the main motor into the fan duct and slide the duct into the nacelle from the rear.' },
  { n: 7, title: 'Tail and nozzle', text: 'Tail servos, tailplanes and fins as before. Push each nozzle servo, drum already on, up into its pocket from the belly. Grease the bearing flanges, slip the drive ring onto segment 1, then build the nozzle outward: segment 1, 2, 3, a collar on each bearing. Every bearing must turn freely by hand before any cord goes on. Then string the cords: see the cord diagram in docs/ducted-propulsion.md.' },
  { n: 8, title: 'Wings and roll motors', text: 'Slide each inner panel along the spar into its root socket, then the outer panel with its skewer pin. Pin each wing tip to the spar. Clip a roll-motor mount onto the spar inside each 137 mm duct, 21 mm ahead of the spar, and pin it. The duct is in the inner panel, so the panel joint at 278 mm stays clear of it.' },
  { n: 9, title: 'Nose', text: 'Glue the nose cone to the nose section on its two skewer dowels, and the PETG plug into the back, once. Push the nose into the fan bay and drop the two skewer pins in from the top. The canopy stays removable: tape or magnets.' },
  { n: 10, title: 'Fly-ready', text: 'Strap in the battery at +8 mm and check the balance point: it must sit 23 mm behind the datum. Fit the hatch: tongue in at the front, press down at the rear until the latch clicks. Cycle the legs up and down once on the bench. Both fan rotors and the 5 in roll propellers go on LAST.' },
];

// [id, name, group, material, process, mass g, [x,y,z] station, step, lock, note]
const rows = [
  // ---- Backbone
  ['longeronL', 'Longeron, left', 'Backbone', 'Carbon', 'Cut', 23, [-71,  0,  -92], 1, 'Everything snaps onto this tube with C-clips.', '8 x 1 mm carbon tube (an arrow shaft), 637 mm long. Runs nose to tail and doubles as the tail boom: stiffer than the 8 x 0.75 aluminium it replaces and 7 g lighter.'],
  ['longeronR', 'Longeron, right', 'Backbone', 'Carbon', 'Cut', 23, [-71,  0,  92], 1, 'Everything snaps onto this tube with C-clips.', '8 x 1 mm carbon tube (an arrow shaft), 637 mm long.'],
  ['spar', 'Wing spar', 'Backbone', 'Carbon', 'Cut', 30, [-160, -9, 0], 1, 'Slides through both carrier blocks and across the main fan inlet.', '8 x 1 mm carbon tube, 600 mm long. Carries both wings and both roll-motor mounts, so roll loads never pass through printed shells.'],
  ['sparCarrier', 'Spar carrier', 'Backbone', 'PETG', 'Print', 15, [-160, -9, 0], 1, 'Each block clips up onto its longeron through a pocket in the body floor; the spar slides through both.', 'A pair of blocks in one file. The spar ties them together and sets the airframe square. The notch under each bore carries the roll-motor wires.'],
  // ---- Airframe shells
  ['nose', 'Nose section', 'Airframe shells', 'LW-PLA', 'Print', 60, [370, -4, 0], 9, 'Pushes onto the nose plug; two 3 mm bamboo-skewer pins drop in from the top.', 'Rear half of the nose. Carries the canopy and the PETG plug.'],
  ['noseCone', 'Nose cone', 'Airframe shells', 'LW-PLA', 'Print', 18, [495, -6, 0], 9, 'Glued to the nose section; two 3 mm bamboo-skewer dowels line it up.', 'The nose is 278 mm long, taller than the printer, so it prints in two pieces. This tip is the first thing to hit the ground: keep spares.'],
  ['noseRing', 'Nose plug', 'Airframe shells', 'PETG', 'Print', 17, [294,  -6,  0], 9, 'Glued into the back of the nose. Plugs 12 mm into the fan bay.', 'A hard PETG collar so the soft nose seats the same way every time.'],
  ['canopy', 'Canopy', 'Airframe shells', 'PETG', 'Print', 20, [405, 45, 0], 9, 'Held by two strips of tape or small magnets: it is the hatch to the electronics.', 'Print in clear PETG, vase mode. Lift it off to reach the speed controllers, flight controller and receiver.'],
  ['fanbay', 'Lift-fan bay', 'Airframe shells', 'LW-PLA', 'Print', 101, [215, -6, 0], 6, 'Slides onto both longerons from the front until the tubes bottom out; the fan spider clips in from below and locks it.', 'Houses the lift fan: a 124 mm bore for the shroud ring. The dark recesses at the front corners are the intakes.'],
  ['tray', 'Centre tray', 'Airframe shells', 'LW-PLA', 'Print', 146, [-22,  -18,  0], 4, 'Slides onto both longerons; the skids and spar carrier blocks clip on through its floor and lock it.', 'Open-top bay for battery and electronics. Its rear end is open above and below: that is the air inlet for the main fan.'],
  ['hatch', 'Top hatch', 'Airframe shells', 'LW-PLA', 'Print', 41, [16, 26, 0], 10, 'Front tongue under the fan bay, rear PETG latch. No tools.', 'Lift off for battery swaps. The dorsal spine stiffens it.'],
  ['aftBridge', 'Aft bridge', 'Airframe shells', 'LW-PLA', 'Print', 80, [-200,  -6,  0], 6, 'Slides onto the longerons between the centre section and the booms.', 'The engine nacelle: the main fan duct slides into its bore from the rear.'],
  ['boomL', 'Tail boom, left', 'Airframe shells', 'LW-PLA', 'Print', 13, [-345, 0, -96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  ['boomR', 'Tail boom, right', 'Airframe shells', 'LW-PLA', 'Print', 13, [-345, 0, 96], 6, 'Slides onto the longeron from the rear; snap detent.', 'Houses a tail servo. Sockets for stabilator and fin.'],
  // ---- Wings & tail
  ['wingInL', 'Wing, inner left', 'Wings & tail', 'LW-PLA', 'Print', 36, [-150, -9, -190], 8, 'Slides along the spar; the root keys 5 mm into a socket in the body.', 'Print upright (span vertical), placed diagonally on the bed: the root chord is 304 mm.'],
  ['wingInR', 'Wing, inner right', 'Wings & tail', 'LW-PLA', 'Print', 36, [-150, -9, 190], 8, 'Slides along the spar; the root keys 5 mm into a socket in the body.', 'Print upright (span vertical), placed diagonally on the bed: the root chord is 304 mm.'],
  ['wingOutL', 'Wing, outer left', 'Wings & tail', 'LW-PLA', 'Print', 9, [-205, -9, -310], 8, 'Slides on the spar; a skewer pin aligns it to the inner panel and a 2 mm pin through the tip and spar holds both panels on.', 'The 137 mm duct for the 5 in roll propeller is in the inner panel now; the panel joint moved outboard to 278 mm so it does not cross the duct.'],
  ['wingOutR', 'Wing, outer right', 'Wings & tail', 'LW-PLA', 'Print', 9, [-205, -9, 310], 8, 'Slides on the spar; a skewer pin aligns it to the inner panel and a 2 mm pin through the tip and spar holds both panels on.', 'The 137 mm duct for the 5 in roll propeller is in the inner panel now; the panel joint moved outboard to 278 mm so it does not cross the duct.'],
  ['hatchLatch', 'Hatch latch', 'Airframe shells', 'PETG', 'Print', 1, [-56, 17, 0], 10, 'Glued into the rear of the hatch; its ridge clicks into a groove in the centre section.', 'The only spring part on the hatch. Print a few.'],
  ['stabL', 'Stabilator, left', 'Wings & tail', 'LW-PLA', 'Print', 16, [-410, -9, -156], 7, 'Turns on a 3 mm wire through the boom; pushrod hooks into the horn under the root.', 'All-moving tail. Both together = pitch, opposite = roll.'],
  ['stabR', 'Stabilator, right', 'Wings & tail', 'LW-PLA', 'Print', 16, [-410, -9, 156], 7, 'Turns on a 3 mm wire through the boom; pushrod hooks into the horn under the root.', 'All-moving tail.'],
  ['finL', 'Fin, left', 'Wings & tail', 'LW-PLA', 'Print', 15, [-320, 80, -125], 7, 'Root sits in a matching socket moulded into the boom top; glue or tape.', 'Fixed, canted 25 degrees. No rudder: yaw comes from the vectored motor.'],
  ['finR', 'Fin, right', 'Wings & tail', 'LW-PLA', 'Print', 15, [-320, 80, 125], 7, 'Root sits in a matching socket moulded into the boom top; glue or tape.', 'Fixed, canted 25 degrees.'],
  // ---- Propulsion
  ['fanSpider', 'Lift-fan spider', 'Propulsion', 'PETG', 'Print', 32, [210, -12, 0], 2, 'Four C-clips onto the longerons.', 'X-brace that carries the lift-fan motor in the middle of the duct; its four arms also straighten the flow a little.'],
  ['motorF', 'Lift fan motor', 'Propulsion', 'Bought', 'Buy', 48, [210, 0, 0], 2, '4 x M3 screws into the spider pad: check the pattern, most 2807 motors are 16 x 16 like the 2306.', '2807 size, about 1,500 KV. The fan is limited by motor torque at 35 A, not by the blades, so the lower KV gives 1,344 g instead of 1,206 g for 14 g and about $20. This one change is what brings the hardest-working fan under 60%.'],
  ['podL', 'Roll motor mount, left', 'Propulsion', 'PETG', 'Print', 5, [-150, -22, -193], 8, 'Clips up onto the spar inside the wing duct; a 2 mm pin through clip and spar stops it sliding.', 'Hangs the motor 21 mm ahead of the spar so the propeller sits at the upper surface of the wing, with the duct clear of the leading edge by 8 mm.'],
  ['podR', 'Roll motor mount, right', 'Propulsion', 'PETG', 'Print', 5, [-150, -22, 193], 8, 'Clips up onto the spar inside the wing duct; a 2 mm pin through clip and spar stops it sliding.', 'Hangs the motor 21 mm ahead of the spar so the propeller sits at the upper surface of the wing, with the duct clear of the leading edge by 8 mm.'],
  ['motorL', 'Roll motor, left', 'Propulsion', 'Bought', 'Owned', 34, [-139, -14, -193], 8, '4 x M3 screws up through the mount pad.', 'EMAX ECO II 2306 1700KV, buried in the wing ahead of the spar. On a 5 in propeller the pair makes about 1,650 g, so it carries most of the hover load and still has roll authority left.'],
  ['motorR', 'Roll motor, right', 'Propulsion', 'Bought', 'Owned', 34, [-139, -14, 193], 8, '4 x M3 screws up through the mount pad.', 'EMAX ECO II 2306 1700KV, buried in the wing. Opposite spin to the left one.'],
  ['propL', 'Roll propeller, left, 5 in', 'Propulsion', 'Bought', 'Buy', 6, [-139, 2, -193], 10, 'Motor nut. Fit last.', '5 x 4.3 in three-blade in a 137 mm duct. The bigger disc is what brings the hardest-working fan under 60%.'],
  ['propR', 'Roll propeller, right, 5 in', 'Propulsion', 'Bought', 'Buy', 6, [-139, 2, 193], 10, 'Motor nut. Fit last.', '5 x 4.3 in three-blade in a 137 mm duct.'],
  // ---- Vectoring mount
  ['liftRotor', 'Lift fan rotor, 140 mm', 'Propulsion', 'PETG', 'Print', 26, [210, 8, 0], 10, 'Clamps on the motor shaft with the propeller nut. Fit last.', 'Seven fine blades, matched to the motor: about 35 A at 15,000 to 20,000 rpm (model). Mirror image of the main fan so the two torques oppose.'],
  ['liftRing', 'Lift fan shroud ring', 'Propulsion', 'PETG', 'Print', 30, [210, 17, 0], 6, 'Pressed into the fan bay from the top; its lip sits in a seat.', 'A hard, round surface 0.6 mm from the blade tips. The soft body alone could not hold that gap.'],
  ['edfDuct', 'Main fan duct', 'Main fan & nozzle', 'PETG', 'Print', 76, [-225, 2, 0], 6, 'Slides into the nacelle from the rear until its flange meets the body.', 'Shroud, bellmouth, five straightening vanes, the motor plate, the first nozzle bearing and its servo bracket, in one print.'],
  ['motorM', 'Main fan motor', 'Main fan & nozzle', 'Bought', 'Owned', 34, [-218, 2, 0], 6, '4 x M3 screws through the motor plate, reached with the tail cone off.', 'EMAX ECO II 2306 1700KV inside the duct. If the thrust test falls short this is the motor to swap for a higher-speed one.'],
  ['impeller', 'Main fan rotor, 80 mm', 'Main fan & nozzle', 'PETG', 'Print', 36, [-188, 2, 0], 10, 'Clamps on the motor shaft with the propeller nut. Fit last.', 'Seven blades for about 18,000 rpm. Print spares and balance each one.'],
  ['tailCone', 'Fan tail cone', 'Main fan & nozzle', 'PETG', 'Print', 8, [-262, 2, 0], 6, 'Push fit behind the motor plate.', 'Smooths the flow off the hub. Pull it off to reach the motor screws.'],
  ['seg1', 'Nozzle segment 1', 'Main fan & nozzle', 'PETG', 'Print', 37, [-300, 2, 0], 7, 'Its flange sits against the duct flange; a two-piece collar clamps them.', 'Turns about the duct axis. Nothing on it but a sleeve for the drive ring, four small cord posts and a cord band.'],
  ['seg2', 'Nozzle segment 2', 'Main fan & nozzle', 'PETG', 'Print', 33, [-380, 2, 0], 7, 'Collar at each end.', 'The wedge: both its ends are canted 40 degrees. Two small posts guide the cord loop that makes bearing 3 follow bearing 2.'],
  ['seg3', 'Nozzle segment 3', 'Main fan & nozzle', 'PETG', 'Print', 18, [-462, 2, 0], 7, 'Collar to segment 2.', 'The exit, slightly narrowed to speed the jet up.'],
  ['collar1', 'Bearing 1 collar (2 halves)', 'Main fan & nozzle', 'PETG', 'Print', 9, [-272, 2, 0], 7, 'Two halves around the flange pair, held by a zip tie in the middle groove. Two PTFE seal washers inside (mass included).', 'Also a pulley: keyed to segment 1, and servo 1 pulls it round with two cords. Silicone-grease the washers.'],
  ['collar2', 'Bearing 2 collar (2 halves)', 'Main fan & nozzle', 'PETG', 'Print', 11, [-330, 2, 0], 7, 'Two halves and a zip tie.', 'Canted 40 degrees. Keyed to segment 2; the cords from the drive ring pull it round.'],
  ['collar3', 'Bearing 3 collar (2 halves)', 'Main fan & nozzle', 'PETG', 'Print', 11, [-434, 2, 0], 7, 'Two halves and a zip tie.', 'Canted 40 degrees the other way. Keyed to segment 3; a cord loop from segment 1 makes it mirror bearing 2.'],
  ['driveRing', 'Nozzle drive ring', 'Main fan & nozzle', 'PETG', 'Print', 6, [-281, 2, 0], 7, 'Slips over segment 1 from the front before the nozzle goes on the duct. Free to turn.', 'Servo 2 turns this ring with a pair of cords. A second pair runs from the ring across to the bearing-2 collar, so turning the ring bends the nozzle.'],
  ['drum1', 'Cord drum, servo 1', 'Main fan & nozzle', 'PETG', 'Print', 8, [-222, -4, 53], 7, 'The stock servo horn presses into its recess; the horn screw holds it.', 'Stands on edge inside the body. Its two cords run aft to the bearing-1 collar: one over the top, one underneath.'],
  ['drum2', 'Cord drum, servo 2', 'Main fan & nozzle', 'PETG', 'Print', 8, [-222, -4, -53], 7, 'The stock servo horn presses into its recess; the horn screw holds it.', 'Its two cords run aft to the drive ring.'],
  ['fairleadR', 'Cord fairlead, right', 'Main fan & nozzle', 'PETG', 'Print', 2, [-256, -7, 53], 6, 'Glued into its slot in the rear face of the aft bridge.', 'The cords turn the corner on this hard strip, not on the soft body. Polish the two holes or line them with PTFE tube.'],
  ['fairleadL', 'Cord fairlead, left', 'Main fan & nozzle', 'PETG', 'Print', 2, [-256, -7, -53], 6, 'Glued into its slot in the rear face of the aft bridge.', 'Mirror of the right one.'],
  ['nzServo1', 'Nozzle servo 1', 'Main fan & nozzle', 'Bought', 'Owned', 14, [-216, -4, 72], 7, 'Goes up into its pocket from the belly with the drum already on it; a dab of hot glue on each ear.', 'TowerPro MG90S, buried beside the fan duct. Turns the whole nozzle about the duct axis and swings it for yaw.'],
  ['nzServo2', 'Nozzle servo 2', 'Main fan & nozzle', 'Bought', 'Owned', 14, [-216, -4, -72], 7, 'Same pocket on the left side.', 'TowerPro MG90S. Bends the nozzle: it works bearing 2 through the drive ring, and bearing 3 follows by its own cord loop.'],
  // ---- Electronics
  ['battery', 'Battery, 4-cell 2700 mAh', 'Electronics', 'Bought', 'Buy', 306, [-9, -3, 0], 10, 'Hook-and-loop strap on the tray.', 'Heaviest part. 2,700 mAh is the smallest pack that gives 3 minutes of hover at this weight; it slides from +16 (forward stop, against the lift-fan bay) back to -73 to trim balance, and sits at +8.'],
  ['batteryTray', 'Battery tray', 'Electronics', 'PETG', 'Print', 14, [-9, -19, 0], 4, 'Sits on the bay floor and slides fore and aft; hook-and-loop underneath.', 'Lets you shift the battery to trim balance without tools.'],
  ['fcSled', 'Flight-controller sled', 'Electronics', 'PETG', 'Print', 6, [367, -4, 0], 5, 'Stands on the bay floor on two feet; hook-and-loop underneath.', 'Carries the ESP32 and gyro so the whole brain lifts out for bench work.'],
  ['esp32', 'ESP32 DevKit v1', 'Electronics', 'Bought', 'Owned', 10, [355, 0, 0], 5, 'Pin headers into the sled socket.', 'Runs madflight. Reads the gyro and receiver, drives 4 motors and 4 servos.'],
  ['imu', 'Gyro board (MPU6050)', 'Electronics', 'Bought', 'Buy', 3, [398, -1, 0], 5, 'Foam tape on the sled.', 'Sits close to the balance point so it feels rotation, not sideways shake.'],
  ['rx', 'Receiver FS-iA6B', 'Electronics', 'Bought', 'Owned', 15, [352, 14, 0], 5, 'Snap clip.', 'Set to PPM output: one wire carries all channels.'],
  ['ubec', '5 V regulator', 'Electronics', 'Bought', 'Buy', 2, [392, 12, 0], 5, 'Snap clip.', '2 g buck board, 5 V 3 A. Feeds eight servos and the ESP32 from the flight battery.'],
  ['escF', 'Speed controller, lift fan', 'Electronics', 'Bought', 'Buy', 15, [360, -10, 0], 5, 'Hook-and-loop on the nose-bay floor.', '45 A bare board, 4-cell rated. It stays in the nose because nose weight is what keeps the aircraft stable.'],
  ['escM', 'Speed controller, main fan', 'Electronics', 'Bought', 'Buy', 15, [65, -18, 43], 5, 'Hook-and-loop on the battery-bay floor, beside the battery.', '45 A bare board. Moving it out of the nose shortened its motor run from 585 to 283 mm.'],
  ['escL', 'Speed controller, left roll', 'Electronics', 'Bought', 'Buy', 15, [65, -18, -43], 5, 'Hook-and-loop beside the battery, left.', '45 A bare board.'],
  ['escR', 'Speed controller, right roll', 'Electronics', 'Bought', 'Buy', 15, [65, -18, 65], 5, 'Hook-and-loop beside the battery, right.', '45 A bare board.'],
  ['pdb', 'Power board', 'Electronics', 'Bought', 'Buy', 8, [65, -18, -65], 5, 'Hook-and-loop beside the battery, left.', 'One XT60 in, five pairs out. It means a single 14 AWG trunk from the battery instead of four.'],
  ['harness', 'Wiring harness', 'Electronics', 'Bought', 'Solder', 132, [96, -34, 0], 5, 'Every run has a connector at each end: XT60 at the battery, MR30 at each motor, servo plugs at each servo.', 'Built as 25 separate runs, not one loom: each drops into the belly raceway, and any component comes out without unsoldering anything. Measured along the channels, so this is the real mass, not the 45 g the first draft assumed.'],
  ['stabServoL', 'Tail servo, left', 'Electronics', 'Bought', 'Owned', 10, [-362,  -20,  -96], 7, 'Drops into a pocket from under the boom; a clip holds it.', '9 g servo, shaft down. The horn and pushrod run under the tail so the fin root stays clear.'],
  ['stabServoR', 'Tail servo, right', 'Electronics', 'Bought', 'Owned', 10, [-362,  -20,  96], 7, 'Drops into a pocket from under the boom; a clip holds it.', '9 g servo, shaft down. The horn and pushrod run under the tail so the fin root stays clear.'],
  // ---- Landing gear
  ['gearNose', 'Nose leg', 'Landing gear', 'PETG', 'Print', 14, [437, -95, 0], 4, 'Turns on a 3 mm wire through the well walls and the PETG doubler; pushrod from the servo in the nose bay.', 'Folds aft and flat into a slot in the belly. The blade itself closes the slot, so there is no door and nothing stands in the airflow.'],
  ['gearMainR', 'Main leg, right', 'Landing gear', 'PETG', 'Print', 14, [-83, -95, 102], 4, 'Turns on a 3 mm wire through its bracket; pushrod from the servo beside it.', 'Splayed 24 degrees outboard when down, so it locks against its stop under load. Folds inward across the belly.'],
  ['gearMainL', 'Main leg, left', 'Landing gear', 'PETG', 'Print', 14, [-121, -95, -102], 4, 'Turns on a 3 mm wire through its bracket.', 'Staggered 38 mm behind the right leg so the two fold past each other across the belly.'],
  ['gearBktR', 'Main leg bracket, right', 'Landing gear', 'PETG', 'Print', 6, [-88, -25, 76], 4, 'C-clips up onto the right longeron through a pocket in the belly, where the old skid clipped.', 'Landing loads go straight into the tube, and it locks the centre section fore and aft.'],
  ['gearBktL', 'Main leg bracket, left', 'Landing gear', 'PETG', 'Print', 6, [-116, -25, -76], 4, 'C-clips up onto the left longeron.', 'Mirror of the right one; it also carries that leg servo.'],
  ['gearMountN', 'Nose leg doubler', 'Landing gear', 'PETG', 'Print', 3, [437, -36, 0], 4, 'Glued into the roof of the nose-leg well.', 'The pivot wire bears on hard PETG, not on soft LW-PLA.'],
  ['gearServoN', 'Nose leg servo', 'Landing gear', 'Bought', 'Owned', 10, [398, -8, 0], 4, 'Sits on the nose-bay floor; the pushrod drops through a slot into the leg well.', '9 g servo. Up and down only: the leg rests on a stop at each end, so the servo carries no landing load.'],
  ['gearServoR', 'Main leg servo, right', 'Landing gear', 'Bought', 'Owned', 10, [-67, -11, 58], 4, 'Pushed up into its pocket through the leg well, shaft along the aircraft axis.', '9 g servo. Its horn swings in the same plane as the leg.'],
  ['gearServoL', 'Main leg servo, left', 'Landing gear', 'Bought', 'Owned', 10, [-105, -11, -58], 4, 'Pushed up into its pocket through the leg well.', '9 g servo.'],
  ['coverRF', 'Raceway cover, right front', 'Airframe shells', 'LW-PLA', 'Print', 5, [210, -41, 75], 5, 'Slides into the T-slot from the front; a drop of glue at one end.', 'Closes the belly raceway flush with the skin. Slide it out to get at any wire.'],
  ['coverRA', 'Raceway cover, right rear', 'Airframe shells', 'LW-PLA', 'Print', 5, [27, -41, 75], 5, 'Slides into the T-slot.', 'Closes the belly raceway flush with the skin.'],
  ['coverLF', 'Raceway cover, left front', 'Airframe shells', 'LW-PLA', 'Print', 5, [210, -41, -75], 5, 'Slides into the T-slot from the front.', 'Closes the belly raceway flush with the skin.'],
  ['coverLA', 'Raceway cover, left rear', 'Airframe shells', 'LW-PLA', 'Print', 5, [27, -41, -75], 5, 'Slides into the T-slot.', 'Closes the belly raceway flush with the skin.'],
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

// Static hover trim. The roll pair and the main fan run at the same fraction f of their usable thrust; the lift fan
// then takes whatever balances the pitching moment. Returns grams per motor (M = thrust the fan must make before nozzle loss).
export function hoverTrim(mp, deflectionDeg = 90) {
  const [F, M, L] = THRUSTERS, ex = nozzleExit(Math.max(deflectionDeg, 45)), W = mp.mass, xc = mp.cg[0];
  const s = Math.max(Math.sin(Math.max(deflectionDeg, 45) * Math.PI / 180), 0.5);
  const aF = F.pos[0] - xc, aM = ex.pos[0] - xc, aR = L.pos[0] - xc, mUse = M.maxG * ex.eff * s, rUse = 2 * L.maxG;
  // Lift fan and roll pair work equally hard (fraction t); the nozzle (fraction m) takes what balance then asks of it.
  // Two equations, lift = weight and pitching moment = 0, in t and m. This is the allocation that minimises the hardest-working fan.
  const a11 = F.maxG + rUse, a12 = mUse, a21 = F.maxG * aF + rUse * aR, a22 = mUse * aM, det = a11 * a22 - a12 * a21;
  const t = W * a22 / det, m = Math.max(-W * a21 / det, 0);
  return { F: F.maxG * t, M: M.maxG * m, Mv: mUse * m, L: L.maxG * t, R: L.maxG * t, f: Math.max(t, m), fLift: t, fMain: m, rollShare: rUse * t / W };
}

// Print notes per twin part id. Geometry, file names and bed sizes come from cad/build.py via site/cad/manifest.json.
const P1 = 'Flat on its base, no supports.', UP = 'Standing on its tail end (nose up), no supports.', SPAN = 'Span vertical, root on the bed.';
export const CAD = {
  sparCarrier: 'Two blocks in one file: split to objects in the slicer and print them side by side, flat on their bases.', fanSpider: 'Flat, clips up, no supports. Counterbores face the bed.', bearingL: 'Floor on the bed; the servo window bridges 23 mm.', bearingR: P1,
  noseCone: UP + ' Split face on the bed, tip up.', yoke: 'Upside down on its flat top face; the stirrup bridges 22 mm.', cradle: 'On its side so the two arms are not layered across their bend.', podL: 'Upside down, motor pad on the bed.', podR: 'Upside down, motor pad on the bed.',
  gearNose: 'Flat on one face, 6 mm tall. Print all three legs with 6 walls and 60% infill: they take the landing load.', gearMainR: 'Flat on one face.', gearMainL: 'Flat on one face.',
  gearBktR: 'Clip mouth up, flat on its base.', gearBktL: 'Clip mouth up, flat on its base.', gearMountN: 'Flat, slot upward.',
  coverRF: 'On its back, 180 mm long. One wall, 4% infill, like the shells.', coverRA: 'On its back.', coverLF: 'On its back.', coverLA: 'On its back.',
  pdb: '', batteryTray: P1, fcSled: P1, fairleadR: 'Flat, rear face on the bed.', fairleadL: 'Flat, rear face on the bed.', noseRing: 'Flat, 12 mm tall.', hatchLatch: 'On its side so layers run along the spring.',
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
  ['battery', 'pdb', 'Battery power', 'XT60, 14 AWG pair, 141 mm', '14.8 V. The only heavy run in the aircraft.'],
  ['pdb', 'escM', 'Power', '16 AWG pair, 50 mm', ''], ['pdb', 'escL', 'Power', '16 AWG pair, 50 mm', ''], ['pdb', 'escR', 'Power', '16 AWG pair, 50 mm', ''],
  ['pdb', 'escF', 'Power', '16 AWG pair, 352 mm, right raceway', 'MR30 at both ends'],
  ['pdb', 'ubec', 'Power', '20 AWG pair', '14.8 V in, 5 V out'],
  ['escF', 'motorF', '3 phase wires', '16 AWG x 3, 210 mm', 'MR30. Swap any two to reverse.'],
  ['escM', 'motorM', '3 phase wires', '16 AWG x 3, 343 mm', 'MR30, down the left raceway'],
  ['escL', 'motorL', '3 phase wires', '18 AWG x 3, 408 mm', 'MR30, left raceway then along the spar'],
  ['escR', 'motorR', '3 phase wires', '18 AWG x 3, 408 mm', 'MR30, right raceway then along the spar'],
  ['esp32', 'escF', 'Throttle signal', 'servo lead, 40 mm', 'GPIO 32'], ['esp32', 'escM', 'Throttle signal', 'servo lead, 342 mm', 'GPIO 33'],
  ['esp32', 'escL', 'Throttle signal', 'servo lead, 342 mm', 'GPIO 25'], ['esp32', 'escR', 'Throttle signal', 'servo lead, 342 mm', 'GPIO 26'],
  ['esp32', 'nzServo1', 'Servo signal', 'servo lead, 649 mm', 'GPIO 16'], ['esp32', 'nzServo2', 'Servo signal', 'servo lead, 649 mm', 'GPIO 17'],
  ['esp32', 'stabServoL', 'Servo signal', 'servo lead, 809 mm', 'GPIO 18'], ['esp32', 'stabServoR', 'Servo signal', 'servo lead, 809 mm', 'GPIO 19'],
  ['esp32', 'gearServoN', 'Servo signal', 'servo lead, 87 mm', 'GPIO 27: all three legs can share one channel'],
  ['esp32', 'gearServoR', 'Servo signal', 'servo lead, 525 mm', 'GPIO 14'], ['esp32', 'gearServoL', 'Servo signal', 'servo lead, 525 mm', 'GPIO 12'],
  ['rx', 'esp32', 'PPM (all channels)', '1 signal wire + 5 V + ground', 'GPIO 35 (input only)'],
  ['imu', 'esp32', 'I2C data / clock', '4 wires: 3.3 V, ground, SDA, SCL', 'SDA 21, SCL 22'],
  ['ubec', 'esp32', '5 V supply', 'red/black', 'VIN and GND'],
  ['ubec', 'harness', '5 V servo rail', 'red/black to all eight servo plugs', 'servos must not be fed from the ESP32 3.3 V pin'],
];
// Every run above is cut to length, gets a connector at each end, and drops into one of the two belly raceways.
// Lengths are measured along the channels by analysis/design_v4.py, which also sets the harness mass (133 g).
export const RACEWAY = 'Two T-slots moulded into the belly, 18 mm wide and 8 mm deep, from the nose joint at x = 300 back to the battery bay at x = -66. Wires drop in from below; a cover strip slides into each slot and finishes flush with the skin. Nothing is bundled, so any one wire can be pulled out on its own.';

