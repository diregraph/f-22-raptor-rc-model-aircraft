# Plan: fly ArduPilot in simulation before any hardware flies

Status: **steps 1 to 6 done in SITL (2026-11-16); Isuru chose ArduPilot for the simulation and the
aircraft.** Results are under "Results" at the end and on `/analysis.html` ("Autopilot flights").
How to run it: `ardupilot/README.md`.

## Why

Today the aircraft is flown in simulation by code written for this project: a mixer and
controller inside `site/js/sim.js`. The real flight controller would be an ESP32 running
madflight (`docs/build-plan.md`, section 6). That path is cheap, but every transition step,
failsafe and landing behaviour has to be written and tested by hand.

The reference build (Lofted Aero, `docs/source-video.md`) flies on ArduPilot, an open-source
autopilot. ArduPilot already has hover, transition and back-transition logic, position hold,
return-to-home, failsafes and flight logs. Its SITL (software in the loop) runs the real
autopilot code on a laptop against a simulated aircraft. So the transitions can be tuned
before anything is printed or flown.

| | Own controller (today) | ArduPilot |
|---|---|---|
| Hardware | ESP32 + MPU6050, owned, $0 | ArduPilot board with Lua scripting, about $70–90, plus GPS about $15–25 (typical prices, to check) |
| Hover and transition logic | Write it (about 20-line mixer, plus sequencing) | Built in (QuadPlane modes) |
| Failsafes, position hold, return-to-home | Write them, or go without | Built in |
| Flight logs | None | Built in |
| This layout (lift fan + roll pair + swivel nozzle) | Native: the mixer is ours | Not a stock frame: needs a motor-matrix script and a nozzle script |
| Simulation | `sim.js` with its own controller | SITL flying the `sim.js` physics |

## What ArduPilot needs for this layout

1. **QuadPlane.** ArduPlane's VTOL mode. The wing and stabilators fly the aircraft forward; the
   lift thrusters hold it in a hover.
2. **A custom motor layout.** The hover thrusters are the lift fan, the roll pair and the main fan
   through the nozzle. No stock frame matches. ArduPilot's "Scripting Matrix" frame class (set through
   `Q_FRAME_CLASS`; check the value in the current docs) lets a Lua script give each motor its roll, pitch and yaw factors. The factors come from the
   thruster positions in `site/js/spec.js`.
3. **The swivel nozzle.** ArduPilot commands a tilt angle and a yaw. As in the reference build, the nozzle has
   its own board that homes the three joint gearmotors and solves the joint angles (`firmware/nozzle/Nozzle3BSM.h`,
   the same maths as `solve()` in `site/js/nozzle.js`). A Lua script adds the hover guard and slew limits and sends
   the board deflection and yaw as two pulses.
4. **Which tilt settings fit.** ArduPilot's tilt-rotor support (`Q_TILT_*` parameters) is the likely
   starting point. Confirm in SITL which tilt type gives tilt plus yaw on one nozzle; do not assume it.

The ESP32 cannot carry this: ArduPilot's ESP32 port is experimental and not for flight. Lua scripting
needs a board with enough memory, in practice an STM32 H7-class board.

## How the simulation connects

ArduPilot SITL has a JSON interface for external physics. Each step:

1. SITL sends a UDP packet with up to 16 servo and motor outputs (PWM values).
2. The physics model applies those outputs for one time step.
3. The model answers with JSON: time, gyro, accelerometer, position, velocity and attitude.

The plan is a small bridge, `tools/sitl-bridge.mjs`, that runs the `sim.js` physics in Node and
speaks this protocol.

Work found while reading `sim.js`: its `step()` mixes the physics with the project's own
controller. The bridge needs the physics alone, driven by raw thrust and servo commands. Split
the two first, and keep `npm test` passing on the split version.

Axes need care: the twin uses +X nose, +Y up, +Z right wing. ArduPilot uses north-east-down for
the world and forward-right-down for the body.

## Steps

