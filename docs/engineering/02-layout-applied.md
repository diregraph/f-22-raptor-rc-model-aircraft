# Second loop: the sized layout applied to the CAD

Live scorecard and charts: `/analysis.html`. The 3D model, STL files and simulator all show this layout.

## What happened

The layout proposed by the first sizing study was applied, and then checked again on the geometry
as actually drawn. Two things did not survive that check, and the design changed again:

1. **The larger lift fan does not fit 80 mm further forward in the old body.** The nose is too
   narrow there. The wide centre body was lengthened 70 mm at the front; the aircraft is now
   1,008 mm long (was 938 mm).
2. **That longer flat forebody lifts, which made the aircraft unstable again (-3%).** A bigger
   tailplane was tried and does almost nothing: the tail sits directly behind the wing, in its
   wake. What worked was moving the speed controllers and flight electronics into the nose,
   under a lift-off canopy.

A fault in the aerodynamic model was also found and fixed on the way: with wing and tail close
together its answers were noisy. Wing and tail panels are now aligned spanwise; results became
consistent (more tail always gives more stability, though very little).

## Scorecard

| Requirement | Target | First layout | As drawn now |
|---|---|---|---|
| Pitch stability margin | +5 to +12% | -23.6% | +7.2% |
| Hardest-working fan in hover | 60% or less | 74% | 78% |
| Stall speed | 12 m/s or less | 13.5 | 11.6 |
| Weight | 1,900 g or less | 1,892 g | 1,938 g |

## The lift fan

"Larger and slower" turned out to be half right. The motor is limited by current, which means
by torque. A larger fan with the same blades needs more torque, so it turns slower and gives
*less* thrust. What the motor wants is a larger disc with **finer, fewer blades**, so it can
spin up to where it delivers its power. Chosen: 140 mm, 7 blades, about 1,200 g expected at
35 A (the 120 mm fan: about 1,000 g). The fan model gave between 1,200 and 1,360 g for this
design depending on how it was started, so treat 1,200 g as the estimate and the thrust stand
as the answer. Blade tip speed is about 110 to 150 m/s: print at 100% infill and test behind a board.

## Open problems, in order

1. **Hover margin.** 78% on the lift fan and roll motors, 28% on the tail nozzle. Even shared
   perfectly, this thrust and weight give 64%. Needs more lift-fan thrust (measured, not
   modelled), or 150 to 200 g less weight, or both. The main fan and nozzle are now mostly
   forward-flight equipment.
2. **Tail trim.** Level flight at 18 m/s needs about 20 degrees of tail out of 25. The
   cambered SD7062 section pitches the nose down and the tail is weak. Options: a section
   with less camber, trailing-edge flaps on the wing set slightly up, or a faster cruise.
3. **Transition** loses about 2.7 m of height in the simulator and takes about 25 s.
4. **Weight** is 38 g over the 1,900 g target: the longer body.
5. **Wiring** is long: battery in the centre, speed controllers in the nose. Add a capacitor
   at the controllers; check the two ducts (10 x 8 mm each) take the bundle.
6. Not rechecked against photos: the outline (longer forebody, wing further aft).
