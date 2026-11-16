"""Runs firmware/nozzle/nozzle_3bsm.lua (the flight-controller half) off the vehicle (needs: pip install lupa) and prints
JSON for tools/nozzle-firmware-test.mjs."""
import json, os
from lupa import LuaRuntime
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lua = LuaRuntime(unpack_returned_tuples=True)
N = lua.execute(open(os.path.join(root, "firmware", "nozzle", "nozzle_3bsm.lua")).read())
pulses = [[d, y, *N.pulses(d, y)] for d in (0, 45, 90, 100, 120) for y in (-30, -20, 0, 20)]
run = []
for i in range(4000):   # pilot asks for 90 then 0 deg at 2 m/s (the guard holds 35), speeds up, yaws, then the link drops
    t = i * 0.0025; v = 2.0 if t < 4 else 2.0 + (t - 4) * 5.0 if t < 8 else 22.0
    u1, u2, defl, yaw, guarded = N.update(0.0025, 90.0 if t < 3 else 0.0, 30.0 if 8 < t < 10 else 0.0, v, False, t < 9.0)
    if i % 40 == 0: run.append([t, defl, yaw, u1, u2, 1 if guarded else 0])
print(json.dumps({"pulses": pulses, "run": run}))
