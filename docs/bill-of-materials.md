# Bill of materials

Every part of the aircraft as it is now drawn, split into what is already on the shelf and what
still has to be bought. Masses come from `site/js/spec.js`, which is generated from the CAD, so
they match the 1,989 g all-up figure on `/analysis.html`. Prices are typical hobby-shop prices in
US dollars at the time of writing, not quotes.

**To buy: about $190**, of which $100 is the flight controller (ArduPilot, decided 2026-11-16). Everything else is either owned or printed.

## Still to buy

| Item | Qty | Mass each | $ each | $ | Why this one |
|---|---|---|---|---|---|
| 2807-size brushless motor, about 1,500 KV | 1 | 48 g | 20 | 20 | The 140 mm lift fan is torque-limited at 35 A. This motor gives 1,344 g against the owned 2306's 1,206 g, and that difference is the whole hover margin |
| 4-cell 2,700 mAh LiPo pack | 1 | 306 g | 26 | 26 | 2,200 mAh misses the 3-minute hover target; 3,300 mAh is too heavy for the fan margin |
| 9 g metal-gear servo (landing gear) | 3 | 10 g | 6 | 18 | One per leg. Plastic gears strip on a hard landing |
| 5 in three-blade propeller | 2 | 6 g | 6 | 12 | Roll motors. Buried in the wing ducts, so they are consumables |
| Connector and wire set: XT60 pair, 10 MR30 pairs, servo plugs, 14/16/18/20 AWG silicone wire | 1 | in the 132 g harness | 14 | 14 | Every run gets a connector at each end, which is what makes a component removable |
| ArduPilot H743 wing board, e.g. Matek H743-WLITE | 1 | 22 g | 100 | 100 | ArduPilot with Lua scripting (needs 2 MB flash). Replaces the ESP32, gyro board and both regulators: +5 g net. About £80 in the UK |
| | | | **Total** | **$190** | |

## Already owned

| Item | Qty | Mass each | Note |
|---|---|---|---|
| EMAX 2306 1,700 KV motor | 1 | 34 g | Drives the 80 mm main fan now that the 1,500 KV motor takes the lift fan |
| 2206-size motor, roll pair | 2 | 34 g | In the wing ducts |
| 30–45 A speed controller | 4 | 15 g | Three beside the battery, one in the nose for the lift fan |
| Power distribution board | 1 | 8 g | Beside the battery |
| ESP32 DevKit v1 | 1 | 10 g | No longer flies the aircraft (ArduPilot board instead); keep for the nozzle bench rig |
| MPU6050 gyro board | 1 | 3 g | Not needed with the ArduPilot board |
| FS-iA6B receiver | 1 | 15 g | |
| Adjustable regulator, set to 6 V | 1 | 2 g | Spare: the H743 board's servo supply does this (jumper to 6 V). Servo rail. 6 V, not 5 V: the nozzle servos need the extra 15% torque (docs/ducted-propulsion.md) |
| MG90S servo | 2 | 14 g | Nozzle cords |
| 9 g servo | 2 | 10 g | Stabilators |
| 8 × 1 mm carbon tube | 1,950 mm | 76 g total | One 676 mm spar, two 637 mm longerons. About $12 of arrow shaft if the leftovers measure short |
| M3 hardware, bearings, heat-set inserts | — | in the part masses | Three 8 mm bearings for the nozzle |

## Printed

| Material | Mass in the aircraft | With waste and failures | About |
|---|---|---|---|
| LW-PLA (shells, wings, fairings) | 641 g | 740 g | $30 |
| PETG (structure, mounts, gear, fan and nozzle) | 488 g | 560 g | $11 |

78 parts in all. `python3 cad/build.py` writes every one of them; the bench kit (fan, nozzle,
collars, drums) comes from `python3 cad/propulsion.py`.

## What drives the cost

The expensive half of this aircraft was bought for an earlier project. Of the $90 left, $46 is the
motor and the pack, and both were chosen by the hover study rather than by price: a cheaper pack
costs hover time, and the owned motor costs the fan margin. The other $44 is servos, propellers and
connectors, which are consumables on a VTOL model and will be bought again after a bad landing.
