"""Hover-margin study: what brings the hardest-working fan in the hover to 60% or less, and the weight to 1,900 g or less,
while keeping the pitch stability margin at +5 to +12% and the stall speed at 12 m/s or less?
Run after fan_bem.py, baseline_aero.py and as_drawn.py:  python3 analysis/hover_margin.py   (writes site/analysis/hover.json)

Why the as-drawn aircraft is stuck at 78%: the three hover thrusts (lift fan 1,206 g at x = +210, tail nozzle 814 g at
x = -404, roll pair 1,000 g at x = -183) have their centre at x = -85 mm, but stability needs the balance point at about
x = -19. The lift fan and the roll motors then do all the work and the nozzle idles. Levers, each evaluated below:
  1. more lift-fan thrust (a lower-KV motor: the fan is limited by motor torque, not by the fan),
  2. roll motors forward and inboard (moves the thrust centre forward; costs roll arm),
  3. balance point as far aft as stability allows (battery slid aft), and
  4. a smaller battery (weight), checked against the 3-minute hover-time requirement.
Wing, tail and outline are unchanged, so the point where lift acts (from baseline_aero.py) does not move."""
import json, os, itertools, numpy as np
from scipy.optimize import linprog
import fan_bem as FB
import baseline_aero as B

here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P = B._P; D = P["D"]; PARTS = P["parts"]
fans = json.load(open(os.path.join(site, "fans.json"))); cur = json.load(open(os.path.join(site, "current.json")))["now"]
base = json.load(open(os.path.join(here, "baseline_aero.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
C_REF = 240.0; NP = -base["neutral_point_mm_behind_datum"]                       # spec x, +forward: -36 mm
X_NOZ = -403.5; NOZ_LOSS = 0.85; G = 9.81; RHO = 1.20
CLMAX = base["CL_max_est"] * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]
LIFT_ARGS = (140.0, 17.0, 7, 13.2, 18.0, 17000.0, 27.0); MAIN_ARGS = (80.0, 17.0, 7, 21.0, 26.0, 18000.0, 37.6)

# ---------- 1. lift-fan motor: KV sweep at the same 35 A limit, on a fresh and a tired pack
MOTORS = {1700: dict(r=0.070, g=34, name="EMAX 2306 1700 KV (now)"), 1600: dict(r=0.068, g=34, name="1600 KV"),
          1500: dict(r=0.065, g=48, name="2807-size 1500 KV"), 1450: dict(r=0.062, g=48, name="1450 KV"),
          1400: dict(r=0.060, g=48, name="1400 KV"), 1300: dict(r=0.055, g=48, name="2807-size 1300 KV"), 1200: dict(r=0.060, g=48, name="1200 KV")}
def with_motor(kv, v=16.0, fn=None):
    keep = (FB.KV, FB.KT, FB.R_M, FB.V_BATT)
    FB.KV, FB.R_M, FB.V_BATT = kv, MOTORS.get(kv, dict(r=0.070))["r"], v; FB.KT = 60.0 / (2 * np.pi * kv)
    try: return fn()
    finally: FB.KV, FB.KT, FB.R_M, FB.V_BATT = keep
def lift_limit(kv, v=16.0): return with_motor(kv, v, lambda: FB.at_limit(FB.fan(*LIFT_ARGS)))
kv_sweep = []
for kv in sorted(MOTORS):
    a, b = lift_limit(kv, 16.0), lift_limit(kv, 14.0)
    kv_sweep.append(dict(kv=kv, fresh_g=a["expected_g"], tired_g=b["expected_g"], amps=a["amps"], throttle=a["throttle"], rpm=a["rpm"]))
    print("lift motor %4d KV: %4d g on a fresh pack, %4d g at 3.5 V/cell, %.1f A, throttle %.2f" % (kv, a["expected_g"], b["expected_g"], a["amps"], a["throttle"]))
KV_NEW = 1500        # best thrust that holds up as the pack sags (1300-1400 KV give more on a fresh pack, then run out of volts)
LIFT = {1700: min(r["fresh_g"], r["tired_g"]) for r in kv_sweep if r["kv"] == 1700}
LIFT.update({r["kv"]: min(r["fresh_g"], r["tired_g"]) for r in kv_sweep})       # design on the tired-pack figure

# ---------- 2. roll-motor positions. The 110 mm propeller duct must stay inside the wing (8 mm to the leading edge, clear of
# the body), and the 30 mm motor must clear the spar at x = -160 (so x <= -139 in front of it, or x >= -181 behind it).
def le(z): return D["wing"]["rootLE"] - (z - D["wing"]["rootZ"]) * np.tan(np.radians(D["wing"]["sweep"]))
def max_z(x): return D["wing"]["rootZ"] + (le(D["wing"]["rootZ"]) - x - 55 - 8) / np.tan(np.radians(D["wing"]["sweep"]))
ROLL = {"A": dict(x=D["rollX"], z=D["rollZ"], label="Now: behind the spar, 240 mm out"),
        "B": dict(x=-139.0, z=float(np.floor(max_z(-139.0))), label="In front of the spar, as far out as the wing allows"),
        "C": dict(x=-120.0, z=float(np.floor(max_z(-120.0))), label="Further forward and inboard")}
for k, r in ROLL.items(): r["arm_vs_now"] = round(r["z"] / D["rollZ"], 2); r["hole_front_gap_mm"] = round(le(r["z"]) - (r["x"] + 55), 1)
ROLLPARTS = ["motorL", "motorR", "podL", "podR", "propL", "propR"]

# ---------- 3. batteries (4 cells). Mass: 0.105 g/mAh + 23 g of case, leads and plug (fits the 3,300 mAh pack's 370 g)
BATT = {c: round(0.105 * c + 23) for c in (3300, 3000, 2700, 2200)}
BATT_X = (-73.0, 16.0)          # slides aft in the tray from today's x = +16 (the lift-fan bay stops it going forward)

def layout(kv=1700, roll="A", cap=3300, margin_target=None, battery_x=None):
    """Mass, balance point and part list after the changes. With margin_target the battery is slid to give that margin."""
    ps = []
    for p in PARTS:
        q = dict(id=p["id"], m=float(p["mass"]), x=float(p["cg"][0]))
        if p["id"] == "motorF": q["m"] = float(MOTORS[kv]["g"])
        if p["id"] in ROLLPARTS: q["x"] += ROLL[roll]["x"] - D["rollX"]
        if p["id"] == "battery": q["m"] = float(BATT[cap])
        ps.append(q)
    bat = next(q for q in ps if q["id"] == "battery")
    m = sum(q["m"] for q in ps)
    if battery_x is not None: bat["x"] = battery_x
    elif margin_target is not None:
        want = NP + margin_target / 100 * C_REF                                      # balance point that gives the target margin
        rest = sum(q["m"] * q["x"] for q in ps if q is not bat)
        bat["x"] = float(np.clip((want * m - rest) / bat["m"], *BATT_X))
    cg = sum(q["m"] * q["x"] for q in ps) / m
    return m, cg, bat["x"]

ROLL_PAIR_G = 1000.0          # the roll pair is not modelled: a guess, the same one as_drawn.py and sizing.py use
def hover(m, cg, kv, roll, lift_g=None, roll_g=ROLL_PAIR_G):
    cap = np.array([LIFT[kv] if lift_g is None else lift_g, fans["main"]["at_current_limit"]["expected_g"] * NOZ_LOSS, roll_g])
    arms = np.array([D["fanX"] - cg, X_NOZ - cg, ROLL[roll]["x"] - cg])
    r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0],
                A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
    if not r.success: return None
    return dict(worst=float(r.x[3]), F=float(r.x[0]), M=float(r.x[1]), R=float(r.x[2]), cap=cap.tolist(),
                centre=float((cap * np.array([D["fanX"], X_NOZ, ROLL[roll]["x"]])).sum() / cap.sum()))

# ---------- 4. hover power and time
from functools import lru_cache
def fan_watts(args, kv, thrust_expected_g): return _fan_watts(args, kv, int(round(thrust_expected_g / 5.0)) * 5)
@lru_cache(maxsize=None)
def _fan_watts(args, kv, thrust_expected_g):
    """battery-side watts for a printed fan to give this expected thrust (bisection on throttle)"""
    def w(th): return with_motor(kv, 15.2, lambda: FB.match(FB.fan(*args), th))
    lo, hi = 0.15, 1.0
    for _ in range(14):
        mid = (lo + hi) / 2; r = w(mid)
        lo, hi = (mid, hi) if r["thrust_g"] * FB.REAL < thrust_expected_g else (lo, mid)
    return w(hi)["watts"]
def prop_watts(thrust_g, d_m=0.1016, fm=0.55, eta=0.80):
    t = thrust_g / 1000 * G; return t ** 1.5 / np.sqrt(2 * RHO * np.pi * d_m ** 2 / 4) / fm / eta
def hover_time(h, kv, cap_mah):
    pf = fan_watts(LIFT_ARGS, kv, h["F"] * h["cap"][0]); pm = fan_watts(MAIN_ARGS, 1700, h["M"] * h["cap"][1] / NOZ_LOSS)
    pr = 2 * prop_watts(h["R"] * h["cap"][2] / 2); p = pf + pm + pr + 6.0        # + receiver, flight controller, servos
    return dict(minutes=round(0.8 * cap_mah / 1000 * 14.8 * 60 / p, 1), watts=round(p), amps=round(p / 14.8, 1), lift_W=round(pf), main_W=round(pm), roll_W=round(pr))

def evaluate(kv=1700, roll="A", cap=3300, margin_target=None, battery_x=None, timed=True):
    m, cg, bx = layout(kv, roll, cap, margin_target, battery_x); h = hover(m, cg, kv, roll)
    stall = float(np.sqrt(2 * m / 1000 * G / (1.225 * base["s_ref_m2"] * CLMAX)))
    out = dict(kv=kv, roll=roll, cap=cap, battery_x=round(bx, 1), mass=round(m), cg=round(cg, 1), margin=round((cg - NP) / C_REF * 100, 1), stall=round(stall, 1),
               hover_worst=None if h is None else round(h["worst"], 3), hover=None if h is None else {k: round(h[k], 3) for k in "FMR"},
               thrust_g=None if h is None else dict(lift=round(h["cap"][0]), nozzle_down=round(h["cap"][1]), roll_pair=round(h["cap"][2])),
               thrust_centre=None if h is None else round(h["centre"], 1), roll_arm=ROLL[roll]["arm_vs_now"])
    if timed and h is not None: out["time"] = hover_time(h, kv, cap)
    out["ok"] = dict(hover=out["hover_worst"] is not None and out["hover_worst"] <= 0.60, mass=out["mass"] <= 1900, margin=5.0 <= out["margin"] <= 12.0,
                     stall=out["stall"] <= 12.0, time=bool(timed and h is not None and out["time"]["minutes"] >= 3.0))
    return out

if __name__ == "__main__":
    now = evaluate(battery_x=next(p for p in PARTS if p["id"] == "battery")["cg"][0])
    print("as drawn:", now["mass"], "g, margin", now["margin"], "%, hover", now["hover_worst"], now["hover"], "time", now["time"])
    assert abs(now["hover_worst"] - cur["hover_worst"]) < 0.005 and abs(now["margin"] - cur["margin"]) < 0.2, "does not reproduce as_drawn.py"

    # one lever at a time, from the as-drawn aircraft
    steps = [("As drawn", now)]
    steps.append(("Balance point to +6% (battery 15 mm aft)", evaluate(margin_target=6.0)))
    steps.append(("Lift-fan motor 1,500 KV", evaluate(kv=KV_NEW, margin_target=6.0)))
    steps.append(("Roll motors in front of the spar", evaluate(kv=KV_NEW, roll="B", margin_target=6.0)))
    steps.append(("Battery 2,700 mAh", evaluate(kv=KV_NEW, roll="B", cap=2700, margin_target=6.0)))
    for n, s in steps: print("%-44s %5d g  margin %5.1f%%  worst fan %s  time %s" % (n, s["mass"], s["margin"], s["hover_worst"], s.get("time", {}).get("minutes")))

    # every combination, balance point set for a +6% margin (1 point above the floor, for build scatter)
    combos = [evaluate(kv, roll, cap, margin_target=6.0) for kv, roll, cap in itertools.product((1700, KV_NEW), "ABC", sorted(BATT, reverse=True))]
    feasible = [c for c in combos if all(c["ok"].values())]
    # prefer: fewest changes to the outline (roll position), then the most hover margin
    feasible.sort(key=lambda c: ("ABC".index(c["roll"]), c["hover_worst"]))
    best = feasible[0] if feasible else None
    print("feasible:", [(c["kv"], c["roll"], c["cap"], c["mass"], c["hover_worst"], c["time"]["minutes"]) for c in feasible]); print("chosen:", best)

    # fan load against all-up weight, balance point at +6%: how much weight each layout can carry at 60%
    def vs_mass(kv, roll):
        pts = []
        for m_target in range(1700, 2001, 10):
            m0, cg0, _ = layout(kv, roll, 3300, margin_target=6.0); h = hover(m_target, cg0, kv, roll)    # extra or missing mass placed at the balance point
            pts.append([m_target, None if h is None else round(h["worst"], 3)])
        return pts
    curves = [dict(name="As drawn (balance point at +6%)", kv=1700, roll="A", pts=vs_mass(1700, "A")),
              dict(name="Lift-fan motor 1,500 KV", kv=KV_NEW, roll="A", pts=vs_mass(KV_NEW, "A")),
              dict(name="1,500 KV + roll motors in front of spar", kv=KV_NEW, roll="B", pts=vs_mass(KV_NEW, "B")),
              dict(name="1,500 KV + roll motors forward and inboard", kv=KV_NEW, roll="C", pts=vs_mass(KV_NEW, "C"))]
    for c in curves:
        ok = [p[0] for p in c["pts"] if p[1] is not None and p[1] <= 0.60]; c["max_mass_at_60"] = max(ok) if ok else None
        print("  %-46s carries %s g at 60%%" % (c["name"], c["max_mass_at_60"]))
    # fan load against balance point, chosen motors, battery and roll position
    # the recommended package does not reach 60% on modelled thrust: how much more thrust, or less weight, would?
    pkg = dict(kv=KV_NEW, roll="B", cap=2700)
    pm, pcg, _ = layout(**pkg, margin_target=6.0)
    def solve(f, lo, hi):                       # smallest x in [lo, hi] with f(x) <= 0.60 (f falls as x rises)
        for _ in range(40):
            mid = (lo + hi) / 2; lo, hi = (mid, hi) if f(mid) > 0.60 else (lo, mid)
        return hi
    need = dict(roll_pair_g=round(solve(lambda g: hover(pm, pcg, KV_NEW, "B", roll_g=g)["worst"], 800, 2000)),
                lift_g=round(solve(lambda g: hover(pm, pcg, KV_NEW, "B", lift_g=g)["worst"], 1000, 2500)),
                mass_g=round(-solve(lambda d: hover(-d, pcg, KV_NEW, "B")["worst"], -pm, -1400)),
                both_pct=round(solve(lambda k: hover(pm, pcg, KV_NEW, "B", lift_g=LIFT[KV_NEW] * k, roll_g=ROLL_PAIR_G * k)["worst"], 1.0, 1.5) * 100 - 100, 1))
    cg_sweep = []                               # fan loads against balance point, for the recommended package
    for cg in np.arange(-70.0, 1.0, 2.0):
        h = hover(pm, cg, KV_NEW, "B")
        cg_sweep.append(dict(cg=round(float(cg), 1), margin=round((cg - NP) / C_REF * 100, 1), **({} if h is None else {k: round(h[k], 3) for k in ("worst", "F", "M", "R")})))
    roll_sweep = [[g, round(hover(pm, pcg, KV_NEW, "B", roll_g=g)["worst"], 3)] for g in range(700, 1501, 50)]
    print("to reach 60% with the package:", need)
    json.dump(dict(need=need, roll_sweep=roll_sweep, package=pkg, now=now, steps=[dict(step=n, **s) for n, s in steps], combos=combos, best=best, kv_sweep=kv_sweep, kv_new=KV_NEW, motors=MOTORS,
                   roll=ROLL, batteries=BATT, vs_mass=curves, cg_sweep=cg_sweep, np=NP, margin_target=6.0),
              open(os.path.join(site, "hover.json"), "w"), indent=1)
