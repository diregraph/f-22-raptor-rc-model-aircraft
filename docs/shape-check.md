# Shape check against reference models

Checked on 15 Nov 2026 against the two Sketchfab F-35B models linked in the brief
(viewed live in a headless browser and orbited), the Wikipedia specifications, and
the photos on Eric Maglio's project page. MakerWorld blocks automated access and was
not used. Reference images are not stored in this repository.

| Feature | Real aircraft | This model | Verdict |
|---|---|---|---|
| Wing span / overall length | 0.70 (11 m / 15.7 m) | 0.69 (690 / 996 mm) | Matches |
| Body width / wing span | about 1/3 | 0.31 (216 / 690) | Matches |
| Wing planform | Leading edge swept about 34 deg, trailing edge swept forward, clipped tip | Same | Matches |
| Tailplane span / wing span | about 0.62 | 0.63 after correction (was 0.76) | Corrected |
| Fins | Twin, canted outward about 25 deg, both edges swept aft, clipped tip | Same | Matches |
| Fuselage section | Rounded top, chine, faceted deep belly | Rounded top, chine, faceted belly, 84 mm deep | Matches in character |
| Intakes | Side intakes beside the cockpit with forward-swept lips | Swept lips on the fan-bay corners, running 32 mm ahead of the intake face | Corrected |
| Dorsal line | Rounded spine from canopy to nozzle | Rounded upper surface from the chine over the top; spine behind the lift fan | Corrected |
| Wing position | Root leading edge about 40% of length from the nose | 44% after correction (was 49%) | Corrected |
| Nose length | Intake face about 29% of length from the nose | 28% after lengthening the nose to 278 mm (was 24%) | Corrected |
| Roll control | Hidden roll ducts in the wings | Roll motors buried in the wings in 110 mm ducts; clean wing tips (were tip pods) | Corrected |
| Lift fan and nozzle | Ducted lift fan with doors; swivel nozzle between the booms | Shrouded 120 mm lift fan, no doors; ducted 80 mm fan with a three-bearing swivel nozzle between the booms, servos visible above it | Corrected (untested hardware) |

Second pass (same day): the wing was moved 60 mm forward and the nose lengthened by
58 mm. Consequences of the wing move:

- The spar now crosses the electronics bay. The battery sits ahead of it with only a
  few millimetres of slide, so balance can no longer be trimmed by sliding the battery.
- The speed controllers moved behind the spar, stacked in pairs across the bay.
- The spar carrier became two separate blocks, one per longeron.
- Pitch stability margin in forward flight is smaller: the balance point is now only
  about 10 mm ahead of the estimated neutral point. The flight controller holds it in
  the simulator, but treat forward flight as stabilised-only until measured.

Third pass: the upper fuselage was rounded and the roll motors were moved from
wing-tip pods into ducts inside the wings, with 4 in propellers in place of 5 in.
The roll pair is estimated at 500 g thrust each (was 700 g), so four-motor
thrust-to-weight falls from about 2.1 to about 1.9.

What cannot be matched without changing the propulsion: a closed lift-fan door, and
a nozzle in place of the open main propeller. A cover over the tail notch was
considered and rejected: in hover it would sit directly above the main propeller
and starve it of air.