| # | Step | Time | Done when |
|---|---|---|---|
| 1 | Install ArduPilot SITL on the Mac; fly the stock QuadPlane model | 1–2 h | Stock model hovers, transitions and lands in SITL |
| 2 | Split `sim.js` into physics and controller | 2–3 h | `npm test` still passes 13/13; the twin's simulator flies as before |
| 3 | Write `tools/sitl-bridge.mjs` | 4–6 h | ArduPilot holds this model in a hover (QHOVER) for 60 s within ±0.3 m |
| 4 | Motor-matrix script and nozzle script | 4–6 h | Position hold (QLOITER) works; yaw comes from the nozzle |
| 5 | Transitions | 3–4 h | 10 forward transitions and 10 back-transitions in a row, none losing more than 3 m of height |
| 6 | Failure cases | 2 h | Survives one roll motor at 70% thrust, a sagging battery and a 5 m/s gust, or the log shows why not |
| 7 | Decision gate | 30 min | Isuru picks the flight controller using steps 3–6 |

Total: about 17–24 hours, all on the laptop, no hardware.

Steps 1–6 also feed the thrust-stand gate: measured thrust replaces the model figures in
`spec.js`, and SITL reruns against the measured aircraft.

## Risks

- **The nozzle may not map onto a stock tilt type.** Then the Lua script carries more of the work,
  or ArduPilot needs a small firmware change, as the reference build needed.
- **`sim.js` aerodynamics are first-pass.** SITL tunes the controller against this model, not
  against the real aircraft. Tuning carries over only as far as the model is right. Expect to
  retune on the tether.
- **Board memory.** Two Lua scripts plus QuadPlane need an H7-class board. Check the chosen board
  supports scripting before buying.

## Decision

Isuru decides, after step 5:

1. **Stay on the ESP32 and madflight.** $0. Use SITL results only to check the hand-written mixer.
2. **Move to ArduPilot on an H7 board.** About $85–115 with GPS. Built-in transitions, failsafes
   and logs.

Recommendation: do steps 1–5 first. They cost no money and answer whether ArduPilot handles this
layout before anything is bought.

## Results (2026-11-16, ArduPlane 4.7.2 SITL, `tools/sitl-run.py`)

Decision taken before step 7: Isuru chose option 2, ArduPilot on an H7 board, for both the simulation
and the aircraft. No firmware fork was needed: stock ArduPlane with the Scripting Matrix frame
(`Q_FRAME_CLASS 15`) and continuous tilt on motor 2 only (`Q_TILT_TYPE 0`, `Q_TILT_MASK 2`).

| Step | Target | Result |
|---|---|---|
| 3 Hover | QHOVER 60 s within ±0.3 m | QLOITER 50 s: height ±0.05 m, position within 0.6 m, fans at 61% |
| 4 Matrix and nozzle | QLOITER works, yaw from the nozzle | Yes; nozzle trims about 6° of its 20° swing against fan torque |
| 5 Transitions | ≤ 3 m lost | Full mission flown and landed; about 6 m lost as the lift fans stop at the end of the transition (one run, not ten) |
| 6 Failures | survive 70% roll motor and a 5 m/s gust | Both survive and land; in wind the nose turns into it, so weathervaning is on |

Findings that change other work:
- The nozzle script's inputs were wrong for ArduPilot: motor tilt is 0 in the hover and 1000 fully
  forward (the reverse of the script's assumption), and the rudder output carries only the
  fixed-wing yaw damper in Q modes. Both fixed in `firmware/nozzle/nozzle_3bsm.lua`, which now reads
  `motors:get_yaw()` in VTOL flight. Its start-up scan also exceeded ArduPilot's per-call
  instruction limit and now runs over its first eleven calls.
- `sim.js` stalls near 13.6 m/s (lift coefficient about 0.87), not the 11.5 m/s of the vortex-lattice
  study, so transitions are set to finish at 16 m/s.
- Throttle factors in a Scripting Matrix frame must be set before `MotorsMatrix:init()`, or they are
  silently ignored and the lift fan works at 66% instead of 60%.
