"""Skeleton airframe study: off-the-shelf aluminium tubes joined by printed PETG nodes, a thin LW-PLA skin over them.

1. Ground structure: every tube that could fit inside the body without crossing the lift fan, the battery, the main fan or the
   nozzle. A 3D frame model (6 degrees of freedom per joint) under six load cases with inertia relief.
2. Generative layout: topology optimisation of the tube areas (optimality criteria, all load cases at once) removes the tubes
   that carry little, then each survivor gets the lightest tube from the shop list that meets strength, buckling and stiffness.
3. Weight: the whole aircraft is re-weighed with the skeleton, nodes, isolated bays, thin skin, crash zones and the FPV
   (first-person view) head-tracking camera, and scored with the same rules as analysis/as_drawn.py.

Run: python3 analysis/skeleton.py   (about a minute; writes site/analysis/skeleton.json, used by site/skeleton.html)
"""
import json, os, math, itertools, numpy as np
from scipy.optimize import linprog
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site", "analysis")
P = json.load(open(os.path.join(here, "parts.json"))); D = P["D"]
G = 9.81e-3                                                                            # N per gram
# ------------------------------------------------------------------ tube catalogue (assumed stock; confirm with the owner)
AL = dict(E=69000.0, G=26000.0, rho=2.70e-3, fy=145.0, name="6063-T5")                # local extrusions are mostly 6063; 6061-T6 would be 240 MPa
def round_tube(d, t): A = math.pi * (d * d - (d - 2 * t) ** 2) / 4; I = math.pi * (d ** 4 - (d - 2 * t) ** 4) / 64; return dict(A=A, I=I, J=2 * I, c=d / 2, d=d, t=t)
def sq_tube(b, t): A = b * b - (b - 2 * t) ** 2; I = (b ** 4 - (b - 2 * t) ** 4) / 12; return dict(A=A, I=I, J=2 * I * 0.84, c=b / 2 * 1.414, d=b, t=t)
SHOP = {"6 x 1 round": round_tube(6, 1), "8 x 1 round": round_tube(8, 1), "10 x 1 round": round_tube(10, 1), "12 x 1 round": round_tube(12, 1),
        "10 x 10 x 1 square": sq_tube(10, 1), "12 x 12 x 1 square": sq_tube(12, 1)}
for k, s in SHOP.items(): s["g_per_m"] = round(s["A"] * AL["rho"] * 1000, 1); s["name"] = k
ROUND = [k for k in SHOP if "round" in k]
# ------------------------------------------------------------------ body sections (cad/build.py MID / NOSE): x, chine, top, bottom, y_top, y_bot
MID = [(-430, 106, 101, 88, 15, -21), (-260, 108, 98, 72, 25, -37), (-170, 108, 88, 76, 30, -42), (30, 108, 90, 80, 36, -46), (130, 108, 90, 80, 38, -46), (300, 108, 88, 78, 38, -46),
       (370, 72, 36, 44, 38, -43), (440, 58, 27, 34, 31, -37), (500, 42, 17, 23, 21, -28)]
def sec(x):
    for a, b in zip(MID, MID[1:]):
        if a[0] <= x <= b[0]: f = (x - a[0]) / (b[0] - a[0]); return [a[i] + f * (b[i] - a[i]) for i in range(6)]
    return list(MID[0] if x < MID[0][0] else MID[-1])
# ------------------------------------------------------------------ candidate joints. Stations sit where loads come in.
ST = {"nose": 440, "fanF": 291, "fanA": 129, "bay": 30, "gear": -100, "spar": -160, "duct": -260, "tail": -400}
def joints():
    J = {}
    for s, x in ST.items():
        _, w, tw, bw, yt, yb = sec(x)
        if s == "nose": J["nose_C"] = (x, 0, 0); J["nose_K"] = (x, yb + 8, 0); continue
        zc = 92 if s != "tail" else 96; yc = -9 if s == "spar" else 0; J[f"{s}_CL"], J[f"{s}_CR"] = (x, yc, -zc), (x, yc, zc)                       # chine line: today's longerons
        J[f"{s}_BL"], J[f"{s}_BR"] = (x, yb + 8, -(bw - 12)), (x, yb + 8, bw - 12)                                # belly corners
        if s in ("bay", "gear", "spar"): J[f"{s}_K"] = (x, yb + 8, 0)                                             # keel under the battery
        if s in ("fanF", "fanA", "duct", "tail"): J[f"{s}_TL"], J[f"{s}_TR"] = (x, yt - 10, -(tw - 30)), (x, yt - 10, tw - 30)   # upper corners, clear of the hatch
    for z, n in ((193, "pod"), (300, "tip")): J[f"spar_{n}L"], J[f"spar_{n}R"] = (-160, -9, -z), (-160, -9, z)
    J["spar_S"] = (-160, -9, 0)
    return J
