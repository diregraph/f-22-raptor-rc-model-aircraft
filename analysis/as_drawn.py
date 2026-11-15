"""Scorecard for the aircraft exactly as drawn in the CAD and the twin. Run after `node` has exported analysis/parts.json and
after baseline_aero.py. Writes site/analysis/current.json."""
import json, os, numpy as np
from scipy.optimize import linprog
import baseline_aero as B
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P = B._P; D = P["D"]; fans = json.load(open(os.path.join(site, "fans.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
base = json.load(open(os.path.join(here, "baseline_aero.json")))
m = sum(p["mass"] for p in P["parts"]); cg = sum(p["mass"] * p["cg"][0] for p in P["parts"]) / m
cap = np.array([fans["lift"]["at_current_limit"]["expected_g"], fans["main"]["at_current_limit"]["expected_g"] * 0.85, 1000.0])
arms = np.array([D["fanX"] - cg, -403.5 - cg, D["rollX"] - cg])
r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0], A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
clmax = base["CL_max_est"] * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]      # the lattice run uses a thin section; scale to the SD7062 now on the wing
now = dict(mass=round(m), cg=round(cg, 1), np=-base["neutral_point_mm_behind_datum"], margin=base["static_margin_pct"], hover_worst=round(float(r.x[3]), 3),
           hover=dict(F=round(float(r.x[0]), 3), M=round(float(r.x[1]), 3), R=round(float(r.x[2]), 3)), stall=round(float(np.sqrt(2 * m / 1000 * 9.81 / (1.225 * base["s_ref_m2"] * clmax))), 1),
           thrust_g=dict(lift=cap[0], nozzle_down=round(cap[1]), roll_pair=cap[2]), ideal_equal_load=round(m / cap.sum(), 3))
first = dict(mass=1892, cg=-82.0, margin=-23.6, hover_worst=0.736, stall=13.5)                        # first layout, with the lift fan as then modelled
changes = [["Lift fan", "140 mm, 7 fine blades, moved 80 mm forward", "more thrust within the motor's current limit; longer arm ahead of the balance point"],
           ["Wide centre body", "70 mm longer at the front", "room for the larger fan; costs stability, because a wide flat forebody lifts"],
           ["Wing and roll motors", "75 mm aft, SD7062 section", "moves the point where lift acts aft; lower stall speed"],
           ["Spar", "30 mm aft, 600 mm long, crosses the main fan inlet", "the fan duct blocks any position further aft"],
           ["Battery", "68 mm forward, directly behind the lift fan", "balance"],
           ["Speed controllers, flight controller, receiver", "into the nose, under a lift-off canopy", "the only move that made the as-drawn aircraft stable"],
           ["Tailplane", "unchanged", "it sits in the wing's wake: 40% more area moved the lift point 2 mm"]]
json.dump(dict(now=now, first=first, changes=changes), open(os.path.join(site, "current.json"), "w"), indent=1); print(now)
