# Ducted main fan and swivel nozzle: DIY bench kit

Status: first design, **nothing printed or run**. The numbers below are estimates from
fan scaling laws and momentum theory. The point of the kit is to replace them with
measurements before the airframe is redesigned around it.

Interactive model: `/nozzle.html` on the site. CAD: `cad/propulsion.py`.
Nozzle maths: `site/js/nozzle.js`, checked by `node tools/nozzle-test.mjs`.

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
| `edf_duct` | 1 | 76 | Shroud, 45 degree bellmouth, 5 straightening vanes, motor plate, first bearing flange |
| `edf_tail_cone` | 1 | 8 | Push fit behind the motor plate |
| `nozzle_segment_1/2/3` | 1 each | 40 / 40 / 21 | Plain tubes with a flange each end. Segment 1 also has a sleeve for the drive ring, four cord posts and a cord band; segment 2 has two cord posts |
| `bearing_collar_half` | 4 | 5 | Clamp bearings 2 and 3; zip tie in the middle groove. Also cord pulleys |
| `bearing_collar_half_j1` | 2 | 4 | Clamp bearing 1. Also servo 1's pulley |
| `nozzle_drive_ring` | 1 | 6 | Free ring behind bearing 1, turned by servo 2 |
| `servo_cord_drum` | 2 | 10 | 55 mm cord drum on each servo horn |
| `cord_fairlead_right/left` (in `cad/build.py`) | 1 each | 2 | Hard strip in the rear face of the body where the cords turn the corner |

Bought: 1 x EMAX 2306 (owned), 2 x MG90S (owned), about 3 m of 0.5 mm braided fishing
line, 6 zip ties, 4 x M3 x 6 screws, grease. Optional: offcuts of PTFE tube (the 2 mm
bore printer kind) to line the fairlead holes.

Printed mass is about 275 g; with motor and servos about 340 g.

## How the nozzle works

Three bearings in series. Bearing 1 is square to the duct. Bearings 2 and 3 are canted
40 degrees in opposite directions. Turning 2 and 3 by equal and opposite angles `b`
bends the jet by `4 * asin(sin(40) * sin(b / 2))`. Bearing 1 then turns the whole bend
to point straight down, and a little either side of that to swing the jet for yaw.

| Deflection | Bearing 1 | Bearings 2 / 3 | Servo 1 | Servo 2 |
|---|---|---|---|---|
| 0 (straight aft) | -90 | 0 / 0 | +26 | -44 |
| 45 | -104 | 35 / -35 | +2 | 0 |
| 90 (straight down) | -120 | 73 / -73 | -26 | +44 |
| 100 (braking) | -124 | 82 / -82 | -33 | +54 |

Servo angles are from each servo's centre, with no yaw. Full yaw adds up to 37 degrees
to both. The largest swing anywhere is +/-81 degrees, inside an ordinary servo's +/-85.

## Flush drive: cords, not gears

The first version had a servo and a 52 mm gear standing on each bearing, about 180 mm
across. That cannot be made flush: an ordinary servo turns about 170 degrees and each
bearing about 80, so the gear on the servo must be half the size of the ring it drives.

Now nothing rides on the nozzle. It is 109 mm across at its widest ring, against a
102 mm nacelle.

![Cord routing](../site/img/nozzle-cords.svg)

| Who | Pulls | Through | Result |
|---|---|---|---|
| Servo 1 (right side of the body) | Bearing-1 collar, which is keyed to segment 1 | 2 cords: one over the top of the collar, one under | Rolls the whole nozzle about the duct axis: aims the bend down, swings it for yaw |
| Servo 2 (left side) | A free ring just behind bearing 1 | 2 cords, same pattern | Turns the ring |
| The ring | Bearing-2 collar, keyed to segment 2 | 2 cords crossing the short side of segment 1, through 4 posts | Bends the jet |
| Segment 1 (a band on its long side) | Bearing-3 collar, keyed to segment 3 | 2 cords through the bumps on the bearing-2 collar and 2 posts on segment 2 | Bearing 3 turns equal and opposite to bearing 2. No servo |

Three facts make this work:

1. **Bearings 2 and 3 always turn by equal and opposite angles.** So one can drive the
   other. Seen from segment 2, segment 1 and segment 3 turn the same way by the same
   amount; a cord loop between two pulleys of the same radius (53.4 mm) enforces that.
2. **A collar is a free ring until it is keyed.** Each collar now has a notch that
   catches a rib behind the flange of the part downstream of it, so it turns with that
   part and can serve as its pulley.
3. **The ring's position is a + 1.07 x b** (bearing-1 angle plus 1.07 times bearing-2
   angle; 1.07 is the ratio of the two pulley radii). The flight controller works that
   out; it is one line in `servoAngles()`.