# keep-out boxes (x0, x1, y0, y1, z0, z1): nothing may cross these
KEEP = {"lift fan duct": (129 + 2, 291 - 2, -60, 45, -84, 84), "battery and hatch": (-75, 95, -24, 60, -40, 40),
        "main fan and duct": (-250, -165, -40, 45, -48, 48), "nozzle swing": (-480, -265, -150, 40, -55, 55), "nose bay": (344, 414, -14, 30, -28, 28)}
def crosses(p, q, box, n=40):
    for t in np.linspace(0.04, 0.96, n):
        x, y, z = p + t * (q - p)
        if box[0] < x < box[1] and box[2] < y < box[3] and box[4] < z < box[5]: return True
    return False
def candidates(J):
    names = list(J); order = list(ST)
    st = lambda n: n.split("_")[0]
    E = []
    for a, b in itertools.combinations(names, 2):
        sa, sb = st(a), st(b)
        if abs(order.index(sa) - order.index(sb)) > 1: continue                          # only within a station or to the next one
        p, q = np.array(J[a], float), np.array(J[b], float)
        if np.linalg.norm(q - p) < 20: continue
        if any(crosses(p, q, bx) for bx in KEEP.values()): continue
        if sa == "spar" and sb == "spar" and abs(p[1] - q[1]) < 1 and abs(p[0] - q[0]) < 1:
            line = ["spar_tipL", "spar_podL", "spar_CL", "spar_S", "spar_CR", "spar_podR", "spar_tipR"]      # the spar: one tube, split at each joint
            if a in line and b in line and abs(line.index(a) - line.index(b)) == 1: E.append((a, b))
            continue
        if (a.startswith("spar_pod") or a.startswith("spar_tip") or b.startswith("spar_pod") or b.startswith("spar_tip")): continue   # wing joints only on the spar line
        E.append((a, b))
    return E
# ------------------------------------------------------------------ 3D frame element
def k_frame(p, q, E, Gs, A, Iy, Iz, J):
    L = np.linalg.norm(q - p); ex = (q - p) / L
    ref = np.array([0, 1.0, 0]) if abs(ex[1]) < 0.9 else np.array([1.0, 0, 0])
    ez = np.cross(ex, ref); ez /= np.linalg.norm(ez); ey = np.cross(ez, ex)
    R3 = np.vstack([ex, ey, ez]); T = np.kron(np.eye(4), R3)
    k = np.zeros((12, 12)); EA, GJ = E * A / L, Gs * J / L
    k[0, 0] = k[6, 6] = EA; k[0, 6] = k[6, 0] = -EA; k[3, 3] = k[9, 9] = GJ; k[3, 9] = k[9, 3] = -GJ
    for (v, th, I, s) in ((1, 5, Iz, 1), (2, 4, Iy, -1)):
        a, b, c = 12 * E * I / L ** 3, 6 * E * I / L ** 2, E * I / L
        idx = [v, th, v + 6, th + 6]
        m = np.array([[a, s * b, -a, s * b], [s * b, 4 * c, -s * b, 2 * c], [-a, -s * b, a, -s * b], [s * b, 2 * c, -s * b, 4 * c]])
        for i in range(4):
            for j in range(4): k[idx[i], idx[j]] += m[i, j]
    return T.T @ k @ T, T, L
