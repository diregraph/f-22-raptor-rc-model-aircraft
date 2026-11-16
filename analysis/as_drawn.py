"""Scorecard for the aircraft exactly as drawn in the CAD and the twin. Run after `node` has exported analysis/parts.json and
after baseline_aero.py. Writes site/analysis/current.json."""
import json, os, numpy as np
from scipy.optimize import linprog
import baseline_aero as B
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P = B._P; D = P["D"]; fans = json.load(open(os.path.join(site, "fans.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
base = json.load(open(os.path.join(here, "baseline_aero.json")))
m = sum(p["mass"] for p in P["parts"]); cg = sum(p["mass"] * p["cg"][0] for p in P["parts"]) / m
T = {t["id"]: t for t in P["thrusters"]}                     # thrust caps come from site/js/spec.js now: the lift fan on its
cap = np.array([T["F"]["maxG"], T["M"]["maxG"] * 0.85, T["L"]["maxG"] + T["R"]["maxG"]], float)   # 1,500 KV motor, the roll pair on 5 in propellers
arms = np.array([D["fanX"] - cg, -403.5 - cg, D["rollX"] - cg])
r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0], A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
clmax = base["CL_max_est"] * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]      # the lattice run uses a thin section; scale to the SD7062 now on the wing
npx = -base["neutral_point_mm_behind_datum"]                 # the lattice run's own margin is for whatever balance point it was run at
now = dict(mass=round(m), cg=round(cg, 1), np=npx, margin=round((cg - npx) / 240.0 * 100, 1), hover_worst=round(float(r.x[3]), 3),
           hover=dict(F=round(float(r.x[0]), 3), M=round(float(r.x[1]), 3), R=round(float(r.x[2]), 3)), stall=round(float(np.sqrt(2 * m / 1000 * 9.81 / (1.225 * base["s_ref_m2"] * clmax))), 1),
           thrust_g=dict(lift=cap[0], nozzle_down=round(cap[1]), roll_pair=cap[2]), ideal_equal_load=round(m / cap.sum(), 3))
first = dict(mass=1892, cg=-82.0, margin=-23.6, hover_worst=0.736, stall=13.5)                        # first layout, with the lift fan as then modelled
changes = [["Roll motors and propellers", "5 in propellers in 137 mm ducts, 44 mm forward of the spar", "the pair makes 1,646 g instead of 816 g, which is what brings the hardest-working fan under 60%"],
           ["Lift-fan motor", "2807 size, about 1,500 KV", "the fan is torque-limited at 35 A, so a lower KV gives 1,344 g instead of 1,206 g"],
           ["Landing gear", "three retractable legs in place of two tall skids", "nothing in the airflow; 36 g of servos is the price"],
           ["Wiring", "25 separate runs in two belly raceways, a connector at each end", "honest mass is 132 g, not the 45 g the first draft assumed"],
           ["Speed controllers", "three of the four beside the battery, under the hatch", "shorter motor runs and a balance point the battery can still trim"],
           ["Tailplane", "1.5x area", "trim at 18 m/s took 19.5 of the 25 degrees available, leaving nothing for manoeuvre"],
           ["Tubes", "8 x 1 mm carbon in place of 8 mm aluminium", "24 g, and stiffer"],
           ["Battery", "4-cell 2,700 mAh", "2,200 mAh met every target but hover time; 3,300 mAh is too heavy for the fan margin"]]
json.dump(dict(now=now, first=first, changes=changes), open(os.path.join(site, "current.json"), "w"), indent=1); print(now)
