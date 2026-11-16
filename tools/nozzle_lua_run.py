"""Runs firmware/nozzle/nozzle_3bsm.lua off the vehicle (needs: pip install lupa) and prints the same JSON as
firmware/nozzle/host_test.cpp, so tools/nozzle-firmware-test.mjs can check both ports the same way."""
import json, os, sys
from lupa import LuaRuntime
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lua = LuaRuntime(unpack_returned_tuples=True)
N = lua.execute(open(os.path.join(root, "firmware", "nozzle", "nozzle_3bsm.lua")).read())
cb, cr = N.centres()
poses = []
for d in range(0, 101, 5):
    for y in range(-20, 21, 10):
        a, b, c = N.solve(d, y); s1, s2 = N.servoAngles(a, b); poses.append([d, y, a, b, s1, s2])
run = []
for i in range(4000):
    t = i * 0.0025; v = 2.0 if t < 4 else 2.0 + (t - 4) * 5.0 if t < 8 else 22.0
    u1, u2, defl, yaw, guarded = N.update(0.0025, 90.0 if t < 3 else 0.0, 30.0 if 8 < t < 10 else 0.0, v, False, t < 9.0)
    if i % 40 == 0: run.append([t, defl, yaw, u1, u2, None, 1 if guarded else 0])
print(json.dumps({"centres": [cb, cr], "poses": poses, "run": run}))
