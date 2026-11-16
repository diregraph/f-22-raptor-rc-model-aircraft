# Ducted main fan and swivel nozzle: DIY bench kit

Status: first design, **nothing printed or run**. The numbers below are estimates from
fan scaling laws and momentum theory. The point of the kit is to replace them with
measurements before the airframe is redesigned around it.

Interactive model: `/nozzle.html` on the site. CAD: `cad/propulsion.py`.
Nozzle maths: `site/js/nozzle.js`, checked by `node tools/nozzle-test.mjs`. Loads on the
nozzle: `site/js/nozzle-loads.js`, checked by `node tools/nozzle-loads.mjs`. Flight-controller
and nozzle-board code: `firmware/nozzle/`, checked by `node tools/nozzle-firmware-test.mjs`. `npm test` runs all four.

## Why 80 mm, and why only the main fan

| Fact | Consequence |
|---|---|
| Fan thrust goes with speed squared and diameter to the fourth power | A small fan needs very high speed |
| Bought 70 mm fans turn 33,000-40,000 rpm | They use 2,700-3,500 KV motors |
| The EMAX 2306 1700KV on 4 cells turns about 18,000-20,000 rpm under load | A 70 mm fan on it would give roughly 0.5 kg: too little |
| The same motor on an 80 mm fan | Roughly 0.85 kg at about 30 A (450 W) |
| A three-bearing nozzle bent 90 degrees | Costs perhaps 15% of that |
| The lift fan already sits in a duct in the body, and the roll motors in ducts in the wings | Only the main motor needs a new fan to get the F-35B look at the tail |

So the kit is one printed 80 mm fan for a motor you own, plus the nozzle.

## What is in the kit

| Part | Qty | Est. g | Notes |
|---|---|---|---|
| `edf_impeller` | 1 + spares | 36 | 7 blades, clamps on the motor's M5 shaft with the propeller nut |
| `edf_duct` | 1 | 59 | Shroud, 45 degree bellmouth, 6 cambered stator vanes and one straight wire vane, motor plate, first bearing flange |
| `edf_tail_cone` | 1 | 4.5 | Push fit behind the motor plate; a thin 64 mm cone that reaches into segment 1 |
| `nozzle_segment_1/2/3` | 1 each | 23 / 33 / 18 | Plain tubes with a flange each end. Segments 1 and 2 also carry the plate for the next bearing's motor |
| `bearing_collar_half_j1` | 2 | 5 | Clamp bearing 1; zip tie in the groove behind the teeth. A 100-tooth ring gear and a homing lug |
| `bearing_collar_half_j2` / `_j3` | 2 / 2 | 5.5 | Clamp bearings 2 and 3. 110-tooth ring gears. The lug sits in a different place on each, so they are separate files |
| `nozzle_pinion` | 3 | 0.7 | Module 1, 14 teeth, for a 3 mm D shaft. Or buy brass ones |
| `seal_washer` / `seal_washer_j1` | 4 / 2 | 0.7 / 0.6 | **Cut, not printed**, from 0.25 mm PTFE sheet. `cad/dxf/` has the outlines |

Bought: 1 x EMAX 2306 (owned); 3 x N20 micro gearmotor, 6 V, 100:1, high-power, with a magnetic encoder and
extended back shaft (Pololu class, about 10.5 g each); a nozzle board made of a Waveshare RP2040-Zero and two DRV8833
motor-driver carriers on a scrap of perfboard (about 8 g); 6 x M1.6 x 4 screws; 6 zip ties, 4 x M3 x 6 screws,
silicone grease, and a 100 x 100 mm piece of 0.25 mm PTFE sheet (about $5). Parts cost about $45 for the motors and
$10 for the board.

Printed mass is about 211 g; with the fan motor, gearmotors and board about 285 g.

## How the nozzle works

Three bearings in series. Bearing 1 is square to the duct. Bearings 2 and 3 are canted
40 degrees in opposite directions. Turning 2 and 3 by equal and opposite angles `b`
bends the jet by `4 * asin(sin(40) * sin(b / 2))`. Bearing 1 then turns the whole bend
to point straight down, and a little either side of that to swing the jet for yaw.

| Deflection | Bearing 1 | Bearings 2 / 3 |
|---|---|---|
| 0 (straight aft) | -90 | 0 / 0 |
| 45 | -104 | 35 / -35 |
| 90 (straight down) | -120 | 73 / -73 |
| 100 (braking) | -124 | 82 / -82 |

