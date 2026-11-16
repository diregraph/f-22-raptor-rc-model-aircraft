# Swivel-nozzle controller

| File | What |
|---|---|
| `Nozzle3BSM.h` | C++ controller for the ESP32 / madflight. Header only, no Arduino calls |
| `NozzleLimits.h` | Main-fan thrust cap by deflection. Written by `node tools/nozzle-loads.mjs --write`; do not edit |
| `nozzle_3bsm.lua` | The same controller as an ArduPilot script, if ArduPilot wins (docs/engineering/05-ardupilot-sitl-plan.md) |
| `host_test.cpp` | Builds the C++ on a PC for the checks |

Check both against the reference maths: `node tools/nozzle-firmware-test.mjs` (needs g++ or clang++;
the Lua half needs `pip install lupa`). What it does and how to set trims and backlash:
docs/ducted-propulsion.md, "Controller" and bench steps 6 and 7.
