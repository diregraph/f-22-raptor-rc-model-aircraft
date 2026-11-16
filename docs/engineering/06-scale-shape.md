# Sixth loop: closer to the real outline

Applied to the CAD and the twin. Prompted by a side-by-side with Eric Maglio's flying F-35B: ours read as a flat
plank with a small canopy and a square step where the intakes should be.

| Change | What it is | Cost |
|---|---|---|
| Dorsal spine | The spine now starts at the canopy, wraps the lift fan as a raised collar and runs aft to the engine, as on the real aircraft. The collar is cut as a bellmouth above the fan ring, so the ring still drops in from the top and the fan gets a flared inlet | +3 g in the fan bay |
| Canopy | 214 mm long and 33 mm high (was 180 and 27): a fifth of the aircraft's length, with the peak ahead of the middle. 214 mm is the longest that fits the bed | +5 g |
| Intake mouths | A 44 mm deep recess behind each swept lip, above the wire raceway. The square step is now an opening | none |
| Legs in the twin | The folded legs were drawn 14 mm lower than the CAD has them, so they hung below the belly. They now use the CAD hinge heights and fold flush | twin only |
| Battery | Default position 17 mm further aft (9 mm behind the datum) to trim out the extra nose weight | none |

## Result

| Requirement | Target | Before | Now |
|---|---|---|---|
| All-up weight | 2,000 g or less | 1,981 g | 1,989 g |
| Hardest-working fan in the hover | 60% or less | 59.6% | 59.8% |
| Pitch stability margin | +5 to +12% | +6.5% | +6.0% |
| Stall speed | 12 m/s or less | 11.5 m/s | 11.5 m/s |
| Hover time | 3 min or more | 3.4 min | 3.4 min |

No clashes, every part fits the bed, 13 of 13 flight checks. The weight left before the hover target is missed is
now about 6 g, so further shape work has to be weight-neutral.

## Not done, and why

- **Deeper fuselage.** The real aircraft is about half as deep again for its length. Deepening the whole body costs
  roughly 40 g of shell, which the hover margin does not have.
- **Lift-fan and roll-duct doors.** They would close the three openings in forward flight. Each needs a servo, and
  there is no weight for them until the thrust stand shows a margin.
- **The aerodynamic model was not re-run** for the taller spine and canopy. They sit in the body's wake region and the
  vortex-lattice model does not see them; drag in forward flight will be a little higher than modelled.
