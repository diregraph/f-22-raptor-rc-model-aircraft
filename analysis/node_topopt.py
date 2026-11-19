"""Generative design of one PETG skeleton node: 3D topology optimisation (SIMP, 8-node bricks) of the busiest joint, where the left
longeron meets the wing spar (x = -160). Loads are the member end forces from analysis/skeleton.py, all six load cases at once.

Fixed solid: a 2.4 mm wall round each tube socket. Fixed empty: the tube bores and the wire channel that carries the harness
through the node (the tube bores are the conduit between nodes; the channel climbs over the spar and exits through a connector
port on top). The optimiser decides everything else.

Run after skeleton.py:  python3 analysis/node_topopt.py   (a few minutes; writes site/analysis/node.json and site/cad/node_spar_left.stl)
"""
import json, os, math, time, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import cg
import pyamg
here = os.path.dirname(os.path.abspath(__file__)); site = os.path.join(here, "..", "site")
SK = json.load(open(os.path.join(site, "analysis", "skeleton.json")))["skeleton"]
H = 1.6                                                                            # cell size, mm
X0, X1, Y0, Y1, Z0, Z1 = -32.0, 32.0, -22.4, 19.2, -22.4, 22.4                     # node box in aircraft axes, origin on the longeron axis at the spar
nx, ny, nz = round((X1 - X0) / H), round((Y1 - Y0) / H), round((Z1 - Z0) / H)
SPAR_Y, BORE, WALL, SOCK = -9.0, 4.2, 2.4, 12.0                                   # spar below the longeron; 8 mm tube bore; wall; socket starts 12 mm out
def centres():
    i, j, k = np.meshgrid(np.arange(nx), np.arange(ny), np.arange(nz), indexing="ij")
    return X0 + (i.ravel() + .5) * H, Y0 + (j.ravel() + .5) * H, Z0 + (k.ravel() + .5) * H
def seg_dist(P, a, b):
    a, b = np.array(a, float), np.array(b, float); ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
def regions(x, y, z):
    P = np.stack([x, y, z], 1)
    r_long = np.hypot(y, z); r_spar = np.hypot(x, y - SPAR_Y)
    sock_f, sock_a = (x > SOCK) & (r_long < BORE + WALL), (x < -SOCK) & (r_long < BORE + WALL)
    spar_wall = r_spar < BORE + WALL
    void = ((np.abs(x) > SOCK) & (r_long < BORE)) | (r_spar < BORE)
    chan = np.minimum.reduce([seg_dist(P, (SOCK, 0, 0), (5, 9, 0)), seg_dist(P, (5, 9, 0), (-5, 9, 0)), seg_dist(P, (-5, 9, 0), (-SOCK, 0, 0)), seg_dist(P, (0, 9, 0), (0, Y1 + 1, 0))])
    void |= chan < 3.0                                                             # harness: about 12 servo leads or 4 motor phases
    chan_wall = (chan < 3.0 + WALL) & ~void
    solid = (sock_f | sock_a | spar_wall | chan_wall) & ~void
    return solid, void, sock_f, sock_a, r_spar
STRESS = {}
def b_centre(nu=0.35):
    nodes = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], float)
    dN = nodes / 8 / (H / 2); B = np.zeros((6, 24))
    for i in range(8):
        B[0, 3 * i], B[1, 3 * i + 1], B[2, 3 * i + 2] = dN[i]
        B[3, 3 * i], B[3, 3 * i + 1] = dN[i, 1], dN[i, 0]; B[4, 3 * i + 1], B[4, 3 * i + 2] = dN[i, 2], dN[i, 1]; B[5, 3 * i], B[5, 3 * i + 2] = dN[i, 2], dN[i, 0]
    lam, mu = nu / ((1 + nu) * (1 - 2 * nu)), 1 / (2 * (1 + nu))
    C = np.zeros((6, 6)); C[:3, :3] = lam; C[np.arange(3), np.arange(3)] += 2 * mu; C[3:, 3:] = np.eye(3) * mu
    return B, C