class Frame:
    def __init__(self, J, E, extra_nodes):
        self.names = list(J) + list(extra_nodes); self.X = np.array([J[n] if n in J else extra_nodes[n] for n in self.names], float)
        self.ix = {n: i for i, n in enumerate(self.names)}; self.E = E
    def solve(self, sec_of_edge, links, F):
        n = len(self.names); K = np.zeros((6 * n, 6 * n)); cache = []
        for e, (a, b) in enumerate(self.E):
            s = sec_of_edge[e]; i, j = self.ix[a], self.ix[b]
            k, T, L = k_frame(self.X[i], self.X[j], AL["E"], AL["G"], s["A"], s["I"], s["I"], s["J"])
            d = np.r_[6 * i:6 * i + 6, 6 * j:6 * j + 6]; K[np.ix_(d, d)] += k; cache.append((d, k, T, L))
        for (a, b) in links:                                                            # rigid links: load point to its mounting joints
            i, j = self.ix[a], self.ix[b]; k, _, _ = k_frame(self.X[i], self.X[j], 2e6, 8e5, 400.0, 4e4, 4e4, 8e4)
            d = np.r_[6 * i:6 * i + 6, 6 * j:6 * j + 6]; K[np.ix_(d, d)] += k
        # 3-2-1 support on three joints (inertia relief makes the reactions ~0)
        fix = [6 * self.ix["spar_CL"] + 0, 6 * self.ix["spar_CL"] + 1, 6 * self.ix["spar_CL"] + 2, 6 * self.ix["spar_CR"] + 0, 6 * self.ix["spar_CR"] + 1, 6 * self.ix["bay_CL"] + 1]
        free = np.setdiff1d(np.arange(6 * n), fix)
        dg = np.diag(K).copy(); lone = np.where(dg < 1e-12)[0]; K[lone, lone] = 1.0                    # joints whose tubes were all removed
        U = np.zeros((6 * n, F.shape[1])); U[free] = np.linalg.solve(K[np.ix_(free, free)], F[free])
        return U, cache
# ------------------------------------------------------------------ masses and loads
def nearest(J, pt, k=2, only=None):
    names = [n for n in J if (only is None or any(n.startswith(o) for o in only))]
    d = np.array([np.linalg.norm(np.array(J[n]) - pt) for n in names]); o = np.argsort(d)[:k]
    w = 1 / (d[o] + 30.0); w /= w.sum(); return [(names[i], w[j]) for j, i in enumerate(o)]
PRIMARY = ("nose_C",) + tuple(f"{s}_C" for s in ST) + ("spar_",)     # always kept, so every mass has a load path
def mass_points(J, parts):
    m = {n: 0.0 for n in J}
    for p in parts:
        for n, w in nearest(J, np.array(p["cg"], float), only=PRIMARY): m[n] += p["mass"] * w
    return m
def build_loads(fr, J, mass, hover):
    T = {t["id"]: t for t in P["thrusters"]}; n = len(fr.names); idx = fr.ix
    M = np.array([mass.get(nm, 0.0) for nm in fr.names]); mt = M.sum(); cg = (M[:, None] * fr.X).sum(0) / mt
    Ivec = fr.X - cg; Iten = sum(M[i] * (np.dot(r, r) * np.eye(3) - np.outer(r, r)) for i, r in enumerate(Ivec)) + np.eye(3) * 1e3
    def case(applied):     # applied: list of (node, force vector N); gravity added; inertia relief balances the rest
        F = np.zeros(6 * n); tot = np.zeros(3); mom = np.zeros(3)
        for nm, f in applied: i = idx[nm]; F[6 * i:6 * i + 3] += f; tot += f; mom += np.cross(fr.X[i] - cg, f)
        for i in range(n): g = np.array([0, -M[i] * G, 0]); F[6 * i:6 * i + 3] += g; tot += g
        a = tot / mt; al = np.linalg.solve(Iten, mom)
        for i in range(n): F[6 * i:6 * i + 3] -= M[i] * (a + np.cross(al, fr.X[i] - cg))
        return F, a / G * 1e-3
    cap = {k: T[k]["maxG"] * (0.85 if k == "M" else 1) for k in T}
    h = {k: hover[{"L": "R", "R": "R"}.get(k, k)] * cap[k] * G for k in cap}
    up = np.array([0, 1.0, 0]); cases = {}
    cases["hover, 1.5 g gust"] = case([(f"T_{k}", up * h[k] * 1.5) for k in "FMLR"])
    cases["hover, full roll command"] = case([("T_F", up * h["F"]), ("T_M", up * h["M"]), ("T_L", up * cap["L"] * G * 0.95), ("T_R", up * cap["R"] * G * 0.25)])
    W = mt * G; nose_share = 0.25
    cases["landing, 4 g on three legs"] = case([("G_N", up * 4 * W * nose_share), ("G_ML", up * 4 * W * (1 - nose_share) / 2), ("G_MR", up * 4 * W * (1 - nose_share) / 2)])
    cases["landing, one main leg, 2.5 g + side load"] = case([("G_MR", np.array([0, 2.5, -0.6]) * W)])
    lift = 4 * W * 1.05; span = [("spar_CL", .2), ("spar_CR", .2), ("spar_podL", .17), ("spar_podR", .17), ("spar_tipL", .08), ("spar_tipR", .08), ("spar_S", .10)]
    cases["pull-up, 4 g"] = case([(nm, up * lift * f) for nm, f in span] + [("S_L", -up * 0.025 * lift), ("S_R", -up * 0.025 * lift)])
    cases["nose strike, 15 g (crash zone limits it)"] = case([("nose_C", np.array([-15.0, -3.0, 2.0]) * W)])
    return cases, mt, cg