Full yaw adds up to 20 degrees either way on bearing 1. Over everything the mixer asks for, bearing 1 turns
70 degrees (-140 to -70) and bearings 2 and 3 turn 82 degrees each.

## Drive: a gearmotor on each bearing

The first drive used cords: two servos in the body, cords to the bearing-1 collar and to a free ring, and a cord
loop so bearing 3 mirrored bearing 2. It was flush, but it was never strung, its margin over the servos was about
3% on guessed friction, and a cord failure would bend the nozzle uncommanded. The reference build drives each
segment with its own geared actuator and homes it, and that is proven in flight. This is the same idea:

| Bearing | Ring gear (on the collar, keyed to the part downstream) | Motor (on the part upstream) | Ratio |
|---|---|---|---|
| 1 (square) | 100 teeth, module 1 | On a plate on the fan duct, beside it on the right; the motor runs forward into a slot in the body | 7.1 |
| 2 (canted) | 110 teeth | On a plate under segment 1, near its far end | 7.9 |
| 3 (canted) | 110 teeth | On a plate on top of segment 2, near its far end | 7.9 |

- **Each joint is independent.** No cord loop, no drive ring, no coupling between servos: the board solves the three
  angles and holds each one.
- **The collar is the gear.** Its upstream half carries the teeth; its downstream half keeps the zip-tie groove and
  the notch for the key. The collar halves split on a tooth gap.
- **The motor plate is also the homing stop.** Each collar has two small lugs on its upstream face, 180 degrees
  apart. Driven past the end of its travel by 8 degrees, one lug meets the side of its motor plate. At power-up the
  board drives bearings 2 and 3 gently onto their stops, then bearing 1, and counts from there.
- **Not flush any more.** The motors on segments 1 and 2 stand out about 25 mm from the nozzle. They ride with
  the nozzle, so they swing with it; the swing check below includes them.
- **Wires cross the bearings.** The joint-2 motor's lead crosses bearing 1, and the joint-3 motor's crosses bearings
  1 and 2. Bearing 1 turns 70 degrees and bearings 2 and 3 82 degrees, so a loose loop at each is enough; no slip ring.

Assembly: screw each gearmotor to its plate (two M1.6 screws into the gearbox face), press and glue a pinion on its
shaft, then build the nozzle outward as before. When each collar goes on, turn the bearing by hand: the teeth should
mesh with a hair of play over the whole turn. If they bind, ease the screw holes in the plate outward a little.

## Can the motors hold it?

The jet does not just push the aircraft; it also tries to unbend the nozzle. The flow enters each bearing along the
axis of the part upstream, so it has no lever there, but it leaves at the exit, and that line misses the axis of
bearing 2. At 90 degrees and full thrust (958 g) that is 0.27 N m (2.8 kg cm) on bearing 2 before any friction. The
bearings also carry up to 9 N along the duct, 10 N across it and 0.9 N m of tilting moment, and the flanges turn that
into friction. The model is `site/js/nozzle-loads.js`; `tools/nozzle-loads.mjs` prints it.

Torque at the worst motor's gearbox shaft, kg cm, worst of yaw left, centre and right:

| Deflection | 0 | 30 | 45 | 60 | 90 | 100 |
|---|---|---|---|---|---|---|
| Full thrust, PETG on PETG | 0.08 | 0.31 | 0.48 | 0.62 | 0.82 | 0.87 |
| Full thrust, with PTFE washers | 0.07 | 0.23 | 0.35 | 0.46 | 0.58 | 0.61 |
| Hover thrust (266 g), with PTFE washers | 0.07 | 0.03 | 0.06 | 0.10 | 0.14 | 0.15 |

An N20 100:1 high-power motor stalls at about 2.2 kg cm on 6 V. We allow the nozzle half of that, 1.1 kg cm,
because a brushed motor holding a load draws current in proportion and must not sit near stall. Full thrust is held
at every deflection, even without the PTFE washers, so **the main fan no longer needs a thrust cap**: the old
`NozzleLimits.h` and the cap in `site/js/sim.js` are gone. In the simulated transition and back the motors peak at
0.23 kg cm with PTFE (0.32 without).

Speed is the tighter limit. The motor turns 320 rpm with no load, which is 269 deg/s at bearing 1 and 244 deg/s at
bearings 2 and 3, a little less under load. Bearing 1 has to follow both the deflection (150 deg/s, the same as
before) and the yaw swing, so the yaw slew is now 100 deg/s instead of 300 (`site/js/sim.js` `nozzleRate`; the hover
and transition checks still pass). With that, bearing 1 needs at most 207 deg/s against 236 available at full load.
The reference build slews at 15 deg/s.

