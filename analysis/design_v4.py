"""Fourth loop: choose the layout for lowest weight and cost with a stable hover, transition and forward flight.
Run: python3 analysis/design_v4.py   (writes site/analysis/v4.json; about 3 minutes)

Starts from the aircraft as drawn in loop 2 (analysis/parts_v3.json, a frozen copy) and evaluates every combination of:
  lift-fan motor (owned 1,700 KV / bought 1,500 KV), roll propellers (4 in as drawn / 4 in forward / 5 in forward),
  battery (owned 3,300 / 2,700 / 2,200 mAh), speed controllers (26 g / 15 g), and one fixed set of airframe changes
  (retractable gear, larger tailplane, honest wiring mass, thinner nozzle walls, lighter longerons).
Each is scored on weight, stability margin, hover fan load, hover time, stall speed and money still to spend."""
import json, os, itertools, numpy as np
from scipy.optimize import linprog
from functools import lru_cache
import fan_bem as FB

here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P3 = json.load(open(os.path.join(here, "parts_v3.json"))); D3 = P3["D"]
fans = json.load(open(os.path.join(site, "fans.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
G, RHO, C_REF = 9.81, 1.20, 240.0
NP_V3 = -36.0                    # point where lift acts, as drawn (baseline_aero.py), spec x
NP_TAIL15 = -38.8                # with the tailplane 1.5x in area (vortex-lattice run in this loop: 2.8 mm further aft)
S_REF, CLMAX = 0.1584, 1.03 * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]
X_NOZ, NOZ_LOSS = -403.5, 0.85
LIFT_ARGS = (140.0, 17.0, 7, 13.2, 18.0, 17000.0, 27.0); MAIN_ARGS = (80.0, 17.0, 7, 21.0, 26.0, 18000.0, 37.6)

# ---------------------------------------------------------------- roll propellers: a model in place of the 1,000 g guess
# Static thrust and power coefficients of a 3-blade 4.3-4.5 in pitch propeller, from a published bench test of a 2306 motor
# with a 5 x 4.3 x 3 propeller (1,392 g at 26,400 rpm and 37.5 A on 4 cells). Same coefficients used for the 4 in size.
CT, CP = 0.226, 0.142
INSTALL = 0.85                   # buried in the wing with the spar across the duct: 9% of the disc blocked, plus the mount
def prop(d_in, throttle=1.0, kv=1700.0, r_m=0.070, v=15.2, r_b=0.030, i0=1.0):
    d = d_in * 0.0254; kt = 60.0 / (2 * np.pi * kv); lo, hi = 10.0, kv * v / 60
    for _ in range(50):
        n = (lo + hi) / 2; q = CP / (2 * np.pi) * RHO * n * n * d ** 5; i = q / kt + i0
        lo, hi = (n, hi) if n * 60 / kv < throttle * (v - i * r_b) - i * r_m else (lo, n)
    t = CT * RHO * n * n * d ** 4
    return dict(rpm=round(n * 60), thrust_g=round(t / G * 1000 * INSTALL), amps=round(i, 1), watts=round(i * throttle * (v - i * r_b)))
def prop_watts(d_in, thrust_g):
    lo, hi = 0.05, 1.0
    for _ in range(30):
        th = (lo + hi) / 2; lo, hi = (th, hi) if prop(d_in, th)["thrust_g"] < thrust_g else (lo, th)
    return prop(d_in, hi)["watts"]

# ---------------------------------------------------------------- options
def with_motor(kv, r, v, fn):
    keep = (FB.KV, FB.KT, FB.R_M, FB.V_BATT); FB.KV, FB.R_M, FB.V_BATT = kv, r, v; FB.KT = 60.0 / (2 * np.pi * kv)
    try: return fn()
    finally: FB.KV, FB.KT, FB.R_M, FB.V_BATT = keep
LIFT = {"owned": dict(kv=1700, r=0.070, g=34, usd=0, name="EMAX 2306 1,700 KV (owned)"),
        "1500": dict(kv=1500, r=0.065, g=48, usd=20, name="2807-size 1,500 KV (buy)")}
for k, m in LIFT.items():
    m["thrust_g"] = min(with_motor(m["kv"], m["r"], v, lambda: FB.at_limit(FB.fan(*LIFT_ARGS)))["expected_g"] for v in (16.0, 14.0))
tan34 = np.tan(np.radians(34.0))
def le(z): return D3["wing"]["rootLE"] - (z - D3["wing"]["rootZ"]) * tan34
def roll_site(x, hole_r):        # furthest outboard the duct fits with 8 mm to the leading edge
    return float(np.floor(D3["wing"]["rootZ"] + (D3["wing"]["rootLE"] - x - hole_r - 8) / tan34))
ROLL = {"4A": dict(d=4, x=-183.0, z=240.0, hole_r=55.0, usd=0, name="4 in, as drawn (behind the spar)"),
        "4B": dict(d=4, x=-139.0, z=roll_site(-139.0, 55.0), hole_r=55.0, usd=0, name="4 in, in front of the spar"),
        "5B": dict(d=5, x=-139.0, z=roll_site(-139.0, 68.5), hole_r=68.5, usd=4, name="5 in, in front of the spar")}
for r in ROLL.values(): r.update(pair_g=2 * prop(r["d"])["thrust_g"], amps=prop(r["d"])["amps"], arm_vs_now=round(r["z"] / 240.0, 2), inner_gap=round(r["z"] - r["hole_r"] - 108, 1))
BATT = {3300: dict(g=370, usd=0, name="4-cell 3,300 mAh (owned)"), 2700: dict(g=306, usd=26, name="4-cell 2,700 mAh (buy)"), 2200: dict(g=254, usd=22, name="4-cell 2,200 mAh (buy)")}
ESC = {26: dict(usd=36, name="4 x 40 A with heat sinks, 26 g each"), 15: dict(usd=40, name="4 x 45 A bare boards, 15 g each")}
BATT_X = (-73.0, 16.0)

# ---------------------------------------------------------------- wiring, measured along the built-in channels (mm, both ends on a connector)
AWG = {14: 27.0, 16: 17.0, 18: 11.0, 26: 2.0}        # g per metre of silicone wire, per conductor
ELEC = {"nose": dict(F=367.0, M=367.0, R=367.0, pdb=367.0, fc=367.0, name="Speed controllers and flight controller in the nose (as drawn)"),
        "split": dict(F=367.0, M=-75.0, R=-75.0, pdb=-75.0, fc=367.0, name="Lift-fan speed controller and flight controller in the nose; main and roll speed controllers behind the battery"),
        "split2": dict(F=367.0, M=-75.0, R=367.0, pdb=100.0, fc=367.0, name="Only the main-fan speed controller behind the battery"),
        "centre": dict(F=20.0, M=20.0, R=20.0, pdb=20.0, fc=-45.0, name="Everything beside and behind the battery, under the top hatch"),
        "bay": dict(F=360.0, M=65.0, R=65.0, pdb=65.0, fc=367.0, name="Main and roll controllers and the power board beside the battery; lift-fan controller and flight controller in the nose"),
        "fanbay": dict(F=210.0, M=210.0, R=210.0, pdb=210.0, fc=367.0, name="All four controllers and the power board in the lift-fan bay, either side of the fan duct")}
def harness(elec, roll, bat_x=0.0):
    E = ELEC[elec]; f, p, rz = E["fc"], E["pdb"], ROLL[roll]["z"]
    runs = [("Battery to the power board", 14, 2, abs(bat_x - p) + 60, (bat_x + p) / 2)]
    for k, n in (("F", "lift-fan"), ("M", "main-fan"), ("R", "left roll"), ("R", "right roll")):
        runs.append((f"Power board to the {n} speed controller", 16, 2, abs(p - E[k]) + 50, (p + E[k]) / 2))
        runs.append((f"Throttle signal, {n}", 26, 2, abs(f - E[k]) + 40, (f + E[k]) / 2))
    runs += [("Lift-fan motor leads", 16, 3, abs(E["F"] - 210) + 60, (E["F"] + 210) / 2), ("Main-fan motor leads", 16, 3, abs(E["M"] + 218) + 60, (E["M"] - 218) / 2),
            ("Roll motor leads, left", 18, 3, abs(E["R"] + 160) + (rz - 70) + 60, (E["R"] - 160) / 2), ("Roll motor leads, right", 18, 3, abs(E["R"] + 160) + (rz - 70) + 60, (E["R"] - 160) / 2),
            ("Nozzle servo leads x 2", 26, 6, abs(f + 222) + 60, (f - 222) / 2),
            ("Tail servo leads x 2", 26, 6, abs(f + 362) + 80, (f - 362) / 2), ("Nose gear servo lead", 26, 3, abs(f - 330) + 50, (f + 330) / 2), ("Main gear servo leads x 2", 26, 6, abs(f + 78) + 80, (f - 78) / 2),
            ("Receiver, gyro and 5 V leads", 26, 16, 80, f)]
    out = [dict(run=n, awg=a, wires=k, mm=round(l), g=round(AWG[a] * k * l / 1000, 1), x=round(x)) for n, a, k, l, x in runs]
    out.append(dict(run="Connectors: XT60, 4 x MR30, 7 servo plugs", awg=None, wires=None, mm=None, g=22.0, x=round((E["F"] + E["M"] + 2 * E["R"]) / 4)))
    m = sum(r["g"] for r in out); return out, round(m), round(sum(r["g"] * r["x"] for r in out) / m)

# ---------------------------------------------------------------- airframe changes common to every option (grams, station)
FIXED = [("Retractable gear in place of the two skids: 3 legs, 3 servos, pivots", {"skidF": (-18, None), "skidR": (-18, None)}, [("gearNose", 19, 330.0), ("gearMainL", 21, -78.0), ("gearMainR", 21, -78.0)]),
         ("Tailplane 1.5x in area", {"stabL": (+5.5, None), "stabR": (+5.5, None)}, []),
         ("Channel covers, wing-root fairings", {}, [("covers", 14, 60.0)]),
         ("Longerons 8 x 0.75 mm", {"longeronL": (-8.5, None), "longeronR": (-8.5, None)}, []),
         ("Nozzle wall 1.0 mm, duct wall 1.6 mm", {"seg1": (-5, None), "seg2": (-7, None), "seg3": (-4, None), "edfDuct": (-15, None)}, []),
         ("5 V regulator: 2 g buck board", {"ubec": (-10, None)}, [])]
ROLLPARTS = ["motorL", "motorR", "podL", "podR", "propL", "propR"]

def layout(lift, roll, cap, esc, v4=True, margin_target=6.0, battery_x=None, elec="nose"):
    ps = {p["id"]: dict(m=float(p["mass"]), x=float(p["cg"][0])) for p in P3["parts"]}
    ps["motorF"]["m"] = LIFT[lift]["g"]; ps["battery"]["m"] = BATT[cap]["g"]
    for i in ROLLPARTS: ps[i]["x"] += ROLL[roll]["x"] - D3["rollX"]
    if ROLL[roll]["d"] == 5: ps["propL"]["m"] = ps["propR"]["m"] = 5.5
    for i in ("escF", "escM", "escL", "escR"): ps[i]["m"] = float(esc)
    if v4:
        _, hg, hx = harness(elec, roll); ps["harness"] = dict(m=float(hg), x=float(hx))
        for i, k in (("escF", "F"), ("escM", "M"), ("escL", "R"), ("escR", "R")): ps[i]["x"] = ELEC[elec][k]
        if elec == "centre":
            for i in ("esp32", "rx", "ubec", "imu", "fcSled"):
                if i in ps: ps[i]["x"] = ELEC[elec]["fc"]
            ps["canopy"]["m"] = 9.0; ps["nose"]["m"] -= 6.0                     # no hatch in the nose: thinner canopy, no bay walls
        for _, changes, new in FIXED:
            for pid, (dm, x) in changes.items():
                ps[pid]["m"] += dm
                if x is not None: ps[pid]["x"] = (ps[pid]["x"] * (ps[pid]["m"] - dm) + x * dm) / ps[pid]["m"] if pid != "harness" else x
            for pid, m, x in new: ps[pid] = dict(m=float(m), x=float(x))
    np_x = NP_TAIL15 if v4 else NP_V3
    m = sum(q["m"] for q in ps.values()); bat = ps["battery"]
    if battery_x is None:
        rest = sum(q["m"] * q["x"] for k, q in ps.items() if k != "battery")
        bat["x"] = float(np.clip(((np_x + margin_target / 100 * C_REF) * m - rest) / bat["m"], *BATT_X))
    else: bat["x"] = battery_x
    cg = sum(q["m"] * q["x"] for q in ps.values()) / m
    return m, cg, bat["x"], np_x, ps

def hover(m, cg, lift, roll):
    cap = np.array([LIFT[lift]["thrust_g"], fans["main"]["at_current_limit"]["expected_g"] * NOZ_LOSS, ROLL[roll]["pair_g"]], float)
    arms = np.array([D3["fanX"] - cg, X_NOZ - cg, ROLL[roll]["x"] - cg])
    r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0], A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
    return None if not r.success else dict(worst=float(r.x[3]), F=float(r.x[0]), M=float(r.x[1]), R=float(r.x[2]), cap=cap.tolist())

@lru_cache(maxsize=None)
def fan_watts(args, kv, r, thrust_g):
    def w(th): return with_motor(kv, r, 15.2, lambda: FB.match(FB.fan(*args), th))
    lo, hi = 0.15, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2; lo, hi = (mid, hi) if w(mid)["thrust_g"] * FB.REAL < thrust_g else (lo, mid)
    return w(hi)["watts"]
def hover_time(h, lift, roll, cap):
    L = LIFT[lift]; pf = fan_watts(LIFT_ARGS, L["kv"], L["r"], round(h["F"] * h["cap"][0] / 10) * 10); pm = fan_watts(MAIN_ARGS, 1700, 0.070, round(h["M"] * h["cap"][1] / NOZ_LOSS / 10) * 10)
    pr = 2 * prop_watts(ROLL[roll]["d"], h["R"] * h["cap"][2] / 2); p = pf + pm + pr + 6.0
    return dict(minutes=round(0.8 * cap / 1000 * 14.8 * 60 / p, 1), watts=round(p), lift_W=round(pf), main_W=round(pm), roll_W=round(pr))

def control(m, cg, h, roll, ps):
    """Angular acceleration each axis can still command in the hover, from the thrust left above the hover setting (deg/s2)."""
    izz = sum(q["m"] * (q["x"] - cg) ** 2 for q in ps.values()) * 1e-9                       # pitch, kg m2
    z = {p["id"]: p["cg"][2] for p in P3["parts"]}; zr = ROLL[roll]["z"]
    ixx = sum(q["m"] * (zr if k in ("motorL", "propL", "podL", "motorR", "propR", "podR") else z.get(k, 0.0)) ** 2 for k, q in ps.items()) * 1e-9 + 0.002   # roll; + body depth
    dR = (1 - h["R"]) * h["cap"][2] / 2 / 1000 * G                                             # spare thrust per roll motor, N
    roll_acc = min(dR, h["R"] * h["cap"][2] / 2 / 1000 * G) * 2 * zr / 1000 / ixx                # one up, one down
    dF = min(1 - h["F"], h["F"]) * h["cap"][0] / 1000 * G
    pitch_acc = dF * (D3["fanX"] - cg) / 1000 / izz
    return dict(roll_deg_s2=round(float(np.degrees(roll_acc))), pitch_deg_s2=round(float(np.degrees(pitch_acc))), ixx=round(ixx, 4), izz=round(izz, 4))

def evaluate(lift="owned", roll="4A", cap=3300, esc=26, v4=True, timed=True, elec="nose", **kw):
    m, cg, bx, np_x, ps = layout(lift, roll, cap, esc, v4, elec=elec, **kw); h = hover(m, cg, lift, roll)
    out = dict(lift=lift, roll=roll, cap=cap, esc=esc, elec=elec, v4=v4, harness_g=round(ps["harness"]["m"]), mass=round(m), cg=round(cg, 1), battery_x=round(bx, 1), margin=round((cg - np_x) / C_REF * 100, 1),
               stall=round(float(np.sqrt(2 * m / 1000 * G / (1.225 * S_REF * CLMAX))), 1), hover_worst=None if h is None else round(h["worst"], 3),
               hover=None if h is None else {k: round(h[k], 3) for k in "FMR"}, thrust_g=None if h is None else dict(lift=round(h["cap"][0]), nozzle_down=round(h["cap"][1]), roll_pair=round(h["cap"][2])),
               usd=LIFT[lift]["usd"] + ROLL[roll]["usd"] + BATT[cap]["usd"] + ESC[esc]["usd"])
    if h is not None:
        out["control"] = control(m, cg, h, roll, ps)
        if timed: out["time"] = hover_time(h, lift, roll, cap)
    out["ok"] = dict(hover=h is not None and h["worst"] <= 0.60, margin=5.0 <= out["margin"] <= 12.0, stall=out["stall"] <= 12.0, time=bool(timed and h is not None and out["time"]["minutes"] >= 3.0))
    return out

if __name__ == "__main__":
    print("roll propellers:", {k: (v["pair_g"], v["amps"], v["z"], v["inner_gap"]) for k, v in ROLL.items()}); print("lift fan:", {k: v["thrust_g"] for k, v in LIFT.items()})
    for k in ELEC: print("wiring,", k, harness(k, "5B")[1:])
    drawn = evaluate(v4=False, battery_x=16.0); print("as drawn, roll propellers modelled:", drawn["mass"], drawn["margin"], drawn["hover_worst"], drawn["time"])
    combos = [evaluate(l, r, c, e, elec=el) for l, r, c, e, el in itertools.product(LIFT, ROLL, BATT, ESC, ELEC)]
    for c in combos: print(c["lift"], c["roll"], c["cap"], c["esc"], c["elec"], c["mass"], "g  margin", c["margin"], " worst", c["hover_worst"], " time", c["time"]["minutes"], " $", c["usd"], " bx", c["battery_x"], [k for k, v in c["ok"].items() if not v])
    ok = [c for c in combos if all(c["ok"].values())]
    cheapest = min(ok, key=lambda c: (c["usd"], c["mass"])) if ok else None; lightest = min(ok, key=lambda c: (c["mass"], c["usd"])) if ok else None
    print("cheapest:", cheapest); print("lightest:", lightest)
    json.dump(dict(drawn=drawn, combos=combos, cheapest=cheapest, lightest=lightest, lift={k: {a: b for a, b in v.items()} for k, v in LIFT.items()}, roll=ROLL, batt=BATT, esc=ESC,
                   harness={k: harness(k, "5B")[0] for k in ELEC}, elec=ELEC, fixed=[dict(change=n, g=round(sum(d for d, _ in ch.values()) + sum(m for _, m, _ in new), 1)) for n, ch, new in FIXED],
                   prop_model=dict(CT=CT, CP=CP, install=INSTALL)), open(os.path.join(site, "v4.json"), "w"), indent=1)
