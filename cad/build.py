"""Parametric CAD for the PETG test-frame parts. Run: python3 cad/build.py

Aircraft axes (same as site/js/spec.js): +X nose, +Y up, +Z right wing, millimetres.
Internally CadQuery coords are (X, -Z, Y) so CadQuery's Z is "up" and chirality is preserved.

Outputs
  cad/stl/*.stl     print orientation, sitting on the bed
  cad/step/*.step   same pose, for editing in any CAD package
  site/models/*.stl assembly position, loaded by the digital twin
"""
import json, os, shutil
import cadquery as cq

# ---------------------------------------------------------------- parameters
TUBE = 8.0            # backbone tube outer diameter
CLIP_ID = 8.2         # snap bore (PETG holes print ~0.1-0.2 small)
CLIP_OD = 13.6
CLIP_SLOT = 6.9       # mouth of the C-clip: tube must spring it open by ~1.1 mm
SLIDE_ID = 8.35       # bore a tube slides through
LZ = 92.0             # longeron centre-line, +/- Z
FAN_X, PIVOT_X, SPAR_X, SPAR_Y, ROLL_Z = 130.0, -300.0, -200.0, -9.0, 445.0
M3 = 3.4              # clearance hole
MOTOR_PITCH = 16.0    # EMAX ECO II 2306: 16 x 16 mm M3 pattern
MOTOR_BORE = 9.5      # clearance for shaft circlip
# MG90S
SV_L, SV_W, SV_FIT = 22.8, 12.2, 0.4      # body length, width, pocket clearance
SV_EAR_SPAN, SV_HOLE_PITCH, SV_PILOT = 32.6, 27.8, 1.7
SV_SHAFT_OFF = 5.9    # shaft axis from body centre, along body length
SV_EAR_UNDER = 4.8    # ear underside above body centre (along shaft)
SV_HALF_H = 11.35     # body half height (along shaft)
SV_HORN_PLANE = 18.3  # horn seating plane above body centre
HORN_HUB, HORN_W, HORN_LEN, HORN_T = 7.6, 6.0, 17.0, 2.0  # recess for the stock single-arm horn: CHECK against yours