# ------------------------------------------------------------------ evaluation of one layout
def evaluate(fr, edges_on, secs, cases):
    E_all = fr.E; sub = [e for e in range(len(E_all)) if edges_on[e]]
    fr2 = Frame.__new__(Frame); fr2.names, fr2.X, fr2.ix = fr.names, fr.X, fr.ix; fr2.E = [E_all[e] for e in sub]
    F = np.stack([c[0] for c in cases.values()], 1)
    U, cache = fr2.solve([secs[e] for e in sub], LINKS, F)
    res = []
    for k, e in enumerate(sub):
        d, kk, T, L = cache[k]; s = secs[e]
        f = (T @ (kk @ U[d])); N = np.abs(f[0]); Mb = np.maximum(np.hypot(f[4], f[5]), np.hypot(f[10], f[11])); Tq = np.abs(f[3])
        sig = N / s["A"] + Mb * s["c"] / s["I"] + 0 * Tq; comp = np.maximum(-f[6], f[0]) * 0 + np.maximum(f[0], 0)
        Pcr = math.pi ** 2 * AL["E"] * s["I"] / L ** 2
        res.append(dict(fg=kk @ U[d], e=e, L=L, sig=float(sig.max()), N=float(N.max()), comp=float(np.max(np.maximum(f[0], 0))), Pcr=Pcr, energy=float(np.sum(U[d] * (kk @ U[d])))))
    return U, res
def twist(fr, U, a, b):     # relative rotation (deg) between two joints, worst case
    i, j = fr.ix[a], fr.ix[b]; r = U[6 * i + 3:6 * i + 6] - U[6 * j + 3:6 * j + 6]
    return float(np.degrees(np.linalg.norm(r, axis=0)).max())
def defl(fr, U, a, b):
    i, j = fr.ix[a], fr.ix[b]; r = U[6 * i:6 * i + 3] - U[6 * j:6 * j + 3]; return float(np.linalg.norm(r, axis=0).max())