def ke_hex(E=1.0, nu=0.35):
    # 8-node brick stiffness, 2x2x2 Gauss, unit cube scaled by H
    g = 1 / math.sqrt(3); pts = [(a, b, c) for a in (-g, g) for b in (-g, g) for c in (-g, g)]
    nodes = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], float)
    lam, mu = E * nu / ((1 + nu) * (1 - 2 * nu)), E / (2 * (1 + nu))
    C = np.zeros((6, 6)); C[:3, :3] = lam; C[np.arange(3), np.arange(3)] += 2 * mu; C[3:, 3:] = np.eye(3) * mu
    K = np.zeros((24, 24)); J = H / 2
    for p in pts:
        dN = np.array([[nodes[i, d] * np.prod([1 + nodes[i, e] * p[e] for e in range(3) if e != d]) / 8 for d in range(3)] for i in range(8)]) / J
        B = np.zeros((6, 24))
        for i in range(8):
            B[0, 3 * i], B[1, 3 * i + 1], B[2, 3 * i + 2] = dN[i]
            B[3, 3 * i], B[3, 3 * i + 1] = dN[i, 1], dN[i, 0]; B[4, 3 * i + 1], B[4, 3 * i + 2] = dN[i, 2], dN[i, 1]; B[5, 3 * i], B[5, 3 * i + 2] = dN[i, 2], dN[i, 0]
        K += B.T @ C @ B * J ** 3
    return K
