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
| Battery 4S 2,700 mAh, slid 34 mm aft in total | **1,888 g** | **+6.0%** | **66%** | 41% | **3.5 min** |

Stall speed stays 11.5 to 11.6 m/s throughout. Wing, tail and outline are unchanged.

## Scorecard

| Requirement | Target | As drawn | Proposed | Met? |
|---|---|---|---|---|
| Pitch stability margin | +5 to +12% | +7.2% | +6.0% | Yes |
| Hardest-working fan in hover | 60% or less | 78% | 66% | **No** |
| Stall speed | 12 m/s or less | 11.6 | 11.5 | Yes |
| Weight | 1,900 g or less | 1,938 g | 1,888 g | Yes |
| Hover time | 3 min | 4.0 min (new estimate) | 3.5 min | Yes |

## 60% is not reachable by layout alone on today's thrust figures

With the proposal, any one of these would reach 60%:

- lift fan 1,528 g instead of 1,344 g;
- roll pair 1,426 g instead of the guessed 1,000 g;
- every fan 10% stronger than modelled;
- the aircraft at 1,711 g (177 g lighter).

Even ignoring stability, the best balance point gives 60% with this thrust and weight. Other options checked:

- A 2,200 mAh battery gives 64% but only 2.9 min of hover.
- Roll motors further forward and inboard (x -120, 185 mm out) give 65%, but cut the roll arm by 23% and put the
  propeller duct across the inner/outer wing joint, which then cannot move to a printable place.
- A 4-in-1 speed controller saves about 80 g, but that weight is in the nose and is what keeps the aircraft stable.
  The battery cannot slide forward far enough to replace it: the margin drops to about +1%.

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
2. Owner decision: the remaining gap (66% against 60%) can be closed with measured thrust, with about 180 g less
   weight, or by changing the requirement.
3. If accepted: apply the roll-motor move, motor and battery to the CAD and twin, then re-run `as_drawn.py`.
