"""Baseline aerodynamics of the current airframe. Run: python3 analysis/baseline_aero.py
Tool: AeroSandbox (vortex-lattice for lift and stability, AeroBuildup for drag). Geometry mirrors site/js/spec.js.
Aircraft axes here follow AeroSandbox: x aft, y right, z up, metres. Datum x = 0 is the spec datum (spec +X is forward)."""
import json, numpy as np, aerosandbox as asb
tan = lambda d: np.tan(np.radians(d))
MASS, CG_X = 1.892, 0.082               # kg; balance point 82 mm behind the datum
W = dict(root_z=.108, tip_z=.345, root_le=-.070, root_c=.300, tip_c=.095, sweep=34)
S = dict(root_z=.110, tip_z=.217, root_le=.328, root_c=.160, tip_c=.062, sweep=34)
F = dict(root_le=.218, root_c=.165, tip_c=.062, h=.155, sweep=42, cant=25, y=.095, z0=.013)
BODY = dict(le=-.230, te=.260, half_w=.108)   # the flat centre body between the wing roots carries lift too

def airplane(wing_af="naca2408", incidence=0.0, tail_deflect=0.0):
    af, sym = asb.Airfoil(wing_af), asb.Airfoil("naca0008")
    le_tip = W["root_le"] + (W["tip_z"] - W["root_z"]) * tan(W["sweep"])
    wing = asb.Wing(name="wing", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[BODY["le"], 0, 0], chord=BODY["te"] - BODY["le"], airfoil=sym),
        asb.WingXSec(xyz_le=[BODY["le"] + .06, BODY["half_w"] - .012, 0], chord=BODY["te"] - BODY["le"] - .06, airfoil=sym),
        asb.WingXSec(xyz_le=[W["root_le"], W["root_z"], 0], chord=W["root_c"], twist=incidence, airfoil=af),
        asb.WingXSec(xyz_le=[le_tip, W["tip_z"], 0], chord=W["tip_c"], twist=incidence, airfoil=af)])
    sle = S["root_le"] + (S["tip_z"] - S["root_z"]) * tan(S["sweep"])
    tail = asb.Wing(name="tail", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[S["root_le"], S["root_z"], 0], chord=S["root_c"], twist=tail_deflect, airfoil=sym),
        asb.WingXSec(xyz_le=[sle, S["tip_z"], 0], chord=S["tip_c"], twist=tail_deflect, airfoil=sym)])
    c = np.radians(F["cant"])
    fin = asb.Wing(name="fins", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[F["root_le"], F["y"], F["z0"]], chord=F["root_c"], airfoil=sym),
        asb.WingXSec(xyz_le=[F["root_le"] + F["h"] * tan(F["sweep"]), F["y"] + F["h"] * np.sin(c), F["z0"] + F["h"] * np.cos(c)], chord=F["tip_c"], airfoil=sym)])
    s_ref = 2 * (W["root_c"] + W["tip_c"]) / 2 * (W["tip_z"] - W["root_z"]) + W["root_c"] * 2 * W["root_z"]     # exposed wing + the body strip between the roots (the usual reference area)
    return asb.Airplane(name="F-35B model", xyz_ref=[CG_X, 0, 0], wings=[wing, tail, fin], s_ref=s_ref, c_ref=0.24, b_ref=2 * W["tip_z"])

def vlm(ap, alpha, v=18.0):
    return asb.VortexLatticeMethod(ap, asb.OperatingPoint(velocity=v, alpha=alpha), spanwise_resolution=6, chordwise_resolution=6).run()

if __name__ == "__main__":
    ap = airplane(); out = {"s_ref_m2": round(ap.s_ref, 4), "span_m": ap.b_ref, "aspect_ratio": round(ap.b_ref ** 2 / ap.s_ref, 2), "wing_loading_g_dm2": round(MASS * 1000 / (ap.s_ref * 100), 1)}
    a0, a1 = vlm(ap, 0.0), vlm(ap, 4.0)
    cla = (a1["CL"] - a0["CL"]) / 4; cma = (a1["Cm"] - a0["Cm"]) / 4
    xnp = CG_X - cma / cla * ap.c_ref                     # neutral point: where the lift change acts
    out.update(CL_per_deg=round(cla, 4), neutral_point_mm_behind_datum=round(xnp * 1000), static_margin_pct=round(-cma / cla * 100, 1))
    ab = {a: asb.AeroBuildup(ap, asb.OperatingPoint(velocity=18.0, alpha=a)).run() for a in range(-2, 15)}
    clmax = max(float(np.ravel(r["CL"])[0]) for r in ab.values())
    best = max(ab, key=lambda a: float(np.ravel(ab[a]["CL"])[0]) / float(np.ravel(ab[a]["CD"])[0]))
    out.update(CL_max_est=round(clmax, 2), stall_speed_m_s=round(float(np.sqrt(2 * MASS * 9.81 / (1.225 * ap.s_ref * clmax))), 1),
               best_L_over_D=round(float(np.ravel(ab[best]["CL"])[0] / np.ravel(ab[best]["CD"])[0]), 1), alpha_best_deg=best)
    for v in (14, 18, 24):
        cl = 2 * MASS * 9.81 / (1.225 * v * v * ap.s_ref); a = (cl - a0["CL"]) / cla
        r = asb.AeroBuildup(ap, asb.OperatingPoint(velocity=v, alpha=a)).run(); d = float(np.ravel(r["D"])[0])
        out[f"cruise_{v}ms"] = {"CL": round(cl, 2), "alpha_deg": round(float(a), 1), "drag_N": round(d, 2), "thrust_power_W": round(d * v, 0)}
    print(json.dumps(out, indent=1)); json.dump(out, open(__file__.replace(".py", ".json"), "w"), indent=1)