# ------------------------------------------------------------------ main study
NODE_STUDY = "spar_CL"; LINKS = []; FLIGHT = [0, 1, 4]; TWIST_MAX = 1.5      # load cases in flight; fan-to-nozzle thrust-line twist limit, degrees
def study():
    global LINKS
    J = joints(); E = candidates(J)
    T = {t["id"]: t for t in P["thrusters"]}
    extra = {"T_F": T["F"]["pos"], "T_M": T["M"]["pos"], "T_L": T["L"]["pos"], "T_R": T["R"]["pos"],
             "G_N": (D["gear"]["noseX"], D["groundY"], 0), "G_ML": (-121, D["groundY"], -D["gear"]["footZ"]), "G_MR": (-83, D["groundY"], D["gear"]["footZ"]),
             "S_L": (-400, -9, -156), "S_R": (-400, -9, 156)}
    LINKS = [("T_F", n) for n in ("fanF_CL", "fanF_CR", "fanA_CL", "fanA_CR")] + [("T_M", n) for n in ("duct_CL", "duct_CR", "duct_BL", "duct_BR", "spar_CL", "spar_CR")] + \
            [("T_L", "spar_podL"), ("T_R", "spar_podR"), ("G_N", "nose_K"), ("G_N", "nose_C"), ("G_ML", "gear_BL"), ("G_ML", "gear_CL"), ("G_MR", "gear_BR"), ("G_MR", "gear_CR"),
             ("S_L", "tail_CL"), ("S_R", "tail_CR")]
    fr = Frame(J, E, extra)
    keep = [p for p in P["parts"] if p["group"] != "Backbone"]
    mass = mass_points(J, keep + [dict(mass=200, cg=[-60, 0, 0])])                      # + an allowance for the skeleton itself
    cur = json.load(open(os.path.join(site, "current.json")))["now"]
    cases, mt, cg = build_loads(fr, J, mass, cur["hover"])
    must = set()                                                                       # spar and today's longerons stay: the wing and the roll motors hang on them
    for e, (a, b) in enumerate(E):
        if a.startswith("spar_") and b.startswith("spar_") and abs(J[a][0] - J[b][0]) < 1 and abs(J[a][1] - J[b][1]) < 1: must.add(e)
        if a[-2:] in ("CL", "CR") and a[-2:] == b[-2:]: must.add(e)                         # the chine longerons (today's tubes) stay
        if (a, b) == ("nose_C", "nose_K") or (a == "nose_K" and b in ("fanF_BL", "fanF_BR")): must.add(e)   # the nose keel: the only way past the nose bay
    # ---- 1. topology optimisation of tube areas (8 x 1 round geometry, scaled wall), compliance at fixed volume
    base = SHOP["8 x 1 round"]; nE = len(E); Lm = np.array([np.linalg.norm(np.array(J[a]) - np.array(J[b])) for a, b in E])
    x = np.full(nE, 0.5); vol_budget = 0.22 * Lm.sum(); hist = []
    for it in range(45):
        secs = [dict(A=base["A"] * xi, I=base["I"] * xi, J=base["J"] * xi, c=base["c"]) for xi in np.maximum(x, 1e-3)]
        U, res = evaluate(fr, np.ones(nE, bool), secs, cases)
        sens = np.array([r["energy"] for r in res]) / np.maximum(x, 1e-3)                # d(compliance)/dx, summed over load cases
        hist.append(float(sum(r["energy"] for r in res)))
        l1, l2 = 1e-12, 1e12
        while l2 / l1 > 1.0005:
            lm = math.sqrt(l1 * l2); xn = np.clip(x * np.sqrt(np.maximum(sens, 1e-30) / (lm * Lm)), np.maximum(x - 0.25, 1e-3), np.minimum(x + 0.25, 1.0))
            xn[list(must)] = np.maximum(xn[list(must)], 0.5)
            l1, l2 = (lm, l2) if (xn * Lm).sum() > vol_budget else (l1, lm)
        x = xn
    # ---- 2. discrete sizing from the shop list (round tubes): strength SF 1.5 on yield, Euler buckling SF 2, then greedy removal
    def size_it(on):
        size = {e: ("8 x 1 round" if e in must and "spar" in E[e][0] + E[e][1] else "6 x 1 round") for e in range(nE)}
        for _ in range(10):
            U, res = evaluate(fr, on, [SHOP[size[e]] for e in range(nE)], cases); changed = False
            for r in res:
                e = r["e"]
                if not (r["sig"] * 1.5 <= AL["fy"] and r["comp"] * 2 <= r["Pcr"]):
                    i = ROUND.index(size[e])
                    if i + 1 < len(ROUND): size[e] = ROUND[i + 1]; changed = True
            if not changed: break
        ok = all(r["sig"] * 1.5 <= AL["fy"] and r["comp"] * 2 <= r["Pcr"] for r in res)
        tw = twist(fr, U[:, FLIGHT], "fanF_CL", "duct_CL"); ok = ok and tw <= TWIST_MAX and np.isfinite(U).all() and np.abs(U).max() < 50
        use = {}
        for r in res:
            a, b = E[r["e"]]; use[a] = use.get(a, 0) + 1; use[b] = use.get(b, 0) + 1
        g = sum(r["L"] * SHOP[size[r["e"]]]["A"] * AL["rho"] for r in res) + sum(node_mass(k, 2) for k in use.values())
        return ok, g, size, U, res
    on = (x > 0.05); on[list(must)] = True
    ok, g, size, U, res = size_it(on); log = [dict(step="topology result", tubes=int(on.sum()), g=round(g, 1), ok=bool(ok))]
    improved = True
    while improved:
        improved = False
        for e in sorted(np.where(on)[0], key=lambda e: x[e]):
            if e in must: continue
            trial = on.copy(); trial[e] = False
            ok2, g2, s2, U2, r2 = size_it(trial)
            if ok2 and g2 < g - 0.05: on, ok, g, size, U, res = trial, ok2, g2, s2, U2, r2; improved = True; log.append(dict(step=f"removed {E[e][0]}-{E[e][1]}", tubes=int(on.sum()), g=round(g, 1), ok=bool(ok)))
    stiff = dict(fan_to_nozzle_twist_deg=round(twist(fr, U[:, FLIGHT], "fanF_CL", "duct_CL"), 2), wing_root_twist_deg=round(twist(fr, U[:, FLIGHT], "spar_podL", "spar_podR"), 2),
                 fan_to_nozzle_defl_mm=round(defl(fr, U[:, FLIGHT], "T_F", "T_M"), 2), worst_sf=round(min(AL["fy"] / r["sig"] for r in res), 2), ok=bool(ok), cases_ok=True)
    tubes = []
    for r in res:
        e = r["e"]; a, b = E[e]; s = SHOP[size[e]]
        tubes.append(dict(a=a, b=b, p=J[a], q=J[b], tube=size[e], L=round(r["L"]), g=round(r["L"] * s["A"] * AL["rho"], 1), sf=round(AL["fy"] / max(r["sig"], 1e-6), 1),
                          buckle_sf=round(r["Pcr"] / max(r["comp"], 1e-6), 1) if r["comp"] > 1e-3 else None, x=round(float(x[e]), 2)))
    # ---- 3. same check on today's backbone alone (two longerons and the spar, no shells): a lower bound, the shells add stiffness today
    today = np.zeros(nE, bool)
    for e, (a, b) in enumerate(E):
        za, zb = J[a][2], J[b][2]
        if e in must or (a, b) in (("nose_C", "nose_K"),) or (a == "nose_K" and b.startswith("fanF_C")): today[e] = True   # nose tubes stand in for today's nose shell
    U0, res0 = evaluate(fr, today, [SHOP["8 x 1 round"]] * nE, cases)
    base_today = dict(g=round(sum(r["L"] * SHOP["8 x 1 round"]["A"] * AL["rho"] for r in res0), 1), worst_sf=round(min(AL["fy"] / r["sig"] for r in res0), 2),
                      fan_to_nozzle_twist_deg=round(twist(fr, U0[:, FLIGHT], "fanF_CL", "duct_CL"), 2), fan_to_nozzle_defl_mm=round(defl(fr, U0[:, FLIGHT], "T_F", "T_M"), 2))
    node_loads = {}                                                                     # end forces on the busiest joint, for the node study
    for r in res:
        a, b = E[r["e"]]
        for end, nm in ((0, a), (1, b)):
            if nm == NODE_STUDY: node_loads.setdefault(nm, []).append(dict(member=f"{a}-{b}", toward=J[b if end == 0 else a], tube=size[r["e"]],
                                                                         F=r["fg"][6 * end:6 * end + 3].round(3).tolist(), M=r["fg"][6 * end + 3:6 * end + 6].round(2).tolist()))
    for r in res: r.pop("fg", None)
    joint_use = {}
    for t in tubes: joint_use.setdefault(t["a"], []).append(t["tube"]); joint_use.setdefault(t["b"], []).append(t["tube"])
    return dict(J={k: list(v) for k, v in J.items()}, candidates=len(E), tubes=tubes, joints=joint_use, stiffness=stiff, today=base_today, history=[round(h, 1) for h in hist], log=log, node_loads=node_loads, case_names=list(cases),
                cases={k: [round(float(v), 2) for v in c[1]] for k, c in cases.items()}, shop={k: dict(g_per_m=v["g_per_m"], d=v["d"], t=v["t"]) for k, v in SHOP.items()}, keep=KEEP)
