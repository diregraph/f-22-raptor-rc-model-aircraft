# First design loop: results

Live, with interactive charts: `/analysis.html`. Scripts: `analysis/` (needs
`pip install aerosandbox neuralfoil jsbsim scipy`). Run order: `fan_bem.py`, `baseline_aero.py`,
`sizing.py`, `flight_jsbsim.py`, `structure.py`. Each writes a JSON file into `site/analysis/`.

Decisions since the plan: aluminium tubes stay (carbon is too expensive); no constraint
from other designs; generative design where it beats aluminium; results must be on the site.

## Scorecard

| Requirement | Target | Today | Proposed layout |
|---|---|---|---|
| Pitch stability margin | +5 to +12% | -23.6% | +6% |
| Hardest-working fan in hover | 60% or less | 74% | 80% |
| Stall speed | 12 m/s or less | 13.5 | 11.4 |
| Weight | 1,900 g or less | 1,892 | 1,892 |

Proposed layout: wing and roll motors 75 mm aft, lift fan 80 mm forward, battery and
electronics 122 mm forward into the space the fan leaves, SD7062 wing section.
**Not applied to the CAD yet**: it changes the outline and needs the owner's agreement.

## What each study found

1. **Sizing.** No battery position alone gives both stable flight and a balanced hover.
   Moving the wing aft moves the point where lift acts aft by about 0.55 mm per mm, which
   lets the balance point stay near where the hover wants it.
2. **Fans.** Main fan: about 960 g expected at 30 A (850 g was assumed). Lift fan: the
   motor reaches its 35 A limit at about 1,000 g (1,300 g was assumed). **The lift fan is
   now the limiting item for hover.** The model is valid near design speed only.
3. **Flight dynamics (JSBSim).** Today's layout doubles a pitch error every 0.06 s and
   departs even with a gyro on the tail. The proposed layout is stable (0.7 Hz) but needs
   15 degrees of tail to fly level: the wing needs an angle of incidence.
4. **Structure.** A printed beam of the same weight is 0.37 to 0.62 times as stiff as the
   8 mm aluminium tube, so tubes stay for spar and longerons. Generative design of the
   landing skid gives about 24 times the stiffness at the same weight in a flat model,
   mostly by bracing against sideways loads. Brackets and frames are where it pays.

## Open problems, in order

1. Lift-fan thrust: a larger fan (lower disc loading), or two motors, within the motor's
   current limit. Needs a fan model that is valid off-design, calibrated on the thrust stand.
2. Wing incidence and twist so the tail trims near zero.
3. Check the lift fan fits 80 mm further forward (it meets the nose joint and the canopy).
4. Turn the generated skid into a printable part; run the same method on the fan spider
   and roll-motor mounts in 3D.
5. Transition in JSBSim (hover to wing-borne), then the controller.
6. Drag of openings and skids (CFD or measured).
