# Design study: aluminium skeleton, generative nodes, skin as crash zone

Live page: `/skeleton.html` (3D view, weight waterfall, tube list). Scripts: `python3 analysis/skeleton.py`
(seconds), `python3 analysis/node_topopt.py` (about 15 minutes), then `skeleton.py` again so the node
weights use the grown node. Writes `site/analysis/skeleton.json`,
`site/analysis/node.json` and `site/cad/node_spar_left.stl`. **A study only: the CAD and the twin are unchanged.**

## The idea (owner, 2026-11-19)

1. A minimal skeleton of off-the-shelf aluminium tubes.
2. PETG nodes join the tubes, like connective tissue, shaped by generative design.
3. The avionics sit in bays on the skeleton, isolated on TPU.
4. The wiring harness runs through the nodes.
5. A thin LW-PLA skin for the aerodynamics, which is also the crash zone.
6. An FPV (first-person view) camera on a head-tracking pan/tilt under the canopy.
7. Constraints: aluminium and filament you can buy in Sri Lanka; CFD for the fine tuning.

## Answer

**About the same weight as today: 20 to 50 g heavier.** With every node weighed against the generated node,
the skeleton with the FPV camera is 2,019 g against 1,970 g today, and 1,993 g without the camera.

| Version | Weight | Margin | Worst hover fan | Stall | Hover | Fails |
|---|---|---|---|---|---|---|
| Today (tubes + structural shells) | 1,970 g | +5.1% | 58.9% | 11.4 m/s | 3.4 min | none |
| Skeleton, no FPV | 1,993 g | +5.1% | 59.6% | 11.5 m/s | 3.3 min | none |
| Skeleton + FPV head tracking | 2,019 g | +5.1% | 60.4% | 11.6 m/s | 3.3 min | weight, hover fan |
| Skeleton + FPV + micro receiver (−13 g) | 2,006 g | +5.0% | 60.0% | 11.5 m/s | 3.3 min | weight by 6 g |
| Target | ≤ 2,000 g | +5 to +12% | ≤ 60% | ≤ 12 m/s | ≥ 3 min | |

So the skeleton fits without the camera. The camera puts it 6 to 19 g over; the cheapest fixes are a fixed
camera in place of the pan/tilt (−11 g) or thinner-walled tubes for the longerons, if the shops have them.

Today's design is already half of this idea: three 8 mm tubes, PETG clips and LW-PLA shells. The difference is
that today's shells carry load. The frame model shows it: today's three tubes on their own, without the
shells, fail the landing cases (safety factor 0.88).

| Change | Out | In | Net |
|---|---|---|---|
| Tubes: aluminium in place of carbon, and more of them | 76 g | 150 g | +74 g |
| Structural shells become a thin skin with ribs and crash zones | 490 g | 318 g | −172 g |
| PETG nodes and isolated bays in place of the spar carrier, brackets, trays and nose ring | 68 g | 189 g | +121 g |
| FPV camera, pan/tilt and video transmitter (new) | 0 | 26 g | +26 g |

### Where the skeleton helps
- The skin stops carrying load, so it can be a single 0.55 mm foamed wall: 52 dm² of outer surface is 178 g,
  against 490 g of today's shells (which are thick round every bay, well and raceway).
- Every load goes into aluminium, so a crash breaks skin panels and maybe a node, not the airframe.
- A broken panel, node or tube is a cheap swap; nothing is glued to the structure.

### Where it costs
- **Joints, not tubes, decide the weight.** Each PETG node costs 4 to 15 g. The first generated layout had
  82 tubes and weighed 968 g in tubes and nodes; removing every tube the loads did not need took it to 23
  tubes and 316 g.
- Aluminium is 1.7 times as dense as carbon: the same three tubes are 40 g heavier.
- A thin skin needs stiffening ribs; 25% extra is assumed and is the biggest unknown (±40 g).

## Generative layout

179 candidate tubes: every tube between neighbouring stations (nose, front and back of the lift fan, battery
bay, main legs, spar, main-fan duct, tailplane pivot) that does not cross the lift fan, the battery and hatch,
the main fan, the nozzle swing or the nose bay. A 3D frame model, 6 degrees of freedom per joint, with
inertia relief, carries six load cases:

| Load case | What it checks |
|---|---|
| Hover, 1.5 g gust | Fan and nozzle mounts, longeron bending |
| Hover, full roll command | Torsion between the roll motors and the body |
| Landing, 4 g on three legs | Leg mounts, longerons |
| Landing, one main leg, 2.5 g plus side load | Torsion, leg mount |
| Pull-up, 4 g | Spar bending |
| Nose strike, 15 g | Nose keel; the crash cone limits the force |

Topology optimisation (optimality criteria on the tube areas, all cases at once) ranks the tubes. Each tube
then gets the lightest round tube from the shop list that keeps a safety factor of 1.5 on 6063 yield and 2 on
buckling, and tubes are removed one at a time while every case and a 1.5° fan-to-nozzle twist limit still hold.

