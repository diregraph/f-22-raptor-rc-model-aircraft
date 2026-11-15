# F-35B VTOL build plan: 14 days, parts-on-hand version

Reference aircraft: Lofted Aero F-35B (see `source-video.md`). This plan keeps
its control layout and replaces everything expensive or hard to source.

Numbers marked **(estimate)** are engineering estimates, not measurements.
Day 1 exists to replace them with measurements.

## 1. First principles

| Constraint | Consequence |
|---|---|
| Hover needs total thrust of at least 1.5 × weight for control margin | Weight is the main enemy: foam airframe, printed parts only where foam cannot do the job |
| Nobody on the team has flown | Control software and piloting are the real risk, not manufacturing. Test control on a crash-proof frame before building the jet shell |
| Two weeks | Anything not on the bench by day 3 is out. Design around owned parts |
| Crashes are certain | Crash parts (nose, wings, tail, propellers) must be remade in under 30 minutes from foam |
| Ducted fans are inefficient and cost about LKR 37,000 a pair locally | Use open propellers. The swivel nozzle becomes a two-servo tilt mount |

## 2. What changes from the reference

| Reference | This build | Why |
|---|---|---|
| 2 × 70 mm ducted fans, 6-cell, 3,300 W | 2 × EMAX 2306 with 6 in propellers, 4-cell | Owned; more thrust per watt |
| Wing-tip micro motors for roll | 2 × EMAX 2306 with 5 in propellers | Owned |
| Three-bearing swivel nozzle, 3 multi-turn servos, custom board | Rear motor on a printed 2-axis mount: tilt servo + yaw servo | Same function, 2 ordinary servos |
| Matek board + modified ArduPilot + GPS | ESP32 DevKit + MPU6050 + madflight (Arduino) | Owned; mixer is plain code you can edit |
| 2.7 kg | Target 1.3 kg or less | Thrust available |
| Retractable gear | Fixed wire skids | Weight, time |

## 3. Layout

```
                 nose
                  |
            +-----------+
            |  battery  |
            |   ( F )   |   F = front lift motor, 6 in prop, in a fuselage hole
            |    ESP32  |       spins clockwise
   wing     |    + IMU  |     wing
 (L)--------+   [CG]    +--------(R)   L, R = roll motors, 5 in props,
            |           |              near the wing tips, opposite spin
            |   ( M )   |   M = main motor, 6 in prop, spins anticlockwise
            +--tilt/yaw-+       on a 2-servo mount:
             /         \          tilt 0 deg (forward flight) to 100 deg (hover)
          tail L     tail R       yaw +/- 20 deg (hover yaw control)
```

| Axis | Hover | Forward flight |
|---|---|---|
| Lift / speed | F + M throttle | M throttle, F stopped |
| Pitch | F vs M thrust difference | Tail surfaces together |
| Roll | L vs R thrust difference | Tail surfaces opposite |
| Yaw | M swivels left/right | None (no rudder), same as reference |

Servo allocation (all four owned): 2 × MG90S on the tilt/yaw mount, 2 × 9 g on
the tail surfaces.

## 4. Sizing

Weight budget **(estimate)**:

| Item | g |
|---|---|
| 4-cell 3300 mAh battery | 370 |
| 4 × EMAX 2306 | 135 |
| 4 × speed controllers | 100 |
| 4 servos | 50 |
| ESP32, IMU, receiver, regulator, wiring | 90 |
| Propellers | 30 |
| Printed parts (motor mounts, tilt mount, spar joiners) | 130 |
| Foam airframe, tape, glue, spars | 350 |
| **Total** | **about 1,250** |

Thrust **(estimate, verify day 1)**: each 2306 1700KV on 4 cells with a 6 in
propeller should give roughly 0.9–1.1 kg. Two give about 2 kg, so
thrust-to-weight is about 1.5. No published 4-cell 6 in test was found for this
motor, which is why the scale test comes first.

Go/no-go after day 1: if F + M together measure under 1.8 kg, use the fallback.

Fallback lift pair: 2 × A2212 1000KV with 8 × 4.5 propellers on 4 cells
(do not use 10 in propellers on 4 cells; the motor will overheat).