A 50:1 motor would be twice as fast but would only just hold the load with PTFE, and not without it. 100:1 is the pick.

## Where the thrust goes

Compared with the reference build's nozzle (frames from its bench video), and measured on our CAD:
the bore was cut in 0.2 mm slices along the flow with the nozzle straight.

| Loss | Before | Now | Estimate |
|---|---|---|---|
| **Two 45-degree mitred joints** when bent 90 degrees | 15% assumed | 25% assumed | Handbook loss for a sharp 45-degree mitre is about 0.25-0.3 of the duct's dynamic pressure each; two of them, 1.3 diameters apart, about 0.5. With the exit converging 80 to 74 mm that is 20-30% of thrust. Every three-bearing nozzle has it; the reference's does too. Only the thrust stand will say |
| **Fan swirl** | 5 flat vanes, square to the duct | 6 cambered vanes and a straight wire vane | The rotor leaves the air turning at 17 degrees at the tip and 36 at the hub (free vortex from `analysis/fan_bem.py`); about 16% of the jet's energy is in that spin. Flat vanes meet it at up to 36 degrees and stall. Cambered vanes meet it head-on and turn it straight. Likely 4-6% more thrust, in every pose |
| **Tail cone** | 30 mm long, about 30-degree taper | 64 mm, about 17 degrees, reaching into segment 1 (which only ever turns about its own axis) | The short cone would have shed a wake the width of the motor. 1-3% |
| **Bore shape near the canted bearings** | Area swung 92% to 116% to 84%, with an 11.8 mm dip in the wall | 95% to 110% to 83%, dip 9.3 mm | The tilted neck under each collar was 10 mm long; now 6 mm, just the collar. The rest of the dip is geometry: a 91 mm round bearing on a 40-degree cut through an 81 mm bore must pinch the bore top and bottom. Removing it needs a 106 mm bearing, which would not fit between the tail booms. About 1-2% |
| **Leaks at the bearings** | 0.5 mm play, no seal | Spigot and PTFE washer | About 3%, see Sealing |

Raising the bend loss from 15% to 25% did not change the hover limit; the main fan works a little harder at 90
degrees (about 266 g instead of 237 g).

What the reference does differently, from its video: bearing rings bolted together with many screws, probably ball
races; long, plain segments; and a convergent petal exit. Its gear drive is what this nozzle now copies. Its
controller settings show a 90-degree angle limit, a 10-degree yaw limit, a slew of 15 deg/s and a "homing torque".
Our yaw limit is 20 degrees and our slews 150 and 100 deg/s; if the bench shows the joints overshooting, these are
the first numbers to bring down.

Further gains, not done: a smoother, sanded or epoxy-coated bore (print the segments standing up so
the layer lines run round the bore, not across the flow), and a petal exit like the reference's,
which is mostly looks.

## Sealing

Each bearing is two flanges clamped in a collar. Before this change the faces had 0.5 mm of play
and nothing in the gap. The static pressure inside the nozzle is only about 300 Pa at full thrust (the
exit converges from 80 to 74 mm), so the leak is small but real: about 1% of the flow per bearing,
roughly 3% of thrust over three bearings. The play was also slack that would let the bend wobble.

- **Spigot and counterbore.** The downstream part has a 2 mm lip, 0.9 mm thick, the same bore as the
  duct, that turns inside a counterbore in the upstream flange with 0.4 mm clearance. The joint is
  behind a step, out of the jet, and air has to turn twice to escape. The bore stays smooth.
- **PTFE washers.** One 0.25 mm washer between the flange faces closes the gap; a second, behind the
  upstream flange, takes up the remaining play. The collar slot is now 0.6 mm wider than the two
  flanges, so two washers leave 0.1 mm of running clearance. Silicone grease on both sides.

Cut the washers with a craft knife round a template (print the washer STL), a vinyl cutter, or a laser (the DXF
files are in `cad/dxf/`). The seal adds 4 g.

## Controller

Two halves, as on the reference build: the flight controller decides what deflection and yaw it wants, and a small
board on the nozzle makes the joints do it. `tools/nozzle-firmware-test.mjs` checks both.

### Flight-controller script

`firmware/nozzle/nozzle_3bsm.lua`, an ArduPilot script (`ardupilot/scripts/` links to it). Every 10 ms:

