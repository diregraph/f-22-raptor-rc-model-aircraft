"""Structures: (1) aluminium tube against printed beams of the same weight, (2) generative design (topology optimisation)
of one bracket to see where printing does win. Run: python3 analysis/structure.py  (writes site/analysis/structure.json)"""
import json, os, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
# ---------------------------------------------------------------- 1. beams
MAT = {"Aluminium 6061 tube": dict(E=69000, rho=2.70, strength=240), "PETG, printed": dict(E=2000, rho=1.27, strength=40),
       "PLA+, printed": dict(E=3300, rho=1.24, strength=50), "LW-PLA, foamed": dict(E=1400, rho=0.62, strength=15)}
def tube(d, t): return np.pi * (d ** 4 - (d - 2 * t) ** 4) / 64, np.pi * (d ** 2 - (d - 2 * t) ** 2) / 4, d / 2
def box(h, w, t): return (w * h ** 3 - (w - 2 * t) * (h - 2 * t) ** 3) / 12, w * h - (w - 2 * t) * (h - 2 * t), h / 2
def beams():
    I, A, c = tube(8.0, 1.0); al = MAT["Aluminium 6061 tube"]; g_m = A * al["rho"]          # grams per metre
    rows = [dict(beam="8 x 1 mm aluminium tube (today's spar)", g_per_m=round(g_m, 1), EI=round(al["E"] * I / 1e6, 2), M_fail=round(al["strength"] * I / c / 1000, 2), fits="8 mm bore")]
    for name in ("PETG, printed", "PLA+, printed", "LW-PLA, foamed"):
        m = MAT[name]; h, w = 16.0, 14.0                                                   # the deepest box that fits inside the wing section at the spar
        lo, hi = 0.2, 7.0
        for _ in range(40):
            t = (lo + hi) / 2; lo, hi = (t, hi) if box(h, w, t)[1] * m["rho"] < g_m else (lo, t)
        I2, A2, c2 = box(h, w, t)
        rows.append(dict(beam=f"{name}: 16 x 14 mm box, {t:.1f} mm wall, same weight", g_per_m=round(A2 * m["rho"], 1), EI=round(m["E"] * I2 / 1e6, 2), M_fail=round(m["strength"] * I2 / c2 / 1000, 2), fits="needs a 16 mm deep slot"))
    for r in rows: r["stiffness_vs_al"] = round(r["EI"] / rows[0]["EI"], 2); r["strength_vs_al"] = round(r["M_fail"] / rows[0]["M_fail"], 2)
    load = 0.5 * 9.81 * 0.148                                                              # one roll motor at full thrust, 148 mm outboard of the spar clip, N m
    return rows, dict(roll_motor_moment_Nm=round(load, 2), tip_deflection_mm_al=round(0.5 * 9.81 * 148 ** 3 / (3 * 69000 * I), 2))
# ---------------------------------------------------------------- 2. topology optimisation (SIMP, plane stress, several load cases)
def topopt(nx, ny, fixed, loads, passive_solid, volfrac, iters=70, penal=3.0, rmin=1.6, x0=None, fixed_design=False):
    E0, Emin, nu = 1.0, 1e-9, 0.35
    k = np.array([1/2-nu/6, 1/8+nu/8, -1/4-nu/12, -1/8+3*nu/8, -1/4+nu/12, -1/8-nu/8, nu/6, 1/8-3*nu/8])
    KE = E0 / (1 - nu ** 2) * np.array([[k[0],k[1],k[2],k[3],k[4],k[5],k[6],k[7]],[k[1],k[0],k[7],k[6],k[5],k[4],k[3],k[2]],[k[2],k[7],k[0],k[5],k[6],k[3],k[4],k[1]],[k[3],k[6],k[5],k[0],k[7],k[2],k[1],k[4]],
                                        [k[4],k[5],k[6],k[7],k[0],k[1],k[2],k[3]],[k[5],k[4],k[3],k[2],k[1],k[0],k[7],k[6]],[k[6],k[3],k[4],k[1],k[2],k[7],k[0],k[5]],[k[7],k[2],k[1],k[4],k[3],k[6],k[5],k[0]]])
    ndof = 2 * (nx + 1) * (ny + 1); el = np.arange(nx * ny); ex, ey = el // ny, el % ny
    n1 = (ny + 1) * ex + ey; n2 = (ny + 1) * (ex + 1) + ey
    edof = np.stack([2*n1+2, 2*n1+3, 2*n2+2, 2*n2+3, 2*n2, 2*n2+1, 2*n1, 2*n1+1], 1)
    iK = np.kron(edof, np.ones((8, 1))).flatten(); jK = np.kron(edof, np.ones((1, 8))).flatten()
    cx, cy = ex + 0.5, ey + 0.5; H = []; rows = []; cols = []
    for i in range(nx * ny):                                             # density filter: no feature thinner than about 2 x rmin cells
        x0_, x1_ = int(max(ex[i] - 2, 0)), int(min(ex[i] + 3, nx)); y0_, y1_ = int(max(ey[i] - 2, 0)), int(min(ey[i] + 3, ny))
        for a in range(x0_, x1_):
            for b in range(y0_, y1_):
                w = rmin - np.hypot(a - ex[i], b - ey[i])
                if w > 0: rows.append(i); cols.append(a * ny + b); H.append(w)
    Hm = coo_matrix((H, (rows, cols)), shape=(nx * ny, nx * ny)).tocsr(); Hs = np.asarray(Hm.sum(1)).flatten()
    free = np.setdiff1d(np.arange(ndof), fixed); F = np.zeros((ndof, len(loads)))
    for j, case in enumerate(loads):
        for dof, val in case: F[dof, j] += val
    x = np.full(nx * ny, volfrac) if x0 is None else x0.copy(); x[passive_solid] = 1.0; hist = []
    def solve(xp):
        sK = (KE.flatten()[None, :] * (Emin + xp ** penal * (E0 - Emin))[:, None]).flatten()
        K = coo_matrix((sK, (iK, jK)), shape=(ndof, ndof)).tocsc(); K = (K + K.T) / 2
        U = np.zeros_like(F); U[free] = spsolve(K[free][:, free], F[free]).reshape(len(free), -1)
        ce = sum(np.einsum("ij,jk,ik->i", U[edof, j], KE, U[edof, j]) for j in range(F.shape[1]))
        return ce, float(np.sum((Emin + xp ** penal * (E0 - Emin)) * ce))
    if fixed_design: return x, solve(x)[1], []
    for it in range(iters):
        xp = Hm @ x / Hs; ce, c = solve(xp); hist.append(c)
        dc = Hm @ (-penal * (E0 - Emin) * xp ** (penal - 1) * ce / Hs)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2 + 1e-12) > 1e-3:                      # optimality-criteria update at fixed volume
            lm = (l1 + l2) / 2; xn = np.clip(x * np.sqrt(np.maximum(-dc, 1e-30) / lm), np.maximum(x - 0.2, 0.001), np.minimum(x + 0.2, 1.0)); xn[passive_solid] = 1.0
            l1, l2 = (lm, l2) if (Hm @ xn / Hs).mean() > volfrac else (l1, lm)
        x = xn
    xp = Hm @ x / Hs
    return xp, solve(xp)[1], hist