# ---------------------------------------------------------------- helpers (aircraft coords in, CadQuery solids out)
def box(x0, x1, y0, y1, z0, z1):
    return cq.Workplane("XY").box(x1 - x0, z1 - z0, y1 - y0).translate(((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2))

def cyl(axis, r, a0, a1, p, q):
    """axis 'x': p=y q=z | axis 'y': p=x q=z | axis 'z': p=x q=y"""
    h = a1 - a0
    if axis == "y":
        return cq.Workplane("XY").circle(r).extrude(h).translate((p, -q, a0))
    if axis == "x":
        return cq.Workplane("YZ").center(-q, p).circle(r).extrude(h).translate((a0, 0, 0))
    return cq.Workplane("XZ").center(p, q).circle(r).extrude(h).translate((0, -a0, 0))

def bar(p0, p1, width, y0, y1):
    """straight bar in plan view between (x,z) points"""
    (x0, z0), (x1, z1) = p0, p1
    dx, dz = x1 - x0, z1 - z0
    n = (dx * dx + dz * dz) ** 0.5
    ox, oz = -dz / n * width / 2, dx / n * width / 2
    pts = [(x0 + ox, -(z0 + oz)), (x1 + ox, -(z1 + oz)), (x1 - ox, -(z1 - oz)), (x0 - ox, -(z0 - oz))]
    return cq.Workplane("XY").polyline(pts).close().extrude(y1 - y0).translate((0, 0, y0))

def clip(x0, x1, z, base_y):
    """C-clip that snaps UP onto a longeron (mouth on top). Returns (add, cut)."""
    add = cyl("x", CLIP_OD / 2, x0, x1, 0, z).union(box(x0, x1, base_y, 0, z - CLIP_OD / 2, z + CLIP_OD / 2))
    cut = cyl("x", CLIP_ID / 2, x0 - 1, x1 + 1, 0, z).union(box(x0 - 1, x1 + 1, 0, CLIP_OD, z - CLIP_SLOT / 2, z + CLIP_SLOT / 2))
    # lead-in chamfer on the mouth
    for s in (-1, 1):
        cut = cut.union(bar((x0 - 1, z + s * CLIP_SLOT / 2), (x1 + 1, z + s * CLIP_SLOT / 2), 2.2, 4.6, CLIP_OD).rotate((0, -z - s * CLIP_SLOT / 2, 4.6), (1, -z - s * CLIP_SLOT / 2, 4.6), s * -28))
    return add, cut

def motor_holes(axis, a0, a1, c1, c2, cbore=None):
    """4 x M3 on a 16 mm square + centre bore, drilled along `axis`."""
    cut = cyl(axis, MOTOR_BORE / 2, a0, a1, c1, c2)
    for i in (-1, 1):
        for j in (-1, 1):
            cut = cut.union(cyl(axis, M3 / 2, a0, a1, c1 + i * MOTOR_PITCH / 2, c2 + j * MOTOR_PITCH / 2))
            if cbore:
                cut = cut.union(cyl(axis, 3.1, cbore[0], cbore[1], c1 + i * MOTOR_PITCH / 2, c2 + j * MOTOR_PITCH / 2))
    return cut

# ---------------------------------------------------------------- parts
def spar_carrier():
    x0, x1, yb = SPAR_X - 13, SPAR_X + 13, -19.5
    body = box(SPAR_X - 7, SPAR_X + 7, yb, -13.6, -LZ, LZ)                      # tie beam under the spar
    cut = cyl("z", SLIDE_ID / 2, -LZ - 20, LZ + 20, SPAR_X, SPAR_Y)
    for s in (-1, 1):
        a, c = clip(x0, x1, s * LZ, yb)
        body = body.union(a).union(box(x0, x1, yb, -3.0, s * LZ - 10, s * LZ + 10))   # spar block
        cut = cut.union(c)
    return body.cut(cut)

def fan_spider():
    yb, yt = -19.0, -12.0                                                     # motor face at y = -12
    body = cyl("y", 17.0, yb, yt, FAN_X, 0)
    cut = motor_holes("y", yb - 1, yt + 1, FAN_X, 0, cbore=(yb - 1, yb + 3.0))
    cut = cut.union(box(FAN_X - 3, FAN_X + 3, yt - 2.2, yt + 1, 9, 18))       # motor-wire notch
    for dx in (-50, 50):
        for s in (-1, 1):
            body = body.union(bar((FAN_X, 0), (FAN_X + dx, s * (LZ - 4)), 9.0, yb, yt))
            a, c = clip(FAN_X + dx - 7, FAN_X + dx + 7, s * LZ, yb)
            body = body.union(a); cut = cut.union(c)
    return body.cut(cut)

def bearing_right():
    x0, x1, s = PIVOT_X - 14, PIVOT_X + 14, 1
    a, c = clip(x0, x1, s * LZ, -11.0)
    body = a.union(box(x0, x1, -11.0, -5.5, 72, LZ + CLIP_OD / 2))            # base slab
    body = body.union(box(PIVOT_X - 10, PIVOT_X + 10, -5.5, 0, 72, 85)).union(cyl("z", 8.6, 72, 85, PIVOT_X, 0))
    cut = c.union(cyl("z", SLIDE_ID / 2, 70, 86, PIVOT_X, 0))
    return body.cut(cut)

SV_TILT_ZC = -72.8                                                            # tilt-servo body centre; shaft points inboard (+Z)
def bearing_left():
    x0, x1 = PIVOT_X - 26.5, PIVOT_X + 14.5
    sx = PIVOT_X - SV_SHAFT_OFF                                               # servo body centre in X
    zp = SV_TILT_ZC + SV_EAR_UNDER                                            # ear seating plane
    a, c = clip(PIVOT_X - 14, PIVOT_X + 14, -LZ, -11.0)
    body = a.union(box(x0, x1, -11.0, -7.6, -LZ - CLIP_OD / 2, zp))           # floor
    body = body.union(box(x0, x1, -11.0, 10.5, zp - 3.2, zp))                 # servo plate
    for xa, xb in ((x0, x0 + 3.0), (x1 - 3.0, x1)):                           # gussets
        body = body.union(box(xa, xb, -11.0, 10.5, -84.0, zp))
    w, l = SV_W + SV_FIT, SV_L + SV_FIT
    cut = c.union(box(sx - l / 2, sx + l / 2, -w / 2, w / 2, zp - 4, zp + 1))  # body window
    cut = cut.union(box(sx - l / 2 - 4, sx - l / 2 + 1, -2.2, 2.2, zp - 4, zp + 1))  # lead exit
    for i in (-1, 1):
        cut = cut.union(cyl("z", SV_PILOT / 2, zp - 4, zp + 1, sx + i * SV_HOLE_PITCH / 2, 0))
    return body.cut(cut)

YAW_SY = -1.5                                                                 # yaw-servo body centre height
def yoke():
    """Built in aircraft coords; tilt axis is the Z line through (PIVOT_X, 0)."""
    X, top = PIVOT_X, YAW_SY + SV_EAR_UNDER                                   # flat top face (prints upside down on it)
    zh = SV_TILT_ZC + SV_HORN_PLANE                                           # tilt horn plane
    sx = X - SV_SHAFT_OFF
    w, l = SV_W + SV_FIT, SV_L + SV_FIT
    body = box(X - 6.5, X + 6.5, top - 13, top, zh + 5.5, -w / 2)             # left beam
    body = body.union(box(X - 7, X + 7, -24.0, top, zh, zh + 5.5))            # horn paddle
    body = body.union(box(sx - 17.6, sx + 17.6, top - 9.8, top, -11.2, 11.2)) # servo frame
    body = body.union(box(X - 6.5, X + 6.5, top - 13, top, w / 2, 71.2))      # right beam
    body = body.union(cyl("z", 3.9, 71.2, 85.6, X, 0))                        # stub axle (stops short of the longeron)
    ys = YAW_SY - SV_HALF_H - 0.8                                             # stirrup under the servo: lower yaw pivot
    for s in (-1, 1):
        body = body.union(box(X - 5, X + 5, ys - 3.6, top - 9.8, s * 11.2 - (3.6 if s > 0 else 0), s * 11.2 + (3.6 if s < 0 else 0)))
    body = body.union(box(X - 5, X + 5, ys - 3.6, ys, -11.2, 11.2))
    cut = box(sx - l / 2, sx + l / 2, YAW_SY - SV_HALF_H - 0.5, top + 1, -w / 2, w / 2)          # servo pocket
    for i in (-1, 1):
        cut = cut.union(cyl("y", SV_PILOT / 2, top - 8, top + 1, sx + i * SV_HOLE_PITCH / 2, 0))
    cut = cut.union(cyl("y", 2.15, ys - 5, ys + 1, X, 0))                     # lower pivot hole
    # tilt horn recess (arm points down) + screw access
    cut = cut.union(cyl("z", HORN_HUB / 2, zh - 1, zh + HORN_T, X, 0)).union(box(X - HORN_W / 2, X + HORN_W / 2, -HORN_LEN, 0, zh - 1, zh + HORN_T))
    cut = cut.union(cyl("z", 3.0, zh - 1, zh + 7, X, 0))
    return body.cut(cut)

def cradle():
    """Yaw axis is the Y line through (PIVOT_X, z=0). Motor face at x = PIVOT_X - 33."""
    X = PIVOT_X
    yh = YAW_SY + SV_HORN_PLANE                                               # yaw horn plane
    ys = YAW_SY - SV_HALF_H - 0.8 - 3.6                                       # underside of yoke stirrup
    yb0, yb1 = ys - 4.6, ys - 0.8                                             # bottom arm
    body = box(X - 33, X + 8, yh, yh + 4.2, -9, 9)                            # top arm
    body = body.union(box(X - 33, X + 7, yb0, yb1, -9, 9))
    body = body.union(cyl("y", 2.0, yb1, yb1 + 4.2, X, 0))                    # lower pivot pin
    body = body.union(box(X - 33, X - 29.5, yb0, yh + 4.2, -9, 9)).union(cyl("x", 16.0, X - 33, X - 29.5, 0, 0))
    cut = motor_holes("x", X - 34, X - 28, 0, 0)
    cut = cut.union(cyl("y", HORN_HUB / 2, yh - 1, yh + HORN_T, X, 0)).union(box(X - HORN_LEN, X, yh - 1, yh + HORN_T, -HORN_W / 2, HORN_W / 2))
    cut = cut.union(cyl("y", 3.3, yh - 1, yh + 6, X, 0))
    return body.cut(cut)

def roll_pod(side=1):
    z, x = side * ROLL_Z, SPAR_X
    lo, hi = sorted((side * 402.0, side * 462.0))
    body = cyl("z", 7.0, lo, hi, x, SPAR_Y)
    body = body.union(box(x - 5.4, x + 5.4, SPAR_Y, 4.0, z - 13, z + 13)).union(cyl("y", 16.0, 4.0, 8.0, x, z))
    blo, bhi = sorted((side * 401.0, side * 456.0))
    cut = cyl("z", SLIDE_ID / 2, blo, bhi, x, SPAR_Y)
    cut = cut.union(motor_holes("y", 3.0, 9.0, x, z))
    cut = cut.union(cyl("y", 1.1, SPAR_Y - 8, SPAR_Y + 8, x, side * 412.0))   # 2 mm retaining pin through pod and spar
    return body.cut(cut)

# name: (builder, twin id, pivot to subtract for the twin, print rotation (axis, deg) or None)
PARTS = {
    "spar_carrier": (spar_carrier, "sparCarrier", (0, 0, 0), None),
    "fan_spider": (fan_spider, "fanSpider", (0, 0, 0), None),
    "tilt_bearing_left": (bearing_left, "bearingL", (0, 0, 0), None),
    "tilt_bearing_right": (bearing_right, "bearingR", (0, 0, 0), None),
    "tilt_yoke": (yoke, "yoke", (PIVOT_X, 0, 0), ((1, 0, 0), 180)),
    "motor_cradle": (cradle, "cradle", (PIVOT_X, 0, 0), ((1, 0, 0), 90)),
    "roll_pod_right": (lambda: roll_pod(1), "podR", (0, 0, 0), ((1, 0, 0), 180)),
    "roll_pod_left": (lambda: roll_pod(-1), "podL", (0, 0, 0), ((1, 0, 0), 180)),
}
PETG = 1.27e-3  # g / mm^3

def envelopes():
    """Keep-out volumes used for interference checks (aircraft coords)."""
    sx = PIVOT_X - SV_SHAFT_OFF
    return {
        "longerons": cyl("x", TUBE / 2, -425, 225, 0, -LZ).union(cyl("x", TUBE / 2, -425, 225, 0, LZ)),
        "spar": cyl("z", TUBE / 2, -455, 455, SPAR_X, SPAR_Y),
        "tilt servo body": box(sx - SV_L / 2, sx + SV_L / 2, -SV_W / 2, SV_W / 2, SV_TILT_ZC - SV_HALF_H, SV_TILT_ZC + SV_HALF_H),
        "yaw servo body": box(sx - SV_L / 2, sx + SV_L / 2, YAW_SY - SV_HALF_H, YAW_SY + SV_HALF_H, -SV_W / 2, SV_W / 2),
    }

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    for d in ("stl", "step"): os.makedirs(os.path.join(here, d), exist_ok=True)
    os.makedirs(os.path.join(root, "site", "models"), exist_ok=True); os.makedirs(os.path.join(root, "site", "cad"), exist_ok=True)
    solids, report = {}, {}
    for name, (fn, tid, pivot, rot) in PARTS.items():
        s = fn(); solids[name] = s
        asm = s.translate((-pivot[0], 0, 0)).rotate((0, 0, 0), (1, 0, 0), -90)     # CadQuery -> aircraft axes
        cq.exporters.export(asm, os.path.join(root, "site", "models", tid + ".stl"), tolerance=0.02, angularTolerance=0.15)
        p = s.rotate((0, 0, 0), rot[0], rot[1]) if rot else s
        bb = p.val().BoundingBox()
        p = p.translate((-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin))
        cq.exporters.export(p, os.path.join(here, "stl", name + ".stl"), tolerance=0.01, angularTolerance=0.1)
        cq.exporters.export(p, os.path.join(here, "step", name + ".step"))
        for ext in ("stl", "step"):
            shutil.copy(os.path.join(here, ext, name + "." + ext), os.path.join(root, "site", "cad", name + "." + ext))
        vol = s.val().Volume()
        report[name] = {"twin_id": tid, "bed_mm": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "solids": s.solids().size(),
                        "volume_cm3": round(vol / 1000, 2), "mass_solid_g": round(vol * PETG, 1), "mass_est_g": round(vol * PETG * 0.62, 1)}
    env = envelopes(); clashes = []
    for name, s in solids.items():
        for en, e in env.items():
            v = s.intersect(e).val().Volume() if s.intersect(e).vals() else 0
            if v > 0.5: clashes.append((name, en, round(v, 1)))
    names = list(solids)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            inter = solids[a].intersect(solids[b])
            v = inter.val().Volume() if inter.vals() else 0
            if v > 0.5: clashes.append((a, b, round(v, 1)))
    json.dump(report, open(os.path.join(here, "report.json"), "w"), indent=1)
    for k, v in report.items(): print(f"{k:20s} bed {v['bed_mm']}  solids {v['solids']}  ~{v['mass_est_g']} g")
    print("clashes (mm^3):", clashes or "none")

if __name__ == "__main__":
    main()
