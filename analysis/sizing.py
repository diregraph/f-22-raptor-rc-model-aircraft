"""Sizing study: where must the mass go, and how big must the tail be, for the aircraft to both hover with margin and
fly stably on its wing?  Run: python3 analysis/sizing.py   (writes site/analysis/sizing.json for the live site)
Method: vortex-lattice (AeroSandbox) gives the neutral point for a small grid of tail and wing sizes; everything else is
mass-and-moment algebra, so the design space can be searched exhaustively instead of trusted to a single optimiser run."""
import json, os, itertools, numpy as np, aerosandbox as asb, neuralfoil as nf
from scipy.optimize import linprog
import baseline_aero as B
here = os.path.dirname(os.path.abspath(__file__)); P = json.load(open(os.path.join(here, "parts.json")))
parts = {p["id"]: p for p in P["parts"]}
_f = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "analysis", "fans.json")))
# g of vertical thrust available, from the fan model (analysis/fan_bem.py): lift fan, nozzle at 90 deg (15% bend loss), roll pair (open propellers, still a guess)
TMAX = {"F": float(_f["lift"]["at_current_limit"]["expected_g"]), "M": _f["main"]["at_current_limit"]["expected_g"] * 0.85, "R": 1000.0}
X_NOZ, X_ROLL = -403.5, -108.0
POWER = ["battery", "escF", "escM", "escL", "escR", "esp32", "rx", "ubec", "imu", "batteryTray", "fcSled"]   # moves as one pack
FAN = ["motorF", "liftRotor", "liftRing", "fanSpider"]

WINGPARTS = ["wingInL", "wingInR", "wingOutL", "wingOutR", "spar", "sparCarrier", "motorL", "motorR", "podL", "podR", "propL", "propR"]
def mass_cg(xb, fan_x, tail_scale, wing_dx):
    m = mx = 0.0
    for p in P["parts"]:
        x, w = p["cg"][0], p["mass"]
        if p["id"] in POWER: x += xb - parts["battery"]["cg"][0]
        if p["id"] in FAN: x += fan_x - 130.0
        if p["id"].startswith("stab") and "Servo" not in p["id"]: w *= tail_scale
        if p["id"] in WINGPARTS: x -= wing_dx
        m += w; mx += w * x
    return m, mx / m

def hover(m, cg, fan_x, wing_dx=0.0):
    """Smallest possible 'worst fan load' that lifts the weight with zero pitching moment (a tiny linear programme)."""
    arms = np.array([fan_x - cg, X_NOZ - cg, X_ROLL - wing_dx - cg]); cap = np.array([TMAX["F"], TMAX["M"], TMAX["R"]])
    # variables: fF, fM, fR, t ; minimise t ; f_i <= t
    r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0],
                A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
    return (None, None) if not r.success else (r.x[3], dict(zip("FMR", np.round(r.x[:3], 3))))

def neutral_points():
    out = {}
    for ts, ws in itertools.product((1.0, 1.25, 1.5), (0.0, 50.0, 100.0)):
        ap = B.airplane(tail_scale=ts, wing_dx=ws / 1000); a0, a1 = B.vlm(ap, 0.0), B.vlm(ap, 4.0)
        cla = (a1["CL"] - a0["CL"]) / 4; cma = (a1["Cm"] - a0["Cm"]) / 4
        out[(ts, ws)] = dict(np=-(B.CG_X - cma / cla * ap.c_ref) * 1000, cla=float(cla), s=ap.s_ref)   # spec axes: +x forward
        print("tail x%.2f wing %.0f mm aft  neutral point %.0f mm (spec x), CL/deg %.4f" % (ts, ws, out[(ts, ws)]["np"], cla), flush=True)
    return out

def clmax_2d(name, re=240e3):
    a = np.linspace(0, 16, 33); r = nf.get_aero_from_airfoil(asb.Airfoil(name), alpha=a, Re=re, model_size="large")
    i = int(np.argmax(r["CL"])); j = int(np.argmax(r["CL"] / r["CD"]))
    return dict(clmax=float(r["CL"][i]), alpha_stall=float(a[i]), ld_max=float((r["CL"] / r["CD"])[j]), cm=float(r["CM"][8]))

if __name__ == "__main__":
    NP = neutral_points(); C_REF = 240.0
    foils = {n: clmax_2d(n) for n in ("naca2408", "naca4410", "clarky", "sd7062", "s1223")}
    base_cl = json.load(open(os.path.join(here, "baseline_aero.json")))["CL_max_est"]
    DX = (0.0, 50.0, 100.0)
    def evaluate(xb, fan_x, ts, dx, foil="naca2408"):
        m, cg = mass_cg(xb, fan_x, ts, dx)
        t = np.interp(ts, (1.0, 1.25, 1.5), [np.interp(dx, DX, [NP[(k, d)]["np"] for d in DX]) for k in (1.0, 1.25, 1.5)])     # neutral point, interpolated
        worst, share = hover(m, cg, fan_x, dx)
        clmax = base_cl * foils[foil]["clmax"] / foils["naca2408"]["clmax"]
        return dict(xb=xb, fan_x=fan_x, tail=ts, wing_dx=dx, foil=foil, mass=round(m), cg=round(cg, 1), np=round(float(t), 1), margin=round((cg - float(t)) / C_REF * 100, 1),
                    hover_worst=None if worst is None else round(float(worst), 3), hover=None if share is None else {k: float(v) for k, v in share.items()},
                    stall=round(float(np.sqrt(2 * m / 1000 * 9.81 / (1.225 * NP[(1.0, 0.0)]["s"] * clmax))), 1))
    base = evaluate(-52, 130, 1.0, 0.0)
    sweep = [evaluate(xb, 130, 1.0, 0.0) for xb in range(-60, 341, 20)]                                   # the central trade, one variable at a time
    sweep_tail = [evaluate(xb, 130, 1.5, 100.0) for xb in range(-60, 341, 20)]
    clear = lambda c: abs(c["xb"] - c["fan_x"]) > 136                                                      # the battery cannot sit in the lift-fan duct
    cands = [evaluate(xb, fx, ts, dx, "sd7062") for xb in range(-60, 341, 10) for fx in (110, 130, 150, 170, 190, 210) for ts in (1.0, 1.25, 1.5) for dx in (0.0, 25.0, 50.0, 75.0, 100.0)]
    ok = [c for c in cands if c["hover_worst"] is not None and 5.0 <= c["margin"] <= 12.0 and clear(c)]
    ok.sort(key=lambda c: c["hover_worst"] + 0.03 * (c["tail"] - 1) + 0.0003 * c["wing_dx"] + 0.0002 * abs(c["fan_x"] - 130))  # small penalties: prefer the least change to the outline
    best = ok[0] if ok else None
    print("baseline", base); print("feasible designs:", len(ok)); print("best", best)
    for c in ok[:6]: print("  ", c)
    out = dict(base=base, best=best, top=ok[:12], sweep=sweep, sweep_tail=sweep_tail, foils=foils, tmax=TMAX,
               neutral_points=[dict(tail=k[0], wing_dx=k[1], **{a: round(b, 4) for a, b in v.items()}) for k, v in NP.items()])
    os.makedirs(os.path.join(here, "..", "site", "analysis"), exist_ok=True)
    json.dump(out, open(os.path.join(here, "..", "site", "analysis", "sizing.json"), "w"), indent=1)