def skid():
    """Landing skid frame seen from the front: 220 mm wide, 120 mm tall, 2 mm cells. Held at the two longeron clips; loaded at the two feet."""
    nx, ny, cell = 110, 60, 2.0
    node = lambda ix, iy: (ny + 1) * ix + iy                              # iy = 0 is the top row
    clipL, clipR = 9, 101                                                 # longerons at z = -92 and +92 mm
    fixed = []
    for cx_ in (clipL, clipR):
        for ix in range(cx_ - 2, cx_ + 3): fixed += [2 * node(ix, 0), 2 * node(ix, 0) + 1]
    footL, footR = node(4, ny), node(106, ny)
    loads = [[(2 * footL + 1, -1.0), (2 * footR + 1, -1.0)],             # flat landing, both feet (y is down the page, so -1 pushes up)
             [(2 * footL + 1, -1.2), (2 * footL, 0.5)],                  # one foot first, drifting sideways
             [(2 * footR + 1, -1.2), (2 * footR, -0.5)]]
    el = lambda ix, iy: ix * ny + iy
    solid = [el(ix, iy) for cx_ in (clipL, clipR) for ix in range(cx_ - 3, cx_ + 3) for iy in range(0, 3)] + [el(ix, iy) for ix in list(range(2, 7)) + list(range(104, 109)) for iy in range(ny - 2, ny)]
    # today's skid, drawn on the same grid: a bar under the belly and two straight legs
    cur = np.full(nx * ny, 0.001)
    for ix in range(4, 106):
        for iy in range(0, 3): cur[el(ix, iy)] = 1.0
    for cx_ in (5, 105):
        for ix in range(cx_ - 2, cx_ + 2):
            for iy in range(0, ny): cur[el(ix, iy)] = 1.0
    for ix in list(range(2, 9)) + list(range(102, 109)):
        for iy in range(ny - 2, ny): cur[el(ix, iy)] = 1.0
    vf = float(cur.mean()); _, c_cur, _ = topopt(nx, ny, np.array(fixed), loads, solid, vf, x0=cur, fixed_design=True)
    x, c_opt, hist = topopt(nx, ny, np.array(fixed), loads, solid, vf)
    return dict(nx=nx, ny=ny, cell_mm=cell, volume_fraction=round(vf, 3), compliance_current=round(c_cur, 1), compliance_generated=round(c_opt, 1), stiffness_gain=round(c_cur / c_opt, 2),
                history=[round(h, 1) for h in hist], density=[round(float(v), 2) for v in x], current=[round(float(v), 2) for v in cur])
if __name__ == "__main__":
    rows, load = beams(); s = skid()
    for r in rows: print(r)
    print(load); print("skid: same weight, stiffness x", s["stiffness_gain"], " (compliance", s["compliance_current"], "->", s["compliance_generated"], ")")
    json.dump(dict(beams=rows, load=load, materials=MAT, skid=s), open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "analysis", "structure.json"), "w"))
