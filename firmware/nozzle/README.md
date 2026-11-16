# Swivel-nozzle firmware

The nozzle has its own small board, as on proven 3BSM models: the flight controller sends it two pulses (deflection and
yaw), and the board homes the three joint gearmotors and holds each joint where it should be.

| File | What |
|---|---|
| `nozzle_3bsm.lua` | Flight-controller half, an ArduPilot script: hover guard, slew rates, radio loss; sends deflection and yaw |
| `Nozzle3BSM.h` | Nozzle-board controller: geometry, homing, position control. Header only, no Arduino calls |
| `nozzle_board/nozzle_board.ino` | Pins for the board: RP2040-Zero, two DRV8833, three N20 encoders. Not yet built or run on hardware |
| `host_test.cpp` | Builds the controller on a PC and runs it against a model of the motors, gears, loads and stops |

Check both halves: `node tools/nozzle-firmware-test.mjs` (needs g++ or clang++; the Lua half needs `pip install lupa`).
Wiring, homing and the bench steps: docs/ducted-propulsion.md, "Drive" and "Nozzle board".
