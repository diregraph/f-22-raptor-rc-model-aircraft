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
| Propellers 5 in, clockwise + anticlockwise | 6 pairs | |
| MG90S servos | 4 | Spares; gears strip in crashes |
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

**Check:** the cell count of the ZOP 1500 mAh battery. If it is 3-cell, use it
for bench tests with the Skywalker controller.

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
| 1 | Order parts. Thrust test on kitchen scale: 2306 + 6 in on 4 cells (needs one 4-cell controller; if none, test A2212 on 3 cells meanwhile) | Print motor mounts, thrust-stand bracket | Buy foam, tape, spars. Build hot-wire cutter if using polystyrene | Thrust measured |
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
| 13 | Transition attempt in open field: hover at 3 m, tilt slowly forward | | | Stretch goal |
| 14 | Buffer, repeat, document | | | |

## 8. Test rigs (cheap, build first)

1. **Thrust stand:** motor on a printed bracket screwed to a wood block, block
   on a kitchen scale, propeller blowing upward. Read grams at full throttle.
2. **Single-axis tether:** hang the frame from fishing line along the axis under
   test, or pivot it on a PVC pipe, so only one axis moves while tuning.
3. **Test frame:** the same four motors at the same spacing on a wooden cross.
   Crash it, not the jet.

## 9. Safety

- Propellers off whenever the board is connected to USB or the mixer is edited.
- 6 in propellers at 20,000+ rpm cut deeply: eye protection, nobody in the
  propeller plane, arm switch on the transmitter, throttle-cut on signal loss.
- Lithium batteries: charge in sight on a non-flammable surface; stop at 3.5 V
  per cell; never fly a puffed pack.
- Fly over grass, away from roads and people. Check Civil Aviation Authority of
  Sri Lanka rules for model aircraft before field flights.

## 10. Stretch: real swivel nozzle

A true three-bearing nozzle only makes sense behind a ducted fan. After the
hover works, Intern A can print a bench nozzle driven by the ESP32 with printed
2:1 gears so ordinary 180-degree servos turn each ring 360 degrees. Flying it
needs a 64–70 mm ducted fan and a 60 A+ controller.

## Sources

- https://github.com/qqqlab/madflight
- https://github.com/nickrehm/dRehmFlight-F-35
- https://github.com/rtlopez/esp-fc
- https://techrolk.com/shop/product/qx-motor-64mm-edf-12-blades-ducted-fan-cw-ccw-with-qf2822-4300kv-3s/
- https://lk-tronics.com/
- https://horizonrc.lk/about/
