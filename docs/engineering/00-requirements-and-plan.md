# Engineering plan: requirements, tools, first findings

Status: phase 1 (requirements) drafted, phase 2 (sizing) started. Deadline relaxed by the
owner: do it properly. Nothing printed or measured yet.

## Decisions taken

| Question | Decision |
|---|---|
| Mission | Hover, transition to wing-borne flight, transition back |
| Looks vs performance | F-35B outline stays; hidden changes allowed (aerofoil, twist, tail size, underside) |
| Structure | Printed airframe on carbon tubes left over from the Super Stingray VTOL build (lengths to be measured) |
| Schedule | No fixed date. Simulate, then bench-test, then print the airframe |

## Draft requirements (to be agreed)

| ID | Requirement | Target | Today (estimate) | Met? |
|---|---|---|---|---|
| R1 | All-up weight | 1,900 g or less | 1,892 g | Yes, no margin |
| R2 | Hover thrust margin: each fan at or below this share of its maximum | 60% | 60 / 64 / 64% | No |
| R3 | Pitch stability in forward flight (static margin: how far the balance point sits ahead of the point where lift acts, as % of wing chord) | +5 to +12% | -14 to -24% | **No** |
| R4 | Stall speed | 12 m/s or less | 13.5 m/s | No |
| R5 | Hover time | 3 min | not yet computed | ? |
| R6 | Largest part fits the K1C bed (220 x 220 x 250 mm) | all parts | all parts | Yes |
| R7 | Assembly by clips and pins, no glue on parts that are replaced after a crash | all crash parts | most | Partly |
| R8 | Outline matches the F-35B in plan and side view | within 5% of proportions | see `docs/shape-check.md` | Yes |

## Tool chain

| Job | Tool | Where it runs | State |
|---|---|---|---|
| Geometry | CadQuery (`cad/`) | here | in use |
| Wing, tail, stability, drag | AeroSandbox + NeuralFoil (`analysis/`) | here | first run done |
| Flight dynamics and controller | JSBSim | here | installed, model not written |
| Fan blade design | blade-element code, checked against the thrust stand | here | to write |
| Duct and nozzle losses, hover ground effect | OpenFOAM | availability here not confirmed | later; low priority until thrust is measured |
| Spar and longeron stress | hand beam formulas first, CalculiX if needed | here | to do once tube sizes are known |
| Cross-check by the lab | XFLR5 or flow5 on a laptop | lab | optional; good intern exercise |

Not used: OpenSCAD (CadQuery already does the job and exports STEP); LAMMPS (simulates atoms).

## First finding: the aircraft is unstable in pitch in forward flight

`python3 analysis/baseline_aero.py` (vortex-lattice method).

| Quantity | Value |
|---|---|
| Wing area (reference) / span / aspect ratio | 0.158 m2 / 0.69 m / 3.0 |
| Wing loading | 119 g/dm2 (high: a trainer is 40-60) |
| Balance point | 82 mm behind the datum |
| Point where lift acts (neutral point) | 25 mm behind the datum with the body lifting; 48 mm if the body is ignored |
| Static margin | -24% to -14% |
| Stall speed | about 13.5 m/s |
| Best lift/drag | about 12 (optimistic: no fan openings, skids or gaps in the model) |
| Drag at 18 m/s | about 2.6 N, 47 W of thrust power |

What it means: the balance point is 35 to 60 mm behind where it must be. A gyro can hold
a few percent of instability; not this much with hobby servos. The earlier hand-written
simulator did not show this because it assumed where the lift acts instead of computing it.

The cause is the propulsion layout: 340 g of fan, motor and nozzle at the tail, and a
broad flat forebody that lifts ahead of the balance point.

Ways out, to be traded in the sizing loop:

| Option | Effect on stability | Cost |
|---|---|---|
| Move battery forward to between the lift fan and the nose | Largest single lever: 366 g | Hover balance shifts: lift fan works harder, R2 gets worse |
| Bigger tailplanes (hidden change, within the 5% outline rule) | Small to medium | Weight at the tail |
| Lighter nozzle and duct (thinner walls, shorter) | Medium | Print strength |
| Accept mild instability (about -3%) and rely on the controller | Closes the last gap | Needs a tuned, fast control loop |

Hover and forward flight want the balance point in different places. That conflict is
the central design problem of this aircraft, and the reason to optimise it numerically.

## Carbon tubes: estimate of what is left over

From the Flightory Super Stingray and VTOL-pack parts lists. Assumes tubes were bought
as 1,000 mm lengths; measure to confirm.

| Tube | Used by the Stingray | Likely left from 1 m stock |
|---|---|---|
| 16 mm | 2 x 500 mm (VTOL booms) | none from one tube; 2 x 500 if two were bought |
| 12 mm | 1 x 460 mm (main spar) | about 540 mm |
| 6 mm | 1 x 680 + 2 x 350 mm (spars) | about 320 mm and 300 mm from two tubes |

This airframe now uses 8 mm aluminium: one 676 mm spar and two 637 mm longerons. None of
the likely leftovers reaches those lengths in one piece, so the structure will be
re-laid-out around the real lengths: for example the 12 mm tube as a 540 mm wing spar
(it passes both roll motors at 240 mm each side) and printed or 6 mm stubs outboard.

## Next steps

1. Owner: measure every carbon tube (outer and inner diameter, length).
2. Sizing loop in AeroSandbox: battery position, tail area, wing incidence and aerofoil
   against R2, R3 and R4 together.
3. JSBSim model from the sized geometry; controller tuned on it; transition corridor.
4. Fan blade-element model; thrust-stand test to calibrate it.
5. Fairings and covers for the open pockets, then re-run drag.