Airframe: about 800 mm span, 900 mm long, flat-plate profile from 5 mm foam.
Wing loading stays low, so forward flight is slow and forgiving.

## 5. Shopping list (order on day 1)

| Item | Qty | Notes |
|---|---|---|
| Speed controller, 30–40 A, rated 2–4 cell | 5 | The owned Skywalker is 2–3 cell only and cannot run on the 4-cell pack. One spare |
| MPU6050 module (GY-521) | 2 | One spare |
| 5 V 3 A regulator (UBEC) | 2 | Powers servos and ESP32 |
| Propellers 6 in (6040 or 6045), clockwise + anticlockwise | 10 pairs | Main crash consumable |
| Propellers 4 in, clockwise + anticlockwise | 6 pairs | Roll motors, buried in the wings |
| MG90S servos | 7 | 4 spares + 3 for the nozzle demo |
| XT60 connectors, 14 AWG silicone wire, heat-shrink | — | Power harness |
| Low-voltage buzzer alarm for the battery | 2 | |
| Second 4-cell 3300 mAh battery | 1 | Optional; doubles test time per day |
| 5 mm foam sheet | 10 sheets | Stationery/art shop foam board, or polystyrene ("rigifoam") sheet sliced on a hot wire |
| Clear packing tape, fibre tape | 4 rolls | Skin and hinge material |
| Spars: bamboo skewers, kite sticks, or 6 mm aluminium tube | — | Hardware store |
| Hot-glue sticks, 3 mm screws and nuts, zip ties, 1 mm steel wire (pushrods) | — | |
| Nylon fishing line, 2 m of 20 mm PVC pipe | — | Tether rig |

Local sources to phone first: Techrolk (Maharagama), LK Tronics (lists 20/30/40 A
speed controllers), Horizon Hobby Store (Wellampitiya). Stock was not confirmed.

Owned parts not used in the aircraft: 5 × A2212 1000KV (fallback, thrust-stand
motor), A2212 2700KV, Raspberry Pi 2B, ESP32 camera (optional onboard video
later), Skywalker controller (bench tests on a 3-cell pack only).

Bench power set: ZOP 3-cell 1500 mAh + Skywalker 30 A controller. Use it from
day 1 for thrust tests and for the nozzle demo, before the 4-cell controllers
arrive. A 3-cell thrust reading scales to 4 cells by roughly (4/3) squared,
about 1.8 x, less some sag; confirm on 4 cells when the controllers arrive.

## 6. Flight controller

- Hardware: ESP32 DevKit v1 + MPU6050 on I2C + FS-iA6B receiver in PPM mode.
- Firmware: madflight (Arduino library, derived from dRehmFlight). It supports
  ESP32, the MPU6050 over I2C, and PPM receivers. It does not list iBUS, so set
  the receiver to PPM output.
- Why not ArduPilot: needs a flight controller board you do not own, and the
  reference builder had to modify it for this layout anyway.
- Transmitter channels: throttle, roll, pitch, yaw, arm switch, and a knob for
  tilt angle (manual transition: you turn the knob from hover to forward).

Mixer to write (about 20 lines):

```
tilt     = knob                      // 0 = forward flight, 1 = hover
hover    = tilt                      // blend factor
F        = hover * (thr + pitch_pid)
M        = thr - hover * pitch_pid
L        = hover * (idle + roll_pid)
R        = hover * (idle - roll_pid)
yawServo = centre + hover * yaw_pid
tailL    = (1 - hover) * (pitch_pid + roll_pid) + stick passthrough
tailR    = (1 - hover) * (pitch_pid - roll_pid) + stick passthrough
```

## 7. Schedule

Roles: **Lead** (you) = electronics and firmware. **Intern A** = CAD and
printing. **Intern B** = foam, assembly, test rigs.