# ------------------------------------------------------------------ weight and scorecard
def node_mass_raw(sockets, wire_ports):
    """PETG node: a 16 mm socket per tube (2.4 mm wall, printed 100%), a web per extra tube, a wire port per run."""
    sock = math.pi * (8.4 + 2.4) * 2.4 * 16 * 1.27e-3
    return sockets * sock + 1.1 * max(sockets - 1, 0) + 0.6 * wire_ports
def _calibration():   # once analysis/node_topopt.py has grown the busiest node (4 tubes), scale every node to match it
    try: return json.load(open(os.path.join(site, "node.json")))["mass_g"] / node_mass_raw(4, 2)
    except (OSError, KeyError): return 1.0
NODE_CAL = _calibration()
def node_mass(sockets, wire_ports): return NODE_CAL * node_mass_raw(sockets, wire_ports)
def reweigh(sk, fpv=True, micro_rx=False):
    parts = [dict(p) for p in P["parts"]]
    if micro_rx: parts = [dict(p, mass=2, name='Micro receiver (ELRS)') if p['id'] == 'rx' else p for p in parts]
    drop = {"longeronL", "longeronR", "spar", "sparCarrier", "nose", "noseCone", "noseRing", "fanbay", "tray", "hatch", "aftBridge", "boomL", "boomR",
            "batteryTray", "fcSled", "gearBktR", "gearBktL", "gearMountN", "coverRF", "coverRA", "coverLF", "coverLA", "hatchLatch"}
    removed = [p for p in parts if p["id"] in drop]; parts = [p for p in parts if p["id"] not in drop]
    add = []
    tubes_g = sum(t["g"] for t in sk["tubes"]); tx = sum(t["g"] * (t["p"][0] + t["q"][0]) / 2 for t in sk["tubes"]) / tubes_g
    add.append(dict(id="alSkeleton", name="Aluminium skeleton", group="Skeleton", material="Aluminium", mass=round(tubes_g), cg=[round(tx), -5, 0]))
    nodes = sk["joints"]; ng = sum(node_mass(len(v), 2) for v in nodes.values())
    nx = sum(node_mass(len(v), 2) * sk["J"][k][0] for k, v in nodes.items()) / ng
    add.append(dict(id="petgNodes", name=f"PETG nodes ({len(nodes)}) with wire ports", group="Skeleton", material="PETG", mass=round(ng), cg=[round(nx), -10, 0]))
    # skin: outer surface only. Body 46.6 dm2 + nose 9.0 dm2 (CadQuery body_master / nose_loft), less the two lift-fan holes and the hatch line
    skin_dm2 = 46.6 + 9.0 - 3.3; g_dm2 = 1e4 * 0.55 * 0.62e-3
    skin = skin_dm2 * g_dm2
    extras = {"skin stiffening ribs (25%)": 0.25 * skin, "lift-fan duct wall": 12, "main-fan intake and nozzle bay walls": 20, "gear wells (3)": 15,
              "skin clips to nodes (40 x 0.25 g)": 10, "nose crush cone (progressive folds)": 18, "belly crush strip": 12, "hatch frame and latch": 8}
    sk_g = skin + sum(extras.values())
    shells = [p for p in removed if p["material"] == "LW-PLA"]; sx = sum(p["mass"] * p["cg"][0] for p in shells) / sum(p["mass"] for p in shells)
    add.append(dict(id="skin", name="LW-PLA skin with crash zones", group="Skin", material="LW-PLA", mass=round(sk_g), cg=[round(sx), -4, 0]))     # same footprint as the shells it replaces
    add.append(dict(id="bays", name="Avionics bays: PETG trays on TPU isolators", group="Skeleton", material="PETG+TPU", mass=22, cg=[90, -15, 0]))
    if fpv:
        add += [dict(id="fpvCam", name="FPV camera (micro, 19 mm)", group="FPV", material="Bought", mass=5, cg=[455, 22, 0]),
                dict(id="fpvPanTilt", name="Pan/tilt: two 3.7 g servos + printed yoke", group="FPV", material="Bought", mass=11, cg=[440, 14, 0]),
                dict(id="fpvVtx", name="Video transmitter + antenna", group="FPV", material="Bought", mass=10, cg=[330, 5, 0])]
    new = parts + add
    return new, removed, add, dict(skin_area_dm2=round(skin_dm2, 1), skin_g=round(skin, 1), skin_extras={k: round(v, 1) for k, v in extras.items()})
