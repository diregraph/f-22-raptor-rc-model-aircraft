# Fourth loop: blended shape, retracting legs, built-in wiring

Live charts: `/analysis.html#v5`. Script: `python3 analysis/layout_v5.py` (after `node tools/export-parts.mjs`;
about 2 minutes). Writes `site/analysis/v5.json`. **Applied to the CAD and the twin**, unlike the third loop.

The third loop studied a 1,717 g aircraft on paper. This loop drew it, and drawing it changed the answer.

## What this loop drew

| Change | What it is | Why |
|---|---|---|
| Blended body | The fuselage is now one lofted shell from nose to tail, with the wing root blended into it and the fin sockets cut from the booms instead of sitting on them. The nozzle finishes flush with the skin | The owner asked for a flush, blended look. It also removes the step the first draft had at the wing root |
| Retracting legs | Three legs: nose at x = 437, mains at x = -83 and -121, 80 mm out. Each folds 90° into a bay in the belly and the bay closes against the skin. One 9 g servo per leg | Nothing hangs in the airflow once airborne. In the simulator the wing gives back about 29% of its drag when the legs come up |
| Built-in wiring | Two T-slots, 18 mm wide and 8 mm deep, moulded into the belly from x = 300 back to the battery bay at x = -66. Each of the 25 runs drops into a slot from below; four printed covers slide in and finish flush | The owner asked for no wire mess and a connector at each end. Any component now comes out without unsoldering anything |
| Controllers beside the battery | Three of the four speed controllers and the power board moved under the top hatch, next to the pack. The lift-fan controller stays in the nose | Shortest total wiring of the three places tried, and it leaves the balance point where the battery can still trim it |
| Carbon tubes | 8 × 1 mm carbon in place of 8 mm aluminium | 24 g lighter and stiffer |

## What drawing it cost

The paper design assumed 45 g of wiring. Measured run by run along the real channels, with connectors
at both ends, it is **132 g**. Retracting the legs instead of hanging skids in the airflow costs **36 g**
of servos. Printed shells also gained mass once the channels, bays and wells existed in them.

So the honest all-up weight is **1,981 g**, not 1,717 g, and R1 moves from 1,900 g to 2,000 g. The
alternative was to keep the number and drop either the wiring or the legs, both of which the owner asked
for. The weight is recorded as it is rather than as it was hoped to be.

## Where the electronics go

18 combinations: three places for the three movable speed controllers and the power board, two lift
motors, three battery sizes. Each is scored against the real parts list.

| Controllers | Lift motor | Pack | Weight | Harness | Margin | Worst fan | Hover | Fails |
|---|---|---|---|---|---|---|---|---|
| Beside the battery | 2306 owned | 2,200 | 1,915 g | 132 g | +5.4% | 62% | 2.8 min | hover, time |
| Beside the battery | 2807 1,500 KV | 2,200 | 1,929 g | 132 g | +6.0% | 58% | 2.9 min | time |
| **Beside the battery** | **2807 1,500 KV** | **2,700** | **1,981 g** | **132 g** | **+6.0%** | **60%** | **3.4 min** | **none — chosen** |
| Beside the battery | 2807 1,500 KV | 3,300 | 2,045 g | 132 g | +6.0% | 62% | 3.9 min | hover |
| In the lift-fan bay | 2807 1,500 KV | 2,700 | 1,987 g | 138 g | +6.0% | 60% | 3.4 min | none |
| In the nose bay | 2807 1,500 KV | 2,700 | 2,019 g | 170 g | +7.8% | 61% | 3.3 min | hover |

Full table on the page. The nose bay loses twice: 38 g more wire, and the aircraft runs nose-heavy, which
puts more of the hover on the lift fan. The fan bay ties with the chosen layout on every number but puts
the controllers in the fan's own airflow, which nothing in the model accounts for.

## Scorecard

| ID | Requirement | Target | As drawn now | Met? |
|---|---|---|---|---|
| R1 | All-up weight | 2,000 g or less (was 1,900) | 1,981 g | Yes |
| R2 | Hardest-working fan in the hover | 60% or less | 59.6% | Yes, with nothing to spare |
| R3 | Pitch stability margin | +5 to +12% | +6.5% | Yes |
| R4 | Stall speed | 12 m/s or less | 11.5 m/s | Yes |
| R5 | Hover time | 3 min or more | 3.4 min (±20%) | Yes |
| R6 | Largest part fits the 220 × 220 × 250 mm bed | all parts | all parts | Yes |
| R9 | Nothing in the airflow on the ground | retractable | three retracting legs | Yes |
| R10 | Wiring the owner can service | connector at each end | 25 runs, 2 raceways, 4 covers | Yes |
| R11 | Cost of parts still to buy | as low as the targets allow | about $90 | See `docs/bill-of-materials.md` |

## Verification

- **Clashes.** `python3 cad/build.py` checks every part against the tubes, servos, propeller discs,
  battery and each other: none. `python3 cad/propulsion.py` does the same for the fan and nozzle kit,
  through 15 nozzle poses: none, and the lowest point of the installed nozzle is 10 mm above the ground.
- **Bed.** No part exceeds 220 × 220 × 250 mm.
- **Folded legs.** Each leg's pivot sits one blade-width above the belly line, so a folded leg clears the
  skin. Checked at both ends of the travel.
- **Flight.** `npm test`: 13 of 13 checks. The legs retract above 11 m/s and extend below 8 m/s, the
  transition holds height and ends within 20° of heading, and the cruise is wing-borne with the lift fan off.
- **Renders.** Six views of the twin, legs up and down, against the CAD.

## What is still unmeasured

Everything that matters most. The lift fan's 1,344 g and the roll pair's 1,646 g both come from models,
not from a thrust stand, and the chosen layout needs both in full: the hardest-working fan sits at 59.6%
against a 60% limit. If the stand comes in low, the 2,200 mAh pack buys back 52 g at the cost of half a
minute of hover.

## Next

1. Thrust stand: lift fan on a 1,500 KV motor, and one roll motor in its wing duct.
2. Weigh a printed shell section and a metre of made-up harness against the estimates.
3. Transition corridor in JSBSim with the gear schedule in it, not just in the simple simulator.