def run(volfrac=0.16, iters=40, penal=3.0, rmin=1.5):
    t0 = time.time(); x, y, z = centres(); ne = nx * ny * nz
    solid, void, sf, sa, r_spar = regions(x, y, z)
    nid = lambda i, j, k: (i * (ny + 1) + j) * (nz + 1) + k
    i, j, k = np.meshgrid(np.arange(nx), np.arange(ny), np.arange(nz), indexing="ij"); i, j, k = i.ravel(), j.ravel(), k.ravel()
    en = np.stack([nid(i, j, k), nid(i + 1, j, k), nid(i + 1, j + 1, k), nid(i, j + 1, k), nid(i, j, k + 1), nid(i + 1, j, k + 1), nid(i + 1, j + 1, k + 1), nid(i, j + 1, k + 1)], 1)
    edof = np.repeat(en * 3, 3, 1) + np.tile([0, 1, 2], 8); ndof = 3 * (nx + 1) * (ny + 1) * (nz + 1)
    KE = ke_hex(); iK = np.repeat(edof, 24, 1).ravel(); jK = np.tile(edof, 24).ravel()
    # node coordinates
    ni, nj, nk = np.meshgrid(np.arange(nx + 1), np.arange(ny + 1), np.arange(nz + 1), indexing="ij")
    NX, NY, NZ = X0 + ni.ravel() * H, Y0 + nj.ravel() * H, Z0 + nk.ravel() * H
    # support: the spar runs through and carries the node (nodes on the bore surface)
    rs = np.hypot(NX, NY - SPAR_Y); on_solid = lambda region: np.unique(en[region].ravel())          # only nodes that belong to solid cells
    spar_cells = (r_spar < BORE + WALL) & ~void; fixn = np.intersect1d(on_solid(spar_cells), np.where(rs < BORE + 1.0)[0]); fixed = np.r_[fixn * 3, fixn * 3 + 1, fixn * 3 + 2]
    free = np.setdiff1d(np.arange(ndof), fixed)
    def rigid_modes(fr):                                                           # near-null space for the multigrid solver
        B = np.zeros((ndof, 6)); B[0::3, 0] = B[1::3, 1] = B[2::3, 2] = 1
        B[0::3, 3], B[1::3, 3] = -NY, NX; B[1::3, 4], B[2::3, 4] = -NZ, NY; B[0::3, 5], B[2::3, 5] = NZ, -NX
        return B[fr]
    # loads: each longeron's end force and moment, spread over its socket's inner surface
    rl = np.hypot(NY, NZ); loads = SK["node_loads"]["spar_CL"]; nc = len(loads[0]["F"][0]); F = np.zeros((ndof, nc))
    for L in loads:
        d = np.array(L["toward"], float) - np.array([-160.0, -9.0, -92.0])
        if abs(d[0]) < 30: continue                                                # the spar itself: it passes straight through
        sel = np.intersect1d(on_solid((sf if d[0] > 0 else sa) & ~void), np.where(rl < BORE + 1.0)[0])
        Fv, Mv = -np.array(L["F"]), -np.array(L["M"])                              # what the tube pushes onto the node
        r = np.stack([NX[sel] - NX[sel].mean(), NY[sel], NZ[sel]], 1); rr = (r ** 2).sum()
        for c in range(nc):
            f = Fv[:, c] / len(sel) + np.cross(Mv[:, c], r) / rr
            F[sel * 3, c] += f[:, 0]; F[sel * 3 + 1, c] += f[:, 1]; F[sel * 3 + 2, c] += f[:, 2]
    # density filter
    from scipy.spatial import cKDTree
    C = np.stack([x, y, z], 1); tree = cKDTree(C); pairs = tree.query_pairs(rmin * H, output_type="ndarray")
    rows = np.r_[pairs[:, 0], pairs[:, 1], np.arange(ne)]; cols = np.r_[pairs[:, 1], pairs[:, 0], np.arange(ne)]
    w = np.r_[np.repeat(rmin * H - np.linalg.norm(C[pairs[:, 0]] - C[pairs[:, 1]], axis=1), 2), np.full(ne, rmin * H)]
    Hm = coo_matrix((w, (rows, cols)), shape=(ne, ne)).tocsr(); Hs = np.asarray(Hm.sum(1)).ravel()
    design = ~(solid | void); xd = np.where(solid, 1.0, np.where(void, 0.0, volfrac)); E0, Emin = 1.0, 1e-6
    target = volfrac * design.sum() + solid.sum(); hist = []
    for it in range(iters):
        xp = Hm @ xd / Hs; xp[solid] = 1.0; xp[void] = 0.0
        sK = (KE.ravel()[None, :] * (Emin + xp ** penal * (E0 - Emin))[:, None]).ravel()
        K = coo_matrix((sK, (iK, jK)), shape=(ndof, ndof)).tocsr(); Kf = K[free][:, free]
        ml = pyamg.smoothed_aggregation_solver(Kf, B=rigid_modes(free), max_coarse=500); M = ml.aspreconditioner(cycle="V")
        U = np.zeros((ndof, nc)) if it == 0 else U; ce = np.zeros(ne)
        for c in range(nc):
            U[free, c], info = cg(Kf, F[free, c], x0=U[free, c], rtol=1e-7, M=M, maxiter=2000)
            res_ = np.linalg.norm(Kf @ U[free, c] - F[free, c]) / max(np.linalg.norm(F[free, c]), 1e-30)
            if info or res_ > 1e-4: print(f"    solver case {c}: info {info}, residual {res_:.1e}", flush=True)
            Ue = U[edof, c]; ce += np.einsum("ij,jk,ik->i", Ue, KE, Ue)
        comp = float(((Emin + xp ** penal * (E0 - Emin)) * ce).sum()); hist.append(comp)
        dc = Hm @ (-penal * (E0 - Emin) * xp ** (penal - 1) * ce / Hs)
        l1, l2 = 1e-9, 1e9
        while l2 / l1 > 1.001:
            lm = math.sqrt(l1 * l2); xn = np.clip(xd * np.sqrt(np.maximum(-dc, 1e-30) / lm), np.maximum(xd - 0.2, 0), np.minimum(xd + 0.2, 1))
            xn[solid] = 1; xn[void] = 0; l1, l2 = (lm, l2) if (Hm @ xn / Hs).sum() > target else (l1, lm)
        xd = xn
        print(f"  iter {it:2d}  compliance {comp:10.4f}  {time.time() - t0:5.0f} s", flush=True)
    xp = Hm @ xd / Hs; xp[solid] = 1; xp[void] = 0
    # von Mises stress at each cell centre, MPa (loads in N, lengths in mm, so the stiffness scale drops out)
    Bc, Cm = b_centre()
    vm = np.zeros(ne)
    for c in range(nc):
        sig = (np.einsum("ij,ej->ei", Cm @ Bc, U[edof, c])) * (xp ** penal)[:, None]
        s_ = sig; v = np.sqrt(0.5 * ((s_[:, 0] - s_[:, 1]) ** 2 + (s_[:, 1] - s_[:, 2]) ** 2 + (s_[:, 2] - s_[:, 0]) ** 2) + 3 * (s_[:, 3] ** 2 + s_[:, 4] ** 2 + s_[:, 5] ** 2))
        vm = np.maximum(vm, v)
    STRESS.update(p99=float(np.percentile(vm[xp > 0.5], 99)), max=float(vm[xp > 0.5].max()))
    # a plain block node of the same outline, for comparison: everything outside the bores and channel filled
    return xp.reshape(nx, ny, nz), hist, dict(solid=int(solid.sum()), void=int(void.sum()), design=int(design.sum()))
