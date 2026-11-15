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
| `edf_duct` | 1 | 83 | Shroud, 45 degree bellmouth, 5 straightening vanes, motor plate, first bearing flange, servo bracket |
| `edf_tail_cone` | 1 | 8 | Push fit behind the motor plate |
| `nozzle_segment_1/2/3` | 1 each | 42 / 55 / 31 | Each carries a gear sector and, for 1 and 2, the next servo bracket |
| `bearing_collar_half` | 4 | 6 | Clamp bearings 2 and 3; zip tie in the groove |
| `bearing_collar_half_j1` | 2 | 5 | Clamp bearing 1 |
| `servo_pinion` | 3 | 7 | 42 teeth against 84: the servo turns twice the joint angle |

Bought: 1 x EMAX 2306 (owned), 3 x MG90S, 6 zip ties, 4 x M3 x 6 screws, grease.

Printed mass is about 310 g; with motor and servos about 385 g. The open-propeller
tilt mount it would replace weighs about 110 g with its motor. **That is 275 g more,
all of it at the tail.**

## How the nozzle works

Three bearings in series. Bearing 1 is square to the duct. Bearings 2 and 3 are canted
40 degrees in opposite directions. Turning 2 and 3 by equal and opposite angles `b`
bends the jet by `4 * asin(sin(40) * sin(b / 2))`. Bearing 1 then turns the whole bend
to point straight down, and a little either side of that to swing the jet for yaw.

| Deflection | Bearing 1 | Bearings 2 / 3 | Largest servo angle from centre |
|---|---|---|---|
| 0 (straight aft) | -90 | 0 / 0 | 82 |
| 45 | -104 | 35 / -35 | 12 |
| 90 (straight down) | -120 | 73 / -73 | 64 |
| 100 (braking) | -124 | 82 / -82 | 82 |

With 2:1 gearing every servo stays inside +/-85 degrees, so ordinary 180 degree servos
work. The reference build needed multi-turn servos because its bearings are canted
less; the steeper cant here is what makes cheap servos possible, at the cost of a
longer nozzle (218 mm).

The same `solve()` function goes into the flight controller: two inputs (deflection,
yaw), three servo outputs.

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
- **Size.** With servos and gears the nozzle is about 180 mm across. The gap between
  the tail booms is 168 mm. Integration needs either a narrower drive (cord and drum
  in place of gears) or servos placed only above and below.
- **Not checked:** clashes are checked with the nozzle straight only, not through its
  travel.

## If it passes: what changes on the aircraft

- The aft bridge and tail booms are redrawn around a round engine nacelle.
- The main fan breathes through an opening on the spine behind the lift fan, which is
  where the real aircraft has its auxiliary inlet doors.
- The tilt mount (two bearings, yoke, cradle, two servos) is deleted; three nozzle
  servos replace two.
- The flight controller's mixer uses `solve()` and the measured thrust-versus-deflection
  curve.
