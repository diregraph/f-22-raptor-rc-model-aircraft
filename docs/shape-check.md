# Shape check against reference models

Checked on 15 Nov 2026 against the two Sketchfab F-35B models linked in the brief
(viewed live in a headless browser and orbited), the Wikipedia specifications, and
the photos on Eric Maglio's project page. MakerWorld blocks automated access and was
not used. Reference images are not stored in this repository.

| Feature | Real aircraft | This model | Verdict |
|---|---|---|---|
| Wing span / overall length | 0.70 (11 m / 15.7 m) | 0.71 (660 / 930 mm) | Matches |
| Body width / wing span | about 1/3 | 0.33 (216 / 660) | Matches |
| Wing planform | Leading edge swept about 34 deg, trailing edge swept forward, clipped tip | Same | Matches |
| Tailplane span / wing span | about 0.62 | 0.63 after correction (was 0.76) | Corrected |
| Fins | Twin, canted outward about 25 deg, both edges swept aft, clipped tip | Same | Matches |
| Fuselage section | Faceted with a chine, deep belly | Six-sided sections with chine, 84 mm deep | Matches in character |
| Intakes | Side intakes beside the cockpit with forward-swept lips | Recesses at the fan-bay corners, no swept lip | Simplified |
| Dorsal line | Rounded spine from canopy to nozzle | Flat top with a spine only behind the lift fan | Simplified |
| Wing position | Root leading edge about 40% of length from the nose | 49% | About 7% too far aft |
| Propulsion | Ducted lift fan with doors, swivel nozzle, hidden roll ducts | Open propellers, tip pods, open fan hole, propeller notch | Functional choice |

The wing-position error is the largest remaining shape difference. Correcting it
moves the spar forward into the electronics bay, which needs the speed controllers
relocated to the bay side walls.