def export(rho):
    from skimage import measure
    import trimesh
    pad = np.pad(rho, 1)
    v, f, _, _ = measure.marching_cubes(pad, 0.5, spacing=(H, H, H))
    v += np.array([X0 - H / 2, Y0 - H / 2, Z0 - H / 2])
    m = trimesh.Trimesh(v, f); trimesh.smoothing.filter_taubin(m, iterations=10)
    return m
VOLFRACS, ALLOW = (0.06, 0.035, 0.02, 0.012), 20.0     # PETG across layers ~25-30 MPa; 20 MPa keeps a margin at the 99th-percentile cell
if __name__ == "__main__":
    print(f"grid {nx} x {ny} x {nz} = {nx * ny * nz} cells of {H} mm")
    sweep, runs = [], []
    for vf in VOLFRACS:
        rho, hist, reg = run(volfrac=vf, iters=30)
        m = export(rho); vol = float(abs(m.volume)); g = vol * 1.27e-3
        sweep.append(dict(volfrac=vf, mass_g=round(g, 1), stress_p99=round(STRESS["p99"], 1), stress_max=round(STRESS["max"], 1), compliance=round(hist[-1], 1)))
        runs.append((rho, hist, reg, m, g, vol)); print(sweep[-1], flush=True)
    # every run is far below the PETG stress limit, so stiffness decides: the lightest node no more than 3x as flexible as the stiffest
    ok = [i for i, r in enumerate(sweep) if r["stress_p99"] <= ALLOW and r["compliance"] <= 3 * sweep[0]["compliance"]]
    pick = ok[-1]; sweep[pick]["chosen"] = True
    rho, hist, reg, m, g, vol = runs[pick]
    os.makedirs(os.path.join(site, "cad"), exist_ok=True); m.export(os.path.join(site, "cad", "node_spar_left.stl"))
    box = (X1 - X0) * (Y1 - Y0) * (Z1 - Z0)
    out = dict(sweep=sweep, allowable_mpa=ALLOW, cell_mm=H, grid=[nx, ny, nz], mass_g=round(g, 1), volume_mm3=round(vol), box_mm=[X1 - X0, Y1 - Y0, Z1 - Z0], regions=reg, history=[round(h, 4) for h in hist],
               note="PETG printed solid (100%); harness channel 6 mm wide inside, connector port on top")
    json.dump(out, open(os.path.join(site, "analysis", "node.json"), "w"), indent=1)
    print(out["mass_g"], "g")