1. **Radio lost:** hold the last deflection and centre the yaw.
2. **Hover guard:** while airborne below 6 m/s, keep at least 35 degrees of deflection, fading out by
   17 m/s (same as `site/js/sim.js`). Nothing aft of the balance point holds the tail up otherwise.
3. **Rate limit:** 150 deg/s of deflection and 100 deg/s of yaw.
4. **Send** deflection (0 to 100 degrees = 1,000 to 2,000 us) and yaw (-20 to +20 degrees = 1,000 to 2,000 us) on
   outputs 10 and 11 (Script 1 and Script 2).

### Nozzle board

An RP2040-Zero reads the two pulses and the three encoders, and drives the three motors through two DRV8833 boards.
The controller is `firmware/nozzle/Nozzle3BSM.h` (no Arduino calls, so the PC test runs the same code); the pins are
in `firmware/nozzle/nozzle_board/nozzle_board.ino`. It has not been built or run on hardware yet.

| Board pin | Goes to |
|---|---|
| GP26, GP27 | Deflection and yaw pulses from the flight controller (outputs 10, 11) |
| GP0/1, GP2/3, GP4/5 | Encoder A/B of the joint 1, 2 and 3 motors (encoders on 3.3 V) |
| GP6/7, GP8/9 | Driver 1, AIN and BIN: joint 1 and joint 2 motors |
| GP10/11 | Driver 2, AIN: joint 3 motor |
| 5 V pin, driver VM | 6 V from the servo rail, by its own 22 AWG pair. Driver nSLEEP pulled high |

What it does:

1. **Homes at power-up.** It does not know where the joints are, so it drives bearings 2 and 3 at 35% duty (about
   0.8 kg cm, gentle on the lugs) until each has not moved for 0.25 s, then bearing 1 the same way. That takes
   about 4 s from anywhere. The nozzle ends nearly straight, so homing on the ground is safe.
2. **Waits** for the flight controller's pulses, then moves off the stops at 30 deg/s per joint.
3. **Solves** the three bearing angles from deflection and yaw (`solve()`, the same as `site/js/nozzle.js`), with its
   own 150 and 100 deg/s slew limits.
4. **Holds each joint** with a PI loop plus feed-forward of the target's speed. Inside 0.1 degree it only holds the
   load, so it does not hunt. Encoder resolution is 24 to 26 counts per joint degree.
5. **Pulses lost:** holds the last command.

