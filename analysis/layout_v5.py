"""Fifth loop: balance and hover of the aircraft as it is now drawn, and where the electronics should live.
Run: python3 analysis/layout_v5.py   (needs analysis/parts.json from `node tools/export-parts.mjs`, plus
baseline_aero.json, fans.json and sizing.json; about 2 minutes). Writes site/analysis/v5.json.

Every mass and station here comes from the CAD by way of site/js/spec.js, so this is the real aircraft, not a sketch.
It prices each place the speed controllers could go, because that choice moves both the balance point and the wiring mass."""
import json, os, numpy as np
from scipy.optimize import linprog
import design_v4 as DV

here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P = json.load(open(os.path.join(here, "parts.json"))); D = P["D"]
aero = json.load(open(os.path.join(here, "baseline_aero.json")))
fans = json.load(open(os.path.join(site, "fans.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
G, C_REF, X_NOZ, NOZ_LOSS = 9.81, 240.0, -403.5, 0.85
NP = -aero["neutral_point_mm_behind_datum"]                    # spec x of the point where lift acts, with the 1.5x tailplane
S_REF = aero["s_ref_m2"]; CLMAX = aero["CL_max_est"] * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]
BATT_X = (-73.0, 16.0)                                        # forward stop is the lift-fan bay, aft stop is the spar
CAP = np.array([t["maxG"] for t in P["thrusters"]], float)
CAP = np.array([CAP[0], CAP[1] * NOZ_LOSS, CAP[2] + CAP[3]])  # lift fan, nozzle pointing down, roll pair

# Where the three speed controllers and the power board can go. The lift-fan controller stays in the nose either way:
# its motor is in the nose half of the aircraft, and nose weight is what keeps the aircraft stable.
PLACE = {"bay": dict(x=65.0, name="Beside the battery, under the top hatch (as drawn)"),
         "fanbay": dict(x=210.0, name="In the lift-fan bay, either side of the fan duct"),
         "nose": dict(x=360.0, name="In the nose bay with the flight controller")}
MOVERS = ["escM", "escL", "escR", "pdb"]

LIFT = {"owned": dict(g=34, thrust=1206, usd=0, name="EMAX 2306 1,700 KV (owned)"),
        "1500": dict(g=48, thrust=1344, usd=20, name="2807-size 1,500 KV (buy)")}
BATT = {2200: dict(g=254, usd=22), 2700: dict(g=306, usd=26), 3300: dict(g=370, usd=0)}

def build(place="bay", battery_x=None, margin_target=6.0, carbon=False, lift="1500", cap=2700):
    ps = {p["id"]: dict(m=float(p["mass"]), x=float(p["cg"][0])) for p in P["parts"]}
    for i in MOVERS: ps[i]["x"] = PLACE[place]["x"]
    ps["escF"]["x"] = DV.ELEC[place]["F"]
    ps["motorF"]["m"] = float(LIFT[lift]["g"]); ps["battery"]["m"] = float(BATT[cap]["g"])
    _, hg, hx = DV.harness(place, "5B", bat_x=0.0)
    ps["harness"] = dict(m=float(hg), x=float(hx))
    if carbon:                                                 # the tubes are already carbon in the spec; this is the aluminium it replaced
        for i in ("spar", "longeronL", "longeronR"): ps[i]["m"] /= 0.76
    m = sum(q["m"] for q in ps.values()); bat = ps["battery"]
    if battery_x is None:
        rest = sum(q["m"] * q["x"] for k, q in ps.items() if k not in ("battery", "batteryTray"))
        bat["x"] = ps["batteryTray"]["x"] = float(np.clip(((NP + margin_target / 100 * C_REF) * m - rest) / (bat["m"] + ps["batteryTray"]["m"]), *BATT_X))
    else: bat["x"] = ps["batteryTray"]["x"] = battery_x
    cg = sum(q["m"] * q["x"] for q in ps.values()) / m
    return m, cg, bat["x"], ps

def hover(m, cg, lift="owned"):
    CAP = np.array([LIFT[lift]["thrust"], float(np.array([t["maxG"] for t in P["thrusters"]])[1]) * NOZ_LOSS,
                    sum(t["maxG"] for t in P["thrusters"][2:])])
    arms = np.array([D["fanX"] - cg, X_NOZ - cg, D["rollX"] - cg])
    r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0],
                A_eq=[list(CAP) + [0], list(CAP * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
    return None if not r.success else dict(worst=float(r.x[3]), F=float(r.x[0]), M=float(r.x[1]), R=float(r.x[2]))

def score(place="bay", lift="1500", cap=2700, **kw):
    m, cg, bx, ps = build(place, lift=lift, cap=cap, **kw); h = hover(m, cg, lift)
    CAP = np.array([LIFT[lift]["thrust"], float(np.array([t["maxG"] for t in P["thrusters"]])[1]) * NOZ_LOSS,
                    sum(t["maxG"] for t in P["thrusters"][2:])])
    out = dict(place=place, lift=lift, cap=cap, usd=LIFT[lift]["usd"] + BATT[cap]["usd"] + 4 + 40, mass=round(m), cg=round(cg, 1), battery_x=round(bx, 1), harness_g=round(ps["harness"]["m"]),
               margin=round((cg - NP) / C_REF * 100, 1), stall=round(float(np.sqrt(2 * m / 1000 * G / (1.225 * S_REF * CLMAX))), 1),
               worst=None if h is None else round(h["worst"], 3), hover=None if h is None else {k: round(h[k], 3) for k in "FMR"},
               thrust_g=dict(lift=round(CAP[0]), nozzle_down=round(CAP[1]), roll_pair=round(CAP[2])))
    if h is not None:
        out["time"] = DV.hover_time(dict(F=h["F"], M=h["M"], R=h["R"], cap=list(CAP)), lift, "5B", cap)
        out["control"] = DV.control(m, cg, dict(F=h["F"], M=h["M"], R=h["R"], cap=list(CAP)), "5B", ps)
    out["ok"] = dict(hover=h is not None and h["worst"] <= 0.60, margin=5.0 <= out["margin"] <= 12.0,
                     stall=out["stall"] <= 12.0, time=bool(h is not None and out["time"]["minutes"] >= 3.0))
    return out

if __name__ == "__main__":
    print("neutral point", NP, "mm; thrust caps", CAP.round(0), "; hover thrust centre",
          round(float((CAP * np.array([D["fanX"], X_NOZ, D["rollX"]])).sum() / CAP.sum()), 1))
    rows = []
    for pl in PLACE:
        for lift in LIFT:
            for cap in BATT:
                r = score(pl, lift=lift, cap=cap); r["carbon"] = False; rows.append(r)
                print(f'{pl:7s} {lift:6s} {cap} {r["mass"]:5d} g  cg {r["cg"]:7.1f}  margin {r["margin"]:5.1f}  worst {r["worst"]}  '
                      f'time {r["time"]["minutes"]}  harness {r["harness_g"]}  battery at {r["battery_x"]:6.1f}  $ {r["usd"]:3d}  fails {[k for k, v in r["ok"].items() if not v]}')
    ok = [r for r in rows if all(r["ok"].values())]
    best = min(ok, key=lambda r: (r["mass"], r["usd"])) if ok else min(rows, key=lambda r: r["worst"])
    print("chosen:", best["place"], best["lift"], best["cap"], best["mass"], "g", "$", best["usd"])
    slide = [dict(battery_x=x, **{k: score(best["place"], lift=best["lift"], cap=best["cap"], battery_x=float(x))[k] for k in ("cg", "margin", "worst", "mass")}) for x in range(-73, 17, 9)]
    json.dump(dict(np_mm=NP, caps=CAP.tolist(), rows=rows, best=best, slide=slide, places=PLACE, aero=aero),
              open(os.path.join(site, "v5.json"), "w"), indent=1)
