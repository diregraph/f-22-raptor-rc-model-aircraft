# Third loop: hover margin

Live charts: `/analysis.html#hover`. Script: `python3 analysis/hover_margin.py` (after `fan_bem.py`, `baseline_aero.py`,
`as_drawn.py`; about 4 minutes). Writes `site/analysis/hover.json`. **Studied only, not applied to the CAD.**

## Why the hover is stuck at 78%

In the hover the lift fan (1,206 g, 210 mm ahead of the datum), the tail nozzle (814 g pointing down, 404 mm behind) and
the roll pair (1,000 g, 183 mm behind) hold the aircraft up. Their thrust is centred 85 mm behind the datum. Stability
in forward flight needs the balance point near 19 mm behind it, 67 mm further forward. So the lift fan and roll motors
carry the weight and the nozzle idles at 28%. Moving the balance point aft would fix the hover and break stability.

## What was tried, one change at a time

| Step | Weight | Margin | Worst fan | Nozzle | Hover time |
|---|---|---|---|---|---|
| As drawn | 1,938 g | +7.2% | 78% | 28% | 4.0 min |
| Balance point to +6% (battery slid 15 mm aft) | 1,938 g | +6.0% | 77% | 29% | 4.0 min |
| Lift-fan motor about 1,500 KV, 2807 size | 1,952 g | +6.0% | 71% | 34% | 4.1 min |
| Roll motors in front of the spar (x -139, 213 mm out) | 1,952 g | +6.0% | 69% | 43% | 4.0 min |
| Battery 4S 2,700 mAh | 1,888 g | +6.0% | 66% | 41% | 3.5 min |
| Lighter skids, longerons and nozzle walls | 1,822 g | +6.0% | 64% | 40% | 3.6 min |
| Lighter nose electronics, as far as balance allows | 1,769 g | +6.0% | 62% | 39% | 3.8 min |
| Battery 4S 2,200 mAh | **1,717 g** | **+5.5%** | **60%** | 38% | **3.2 min** |

Stall speed falls from 11.6 to 10.9 m/s. Wing, tail and outline are unchanged.

## Scorecard

| Requirement | Target | As drawn | Proposed | Met? |
|---|---|---|---|---|
| Pitch stability margin | +5 to +12% | +7.2% | +5.5% | Yes, 0.5 points to spare |
| Hardest-working fan in hover | 60% or less | 78% | 60% | Yes, exactly |
| Stall speed | 12 m/s or less | 11.6 | 10.9 | Yes |
| Weight | 1,900 g or less | 1,938 g | 1,717 g | Yes |
| Hover time | 3 min | 4.0 min (new estimate) | 3.2 min | Yes, within the ±20% of the estimate |

Every target is met on paper, with nothing to spare. The result depends on the lift fan giving its modelled 1,344 g and
the roll pair its guessed 1,000 g. With the 2,700 mAh pack instead, the worst fan is at 62%, the margin is +6.0% and the
hover time is 3.8 min: the safer choice if the thrust stand falls short.

## Weight savings (owner chose "find about 180 g")

| Saving | Grams | Where | How sure |
|---|---|---|---|
| Landing skids redrawn from the generative-design study, half the mass | 18 | centre | medium |
| Longerons 8 x 0.75 mm aluminium (spar stays 8 x 1) | 17 | centre | medium: 17% less stiff |
| Nozzle walls 1.3 to 1.0 mm, fan duct 2.2 to 1.6 mm | 31 | tail | estimate, not yet re-drawn |
| Micro receiver on the same FlySky link instead of the FS-iA6B | 13 | nose | high |
| 2 g buck board instead of the 12 g 5 V regulator | 10 | nose | high |
| ESP32 mini board instead of the DevKit | 6 | nose | high |
| Four lighter 45 A single speed controllers, about 20 g each | 24 | nose | medium |
| Battery 2,200 instead of 3,300 mAh | 116 | centre | masses scaled, not weighed |

**Weight in the nose is what keeps the aircraft stable**, and the battery cannot slide further forward than today
(the lift-fan bay is in the way). So each gram saved in the nose has to be matched by a gram saved further aft. The
nose savings above use all of that allowance: the battery ends at its forward stop. A 4-in-1 speed controller would
save about 80 g instead of 24 g, but the aircraft would then lose its stability margin, so it is left out.

Other options checked:

- Roll motors further forward and inboard (x -120, 185 mm out) give about 1 point more, but cut the roll arm by 23%.
  They also put the propeller duct across the inner/outer wing joint, which then cannot move to a printable place.

## Details

- **Lift-fan motor.** The fan is limited by motor torque at 35 A, not by the fan. A lower KV gives more torque per amp.
  1,300 KV gives the most on a fresh pack (1,513 g) but runs out of voltage as the pack sags (1,203 g at 3.5 V per cell).
  About 1,500 KV holds 1,344 to 1,366 g over the whole pack, at the same 35 A. Its 2807 size runs cooler at that current.
  It weighs about 14 g more. Check the motor mount on the fan spider.
- **Roll motors.** The pod clips to the spar as now, but hangs the motor 21 mm in front of it instead of 23 mm behind.
  The 110 mm duct keeps 8 mm to the leading edge. The inner/outer wing joint moves inboard to about 150 mm so it does
  not cross the duct.
- **Battery.** Masses are scaled from the 3,300 mAh pack (0.105 g per mAh plus 23 g); weigh the real pack.
- **Hover time** comes from the fan model for the two fans and momentum theory for the roll propellers (figure of
  merit 0.55, 80% drive efficiency), using 80% of the pack. Treat it as ±20%.

## Next

1. Thrust stand: lift fan on the current motor and on a 1,500 KV motor, and one roll motor in its wing duct. These
   numbers decide whether 60% is reachable.
2. Choose the battery: 2,200 mAh meets every target exactly; 2,700 mAh keeps 2 points of fan margin and 0.6 min of
   hover time in hand, at 62%.
3. If accepted: apply the roll-motor move, motor and battery to the CAD and twin, then re-run `as_drawn.py`.