On the PC model (motors, gears, the jet's load, friction and stops) it homes in 3.7 s, holds the hover pose within
0.2 degrees, follows a 15-degree yaw swing within 0.5 degrees in 0.5 s, and lags at most 3.4 degrees for the first
instant of a full 90-to-0 move while the motors spin up.

## Test plan (the gate before any airframe change)

1. **Print one bearing pair first** (the rear of `nozzle_segment_1`, the front of
   `nozzle_segment_2`, two collar halves): check it turns freely with grease.
2. **Print the impeller.** Balance it on the motor shaft: spin by hand, mark the heavy
   side, sand the blade tips of that side.
3. **Fan alone on the thrust stand.** Duct zip-tied to the wood block, exhaust clear.
   Step the throttle 30 / 50 / 70 / 100% and log grams and amps.
4. **Add the nozzle straight**, repeat. Then at 45 and 90 degrees with the scale turned
   to read the right direction.
5. **Decide on thrust** (table below). The airframe needs about 450 g from the nozzle at 90 degrees for hover
   at about 60% throttle. Below 550 g at full throttle through the bent nozzle, this
   route does not carry the aircraft with this motor.

| Result at full throttle, nozzle at 90 degrees | Decision |
|---|---|
| 700 g or more | Integrate as designed |
| 550-700 g | Integrate, but shift more lift to the front fan and roll pair |
| Under 550 g | Change the blade pitch or count and retest; if still short, a higher-KV motor on 70 mm, or stay with the open propeller |

6. **Wiring and directions** (nozzle board on USB, serial monitor at 115200, fan off, no pulses connected). Turn each
   bearing by hand: its angle must go up when the joint turns the positive way (the viewer shows which way that is). If
   not, swap that encoder's A and B wires. Then connect the pulses: during homing each joint must run toward its stop,
   not away. If one runs away, swap its two motor wires.
7. **Check the stops.** After homing, command 45 degrees and measure each bearing with a protractor or a phone
   inclinometer against the viewer. An error of more than a degree means the lug meets the plate somewhere other
   than drawn: put the measured stop angle in `stop[]` in `Nozzle3BSM.h` (and `STOP_Q` in `cad/propulsion.py`).
8. **Measure the load.** Nozzle on the stand at 90 degrees, fan at the hover setting, then full. The serial monitor
   prints each motor's duty: anything over 0.5 held steadily means more friction than modelled. Check the washers and
   the gear mesh first.

## Risks, plainly

- **Blade loss.** A printed blade at 18,000 rpm carries roughly 9 MPa at the root. PETG
  can take it with margin if the layers bond well, but a bad print can shed a blade.
  Run behind a board, wear eye protection, never stand in line with the fan disc.
- **Motor heat.** 30 A continuous in a closed hub with no airflow over the bell is
  harder on the motor than an open propeller. Check temperature after 30 s runs.
- **Thrust may fall short.** Printed fans are usually less efficient than moulded ones.
- **Weight at the tail** moves the balance point aft. The battery can no longer slide to
  compensate, so integration will need the nozzle as short and thin as tests allow.
- **The gear drive is drawn and checked, not built.** Checked for clashes and swing (motors included), load and
  speed, and the controller against a model on the PC. Open questions for the bench: how well printed module-1 teeth
  mesh across a 110-tooth ring, whether the motor plates are stiff enough to keep the mesh under load, and the real
  stop angles.
- **A motor or encoder failure** leaves that joint where it is (the gearbox holds against the load with power off,
  probably, but this is unmeasured). In the hover a frozen bearing 1 loses yaw; a frozen bearing 2 or 3 leaves the
  jet partly bent. Fly it tethered first.

## Integrated into the airframe (drawn ahead of the thrust test)

The twin and the CAD now show the aircraft with the ducted main fan and nozzle fitted.
This was drawn before any measurement at the owner's request; if the thrust test
fails, the aft fuselage goes back to the open-propeller version in git history.

- **Engine nacelle.** A round nacelle on the aft bridge holds the fan duct, which slides
  in from the rear.
- **Air inlet.** The rear 36 mm of the centre section is open above and below, between
  the bay and the fan. The dorsal opening is where the real aircraft has its auxiliary
  inlet doors.
- **Nozzle between the booms.** Checked by script in 15 poses (deflection 0 to 100
  degrees, yaw left, centre and right): no clash with booms, fins, tailplanes or ground.
  The yaw swing is tapered from 20 to 8 degrees past 90 degrees deflection to keep that
  true, with the gearmotors riding on segments 1 and 2. They make the nozzle 85 mm half-width at its widest (90
  degrees, full yaw), but the closest it comes to a boom is 8.5 mm and to the ground 10 mm.
- **Nozzle drive inside the body.** The joint-1 gearmotor sits in a slot on the right of the fan duct, open aft, so
  it goes in with the duct; the nozzle board stands in a bay on the left, open to the belly, and a channel under the
  duct joins them. The nacelle grew from 94 to 102 mm so the first bearing ring sits flush with it.
- **Taller skids.** The nozzle hangs 140 mm below the datum when it points down, so the
  ground line moved from 85 to 150 mm below the datum.
- **Tilt mount deleted:** two bearings, yoke, cradle and two servos gone; three gearmotors, a nozzle board and three
  geared collars added.
- **Speed controllers** now stand on edge against the bay side walls, because the bay
  lost its rear 26 mm to the inlet.
- **Controller behaviour.** With the nozzle straight, nothing aft of the balance point
  can hold the tail up. The flight controller therefore keeps the nozzle at least 35
  degrees down until the wing is flying (fully below 6 m/s, fading out by 17 m/s), whatever
  the pilot asks for. See "Controller".

### Lift fan

`lift_fan_rotor` is a 120 mm, 9-blade rotor on the existing spider and motor, a mirror
image of the main fan so the two torques oppose. It is sized by motor torque: about
20 A in the hover at 13,500 rpm, an estimated 1.3 kg at 30 A. `lift_fan_ring` is a hard
PETG shroud pressed into the fan bay so the 0.6 mm tip gap does not depend on the soft
LW-PLA body. Test it on the thrust stand the same way as the main fan.

### Estimated numbers for the integrated aircraft

| Quantity | Value |
|---|---|
| All-up weight | about 1,890 g (was 1,575 g with open propellers) |
| Balance point | 82 mm behind the datum (was 70 mm) |
| Usable thrust / weight | about 1.60 |
| Hover load: lift fan / main fan / each roll motor | 60% / 64% / 64% of estimated maximum |

These margins are thin and rest on three unmeasured thrust figures (1,300 g lift fan,
850 g main fan, 500 g per roll motor) and a guessed 15% nozzle loss.