Each servo stands on edge in a pocket beside the fan duct, open to the belly, with its
55 mm drum already on it. The cords leave the drum top and bottom, run aft inside the
body, and turn the corner at a PETG fairlead strip in the body's rear face.

**Stringing it** (do this on the bench, nozzle off the aircraft, before fitting):

1. Every bearing turns freely by hand with the collar zip-tied. Fix that first.
2. Slave loop: nozzle straight. Knot one cord through the hole at each end of the band
   on segment 1, lead each through its bump on the bearing-2 collar and its post on
   segment 2, half a turn round the bearing-3 collar's front groove, and knot in a slit.
   Turn bearing 2 by hand: bearing 3 must mirror it over the whole 82 degrees.
3. Ring to bearing 2: same idea, from the ring's rear groove through the posts on
   segment 1 to the bearing-2 collar's front groove.
4. Fit the nozzle. Centre both servos. String servo 1 to the bearing-1 collar and
   servo 2 to the ring's front groove with the nozzle at 45 degrees (both servos are
   near centre there).
5. Take up slack with the knots. Cords should be snug, not guitar-string tight.

The same `solve()` function goes into the flight controller: two inputs (deflection,
yaw), two servo outputs.

## Test plan (the gate before any airframe change)

1. **Print one bearing pair first** (the rear of `nozzle_segment_1`, the front of
   `nozzle_segment_2`, two collar halves): check it turns freely with grease.
2. **Print the impeller.** Balance it on the motor shaft: spin by hand, mark the heavy
   side, sand the blade tips of that side.
3. **Fan alone on the thrust stand.** Duct zip-tied to the wood block, exhaust clear.
   Step the throttle 30 / 50 / 70 / 100% and log grams and amps.
4. **Add the nozzle straight**, repeat. Then at 45 and 90 degrees with the scale turned
   to read the right direction.
5. **Decide.** The airframe needs about 450 g from the nozzle at 90 degrees for hover
   at about 60% throttle. Below 550 g at full throttle through the bent nozzle, this
   route does not carry the aircraft with this motor.

| Result at full throttle, nozzle at 90 degrees | Decision |
|---|---|
| 700 g or more | Integrate as designed |
| 550-700 g | Integrate, but shift more lift to the front fan and roll pair |
| Under 550 g | Change the blade pitch or count and retest; if still short, a higher-KV motor on 70 mm, or stay with the open propeller |

## Risks, plainly

- **Blade loss.** A printed blade at 18,000 rpm carries roughly 9 MPa at the root. PETG
  can take it with margin if the layers bond well, but a bad print can shed a blade.
  Run behind a board, wear eye protection, never stand in line with the fan disc.
- **Motor heat.** 30 A continuous in a closed hub with no airflow over the bell is
  harder on the motor than an open propeller. Check temperature after 30 s runs.
- **Thrust may fall short.** Printed fans are usually less efficient than moulded ones.
- **Weight at the tail** moves the balance point aft. The battery can no longer slide to
  compensate, so integration will need the nozzle as short and thin as tests allow.
- **Cord drive is the least proven part.** It has been drawn and checked for clashes,
  not strung. Open questions for the bench: friction where each cord turns 90 degrees
  at the fairlead (an MG90S should leave roughly 2.5 kg cm at the bearing after that
  loss; the gears gave about 4); stretch and backlash in about 3 m of line; whether the
  cords stay in 1.4 mm grooves where they cross from one pulley to the next at an angle.
  Likely first fixes: PTFE-lined fairleads, deeper grooves, a spring in each cord pair.
- **A cord failure bends or straightens the nozzle uncommanded.** In the hover that is
  a pitch upset the lift fan cannot fully correct. Fly it tethered first.

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
  true. The nozzle is flush: 82 mm half-width at its widest, inside the 84 mm gap.
- **Nozzle servos inside the body.** Two pockets in the aft bridge, one each side of the
  fan duct, open to the belly. The nacelle grew from 94 to 102 mm so the first bearing
  ring sits flush with it.
- **Taller skids.** The nozzle hangs 140 mm below the datum when it points down, so the
  ground line moved from 85 to 150 mm below the datum.
- **Tilt mount deleted:** two bearings, yoke, cradle and two servos gone; two nozzle
  servos, two drums, a drive ring and three collars added.
- **Speed controllers** now stand on edge against the bay side walls, because the bay
  lost its rear 26 mm to the inlet.
- **Controller behaviour.** With the nozzle straight, nothing aft of the balance point
  can hold the tail up. The flight controller therefore keeps the nozzle at least 60
  degrees down until the wing is flying, whatever the pilot asks for.

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
