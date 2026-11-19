"""Scale study: how small can the skeleton F-35B get? Every part of the skeleton version (analysis/skeleton.py) is scaled by
the rule that governs it, and the weight is solved as a fixed point (motors and battery depend on the weight they lift).

  printed parts, skin, nodes, bays   ~ s^2.2   (walls stay at the printable minimum, so mass follows area)
  tubes                              ~ s^2.5
  motors, speed controllers, props   ~ M       (same 60% hover load at every size)
  battery                            ~ M^1.5 / s  (hover power at the fans' disc loading, same hover time)
  wiring                             ~ s * sqrt(M)
  servos, nozzle gearmotors          ~ s^2.5, floored at what can be bought (2 g servo, 3 g micro gearmotor)
  flight controller, receiver, FPV   fixed (22 g H743 board; 2 g ELRS receiver; 22 g FPV)
Stall speed ~ sqrt(M / s^2). Run after skeleton.py: python3 analysis/scale_study.py  (writes site/analysis/scale.json)
"""
import json, os, math
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
R = json.load(open(os.path.join(site, "skeleton.json"))); P = json.load(open(os.path.join(here, "parts.json")))
drop = {p["id"] for p in R["skeleton_fpv"]["removed"]}
parts = [p for p in P["parts"] if p["id"] not in drop] + R["skeleton_fpv"]["added"]
M0, S0 = R["skeleton_fpv"]["score"]["mass"], R["skeleton_fpv"]["score"]["stall"]
PROP = {"motorF", "motorL", "motorR", "motorM", "propL", "propR", "escF", "escM", "escL", "escR", "pdb"}
SERVO = {"stabServoL", "stabServoR", "gearServoN", "gearServoR", "gearServoL", "nzMotor1", "nzMotor2", "nzMotor3"}
FIXED = {"esp32": 22, "rx": 2, "nzBoard": 8, "fpvCam": 5, "fpvPanTilt": 7, "fpvVtx": 10}
def classify(p):
    i = p["id"]
    if i in PROP: return "propulsion"
    if i == "battery": return "battery"
    if i == "harness": return "wiring"
    if i in SERVO: return "servos"
    if i in FIXED: return "fixed"
    if i == "alSkeleton": return "tubes"
    return "printed"
base = {}
for p in parts: base.setdefault(classify(p), []).append(p)
def mass(s, M):
    g = {}
    g["printed"] = sum(p["mass"] for p in base["printed"]) * s ** 2.2
    g["tubes"] = sum(p["mass"] for p in base["tubes"]) * s ** 2.5
    g["propulsion"] = sum(p["mass"] for p in base["propulsion"]) * M / M0
    g["battery"] = 306 * (M / M0) ** 1.5 / s
    g["wiring"] = 132 * s * math.sqrt(M / M0)
    g["servos"] = sum(max(p["mass"] * s ** 2.5, 3 if p["id"].startswith("nz") else 2) for p in base["servos"])
    g["fixed"] = sum(FIXED[p["id"]] for p in base["fixed"])
    return g
rows = []
for k in range(50, 101, 5):
    s = k / 100; M = M0
    for _ in range(60): g = mass(s, M); M = 0.5 * M + 0.5 * sum(g.values())
    stall = S0 * math.sqrt((M / M0) / s ** 2)
    rows.append(dict(scale=s, mass=round(M), stall=round(stall, 1), span_mm=round(690 * s), length_mm=round(1008 * s), battery_g=round(g["battery"]),
                     groups={k: round(v) for k, v in g.items()}, ok=bool(M <= 2000 * s ** 2.2 + 400 and stall <= 12)))
    print(f"scale {s:.2f}  {round(M):5d} g  stall {stall:4.1f} m/s  span {round(690*s)} mm  " + "  ".join(f"{k} {round(v)}" for k, v in g.items()))
json.dump(dict(rows=rows, rules=__doc__), open(os.path.join(site, "scale.json"), "w"), indent=1)