def score(parts):
    base = json.load(open(os.path.join(here, "baseline_aero.json"))); sz = json.load(open(os.path.join(site, "sizing.json")))
    T = {t["id"]: t for t in P["thrusters"]}; cap = np.array([T["F"]["maxG"], T["M"]["maxG"] * 0.85, T["L"]["maxG"] + T["R"]["maxG"]], float)
    m = sum(p["mass"] for p in parts)
    npx = -base["neutral_point_mm_behind_datum"]
    def at(bx):
        cg = (sum(p["mass"] * p["cg"][0] for p in parts if p["id"] != "battery") + 306 * bx) / m
        arms = np.array([D["fanX"] - cg, -403.5 - cg, D["rollX"] - cg])
        r = linprog([0, 0, 0, 1], A_ub=[[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1]], b_ub=[0, 0, 0], A_eq=[list(cap) + [0], list(cap * arms) + [0]], b_eq=[m, 0], bounds=[(0.05, 1)] * 3 + [(0, 1)])
        return cg, float(r.x[3]) if r.success else 9
    best = min(np.linspace(D["battery"]["xMin"], D["battery"]["xMax"], 60), key=lambda bx: at(bx)[1] + (0 if 5 <= (at(bx)[0] - npx) / 2.4 <= 12 else 5))
    cg, worst = at(best)
    clmax = base["CL_max_est"] * sz["foils"]["sd7062"]["clmax"] / sz["foils"]["naca2408"]["clmax"]
    stall = math.sqrt(2 * m / 1000 * 9.81 / (1.225 * base["s_ref_m2"] * clmax))
    hover_min = 3.4 * (1970 / m) ** 1.5                                                  # hover time scales roughly with (weight)^-1.5 at fixed pack
    return dict(mass=round(m), battery_x=round(float(best), 1), cg=round(cg, 1), margin=round((cg - npx) / 2.4, 1), hover_worst=round(worst, 3), stall=round(stall, 1), hover_min=round(hover_min, 1))