| Day | Lead | Intern A | Intern B | Gate |
|---|---|---|---|---|
| 1 | Order parts. Thrust test on kitchen scale: 2306 + 6 in on 4 cells (3-cell bench set today; repeat on 4 cells when controllers arrive) | Print motor mounts, thrust-stand bracket | Buy foam, tape, spars. Build hot-wire cutter if using polystyrene | Thrust measured |
| 2 | ESP32 + MPU6050 + receiver on the bench; madflight reading sticks and angles | Design + print tilt/yaw mount v1 | Build test frame: wooden or aluminium cross with motors at final spacing | |
| 3 | Wire 4 controllers; calibrate; motors respond to mixer, propellers off | Tilt mount v2; print spares | Cut airframe #1 parts from templates | All parts on bench |
| 4 | Single-axis tuning on tether: roll | Simulator practice, 1 h | Tether rig; airframe #1 assembly | |
| 5 | Single-axis tuning: pitch, then yaw | Simulator, 1 h; reprints | Airframe #1 finished, unpowered | Each axis holds level |
| 6 | Test frame free hover, 30 cm, over grass | Second pilot practice | Cut airframe #2 kit | Frame hovers 20 s |
| 7 | Buffer / repair day | | | |
| 8 | Move electronics into airframe #1; check balance point | Fit tilt mount | Hatch, skids, battery tray | Balance at design point |
| 9 | Airframe tethered hover; retune | Spares | Repairs | |
| 10 | Airframe free hover | Video logging | Repairs | **Core goal: stable hover** |
| 11 | Hover with tilt at 80–100 deg: slow forward and back | | Assemble airframe #2 | |
| 12 | Glide test, power off, hand launch over long grass; set tail trims | | | Glides straight |
| 13 | Transition attempt in open field: hover at 3 m, tilt slowly forward | | | Stretch only; hover is the agreed success criterion |
| 14 | Buffer, repeat, document | | | |

## 8. Test rigs (cheap, build first)

1. **Thrust stand:** motor on a printed bracket screwed to a wood block, block
   on a kitchen scale, propeller blowing upward. Read grams at full throttle.
2. **Single-axis tether:** hang the frame from fishing line along the axis under
   test, or pivot it on a PVC pipe, so only one axis moves while tuning.
3. **Test frame:** the same four motors at the same spacing on a wooden cross.
   Crash it, not the jet.

## 8a. Printable parts

Every printed part has real CAD. `python3 cad/build.py` regenerates them and checks
each part against the tubes, servos, propeller discs, battery and every other part
for clashes. Print-pose STL files are in `cad/stl/`, STEP in `cad/step/`.
Masses are estimates: PETG at 4 walls / 40% infill; LW-PLA as a single 0.5 mm
foamed wall with 4% infill.

| File | Material | Size on bed, mm (x, y, height) | Est. g |
|---|---|---|---|
| `spar_carrier` | PETG | 30 x 204 x 25 | 15 |
| `fan_spider` | PETG | 114 x 198 x 24 | 32 |
| `tilt_bearing_left` | PETG | 41 x 31 x 22 | 8 |
| `tilt_bearing_right` | PETG | 28 x 27 x 20 | 7 |
| `tilt_yoke` | PETG | 35 x 140 x 28 | 20 |
| `motor_cradle` | PETG | 41 x 43 x 32 | 6 |
| `roll_mount_right` | PETG | 45 x 32 x 28 | 5 |
| `roll_mount_left` | PETG | 45 x 32 x 28 | 5 |
| `skid_front` | PETG | 90 x 200 x 30 | 14 |
| `skid_rear` | PETG | 90 x 200 x 30 | 14 |
| `battery_tray` | PETG | 142 x 50 x 10 | 14 |
| `fc_sled` | PETG | 88 x 36 x 11 | 7 |
| `nose_plug` | PETG | 74 x 138 x 11 | 17 |
| `hatch_latch` | PETG | 6 x 30 x 13 | 1 |
| `canopy` | PETG-clear | 180 x 68 x 43 | 15 |
| `nose` | LW-PLA | 86 x 160 x 150 | 58 |
| `nose_cone` | LW-PLA | 65 x 111 x 128 | 18 |
| `fan_bay` | LW-PLA | 84 x 216 x 231 | 86 |
| `centre_section` | LW-PLA | 88 x 216 x 200 | 93 |
| `hatch` | LW-PLA | 197 x 167 x 40 | 47 |
| `aft_bridge` | LW-PLA | 84 x 216 x 90 | 41 |
| `tail_boom_right` | LW-PLA | 48 x 24 x 170 | 11 |
| `tail_boom_left` | LW-PLA | 48 x 24 x 170 | 10 |
| `wing_inner_right` | LW-PLA | 304 x 27 x 77 | 28 |
| `wing_inner_left` | LW-PLA | 304 x 27 x 77 | 28 |
| `wing_outer_right` | LW-PLA | 238 x 24 x 165 | 22 |
| `wing_outer_left` | LW-PLA | 238 x 24 x 165 | 22 |
| `stabilator_right` | LW-PLA | 160 x 36 x 107 | 11 |
| `stabilator_left` | LW-PLA | 160 x 36 x 107 | 11 |
| `fin_right` | LW-PLA | 202 x 157 x 9 | 15 |
| `fin_left` | LW-PLA | 202 x 157 x 9 | 15 |