Result (23 tubes, 150 g): the two chine longerons stay (6 × 1 mm beside the lift fan, 10 × 1 mm from the back of the
fan to the main legs, 8 × 1 mm either side of the spar, 6 × 1 mm to the tailplane), the spar is one 8 × 1 mm tube, and a V-shaped nose keel of 10 × 1 mm
tubes runs from the belly corners at the front of the lift fan to a nose node that carries the nose leg,
the flight-controller bay and the camera. Worst safety factor 1.61; fan-to-nozzle twist 0.95°.

## Generative node

The busiest joint, where the left longeron meets the spar at x = −160, was grown by 3D topology optimisation
(1.6 mm bricks, the end forces of all six load cases). The spar runs straight through the node. The tube
bores are the wire conduit between nodes; inside the node a 6 mm channel climbs over the spar and exits through
a connector port on top, so the harness rule (a connector at each end, no loom) still holds.

Every version is far below the stress PETG takes across its layers (peak 4 to 6 MPa against 20 MPa allowed),
so stiffness decides. Sweep:

| Material allowed | Mass | Peak stress | Flexibility vs stiffest |
|---|---|---|---|
| 6% of the free space | 19.5 g | 2.0 MPa | 1.0× |
| 3.5% | 16.2 g | 2.8 MPa | 1.6× |
| **2% (chosen: lightest within 3× of the stiffest)** | **14.4 g** | 4.2 MPa | 2.7× |
| 1.2% | 13.4 g | 5.6 MPa | 4.0× |

About 11 g of any node is fixed: the sockets, the grip on the spar and the walls of the wire channel. The
optimiser grows a vertical web between the longeron sockets and the spar, which is what carries the pitch
bending. The simple node estimate (sockets plus webs) came out 30% light against this result, so every node
in the weight sum is scaled up by 1.3.

## Bays, skin, crash zones, camera

- **Bays:** PETG trays for the battery, the flight controller with receiver, and the speed controllers, each
  on four TPU 95A isolators clipped to nodes. 22 g in total. Isolating the flight controller helps the gyros.
- **Skin:** LW-PLA, one foamed wall, clipped to the nodes with sacrificial tabs that break before a node does.
- **Crash zones:** a nose cone with progressive fold lines and a belly strip. At 5 m/s, a 15 g limit needs
  about 85 mm of crush, and the nose has 138 mm ahead of the nose node.
- **FPV:** micro camera (about 5 g) on two 3.7 g servos under the canopy, video transmitter behind the nose bay.
  Head tracking goes from the goggles to the radio's trainer port; ArduPilot passes two receiver channels
  straight to the pan and tilt servos on outputs 3 and 4, which are free today
  (`SERVO3_FUNCTION 59`, `SERVO4_FUNCTION 60`, receiver channels 9 and 10). Not yet in `f35b.parm`.

## Limits

- Every node is treated as rigid. A printed socket that lets the tube rock will twist the frame more. One
  printed node on the bench settles it.
- The tube list is an assumption: round 6063 tube in 6, 8, 10 and 12 mm with 1 mm walls. To be confirmed
  against what the shops in Sri Lanka stock.
- No CFD exists in the repository yet. Proposed: OpenFOAM on the Mac for the intakes and the canopy with its
  camera dome.
- Hover time is scaled from today's 3.4 min by weight, not re-simulated.

## Scale study: 600 to 800 g (owner chose mid size, 2026-11-19)

`python3 analysis/scale_study.py` scales every part of the skeleton version by the rule that governs it and
solves for the weight (motors and battery depend on what they lift). Writes `site/analysis/scale.json`.

| Size | Weight | Span | Length | Battery | Stall |
|---|---|---|---|---|---|
| 55% | 579 g | 380 mm | 554 mm | 86 g | 11.3 m/s |
| **60%** | **684 g** | **414 mm** | **605 mm** | **101 g** | **11.3 m/s** |
| 65% | 803 g | 448 mm | 655 mm | 118 g | 11.3 m/s |
| 100% (today's skeleton) | 1,992 g | 690 mm | 1,008 mm | 300 g | 11.5 m/s |

Weight falls about as size squared, because printed walls cannot get thinner than the nozzle allows. Stall
speed holds because the weight per wing area stays about the same. About 54 g never shrinks: the flight
controller, receiver, nozzle board and FPV.

At 60%: main fan about 48 mm, lift fan about 97 mm, roll propellers about 3 in, spar about 360 mm (fits the
owner's 53 cm carbon tube), longerons about 380 mm (the 30 and 32 cm carbon tubes are just short).
Risks: the three-bearing nozzle and its gearmotors get tight, and the fan model has not been checked at this
size. A fixed camera instead of pan/tilt saves weight that matters more at this size.