if __name__ == "__main__":
    sk = study()
    print("candidates", sk["candidates"], " kept", len(sk["tubes"]), " tubes", round(sum(t["g"] for t in sk["tubes"])), "g", " stiffness", sk["stiffness"], " today", sk["today"])
    for t in sorted(sk["tubes"], key=lambda t: t["a"]): print(f'  {t["a"]:10s}-> {t["b"]:10s} {t["tube"]:14s} {t["L"]:4d} mm {t["g"]:5.1f} g  SF {t["sf"]:5.1f}  buckle {t["buckle_sf"]}')
    out = dict(skeleton=sk, node_calibration=round(NODE_CAL, 2)); print('node calibration', round(NODE_CAL, 2))
    for label, fpv, mrx in (("skeleton_no_fpv", False, False), ("skeleton_fpv", True, False), ("skeleton_fpv_micro_rx", True, True)):
        parts, removed, add, skin = reweigh(sk, fpv, mrx)
        out[label] = dict(score=score(parts), added=add, removed=[dict(id=p["id"], name=p["name"], mass=p["mass"]) for p in removed], skin=skin)
        print(label, out[label]["score"], " removed", sum(p["mass"] for p in removed), " added", sum(a["mass"] for a in add))
    out["today"] = score(P["parts"]); print("today", out["today"])
    json.dump(out, open(os.path.join(site, "skeleton.json"), "w"), indent=1)