**LW-PLA slicing.** The shell files are solid bodies. Slice with 1 wall, 4% gyroid
infill, 3 bottom layers and 0 top layers so they print hollow. The inner wing
panels have a 304 mm root chord: place them diagonally on the 220 mm bed.

**PETG first.** Print one clip test, then the tilt mount, fan spider, spar carrier
and roll-motor mounts: with the three tubes that is a flyable test frame before any shell
exists.

Check on the first prints, then adjust the parameters at the top of `cad/build.py`:

- **Clip grip.** `CLIP_ID` 8.2 mm for an 8.0 mm tube. Measure your tube first.
- **Shell bores.** `BORE` 8.5 mm: LW-PLA shells must slide on the tubes freely.
- **Servo pockets.** MG90S body 22.8 x 12.2 mm with 0.4 mm clearance.
- **Horn recesses.** Sized for a typical single-arm horn (`HORN_*`): measure yours.
- **Motor screws.** 4 x M3 on a 16 mm square, 4 mm pad: use M3 x 6 or 7.

Hardware not printed: three 8 mm tubes (two 637 mm, one 676 mm), 3 mm bamboo
skewers (nose pins, nose-cone dowels, wing alignment pins), 3 mm steel wire (tail pivots), 2 mm pins
(one per roll-motor mount, one per wing tip), servo screws, zip ties as a second lock on each clip.

## 9. Safety

- Propellers off whenever the board is connected to USB or the mixer is edited.
- 6 in propellers at 20,000+ rpm cut deeply: eye protection, nobody in the
  propeller plane, arm switch on the transmitter, throttle-cut on signal loss.
- Lithium batteries: charge in sight on a non-flammable surface; stop at 3.5 V
  per cell; never fly a puffed pack.
- Fly over grass, away from roads and people. Check Civil Aviation Authority of
  Sri Lanka rules for model aircraft before field flights.

## 10. Parallel track: bench swivel nozzle (Intern A)

Decided: build a real three-bearing nozzle as a bench demo. It does not fly in
this build; flying it needs a 64-70 mm ducted fan and a 60 A+ controller.

| Days | Step |
|---|---|
| 2-4 | CAD: three duct segments, about 70 mm bore, joined by printed ring bearings; joints 2 and 3 cut at an angle. Print one joint first and check it turns freely |
| 5-7 | Add a ring gear on each segment and a 2:1 pinion so a 180-degree MG90S turns the ring 360 degrees. Print all three segments |
| 8-10 | Second ESP32 sketch: two inputs (tilt, yaw) to three ring angles. Compute the angles with rotation matrices offline, store as a lookup table |
| 11-14 | Drive it from two spare receiver channels; blow air through it with an A2212 2700KV and 6 x 4 propeller in a printed duct, on the 3-cell pack and Skywalker controller |

Extra parts: 3 more MG90S (total to buy: 7), M3 screws, 3 mm airsoft BBs or
printed-in-place balls if the plain printed bearing binds.

The nozzle track must not delay flight parts: flight prints take printer
priority every day.

## Sources

- https://github.com/qqqlab/madflight
- https://github.com/nickrehm/dRehmFlight-F-35
- https://github.com/rtlopez/esp-fc
- https://techrolk.com/shop/product/qx-motor-64mm-edf-12-blades-ducted-fan-cw-ccw-with-qf2822-4300kv-3s/
- https://lk-tronics.com/
- https://horizonrc.lk/about/
