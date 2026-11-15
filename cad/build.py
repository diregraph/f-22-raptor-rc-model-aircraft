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
FAN_X, PIVOT_X, SPAR_X, SPAR_Y = 130.0, -300.0, -130.0, -9.0
WING_TIP_Z = 345.0
ROLL_X, ROLL_Z, ROLL_HOLE_R = -108.0, 240.0, 55.0   # roll motors buried in the wings, 4 in propellers
ROLL_PAD_Y, ROLL_PROP_Y = -27.0, 2.0
SPAR_HALF = WING_TIP_Z - 7.0
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
    """A pair of blocks, one per longeron. Each clips up onto its longeron and the spar slides through it;
    the spar itself ties the two together. A notch under the bore carries the roll-motor wires."""
    x0, x1, yb = SPAR_X - 15, SPAR_X + 15, -19.5
    body, cut = None, cyl("z", SLIDE_ID / 2, -LZ - 20, LZ + 20, SPAR_X, SPAR_Y)
    for s in (-1, 1):
        a, c = clip(x0, x1, s * LZ, yb)
        blk = a.union(box(x0, x1, yb, -3.0, s * LZ - 10, s * LZ + 10))
        body = blk if body is None else body.union(blk)
        cut = cut.union(c).union(box(SPAR_X - 4, SPAR_X + 4, yb - 1, -15.5, s * LZ - 11, s * LZ + 11))
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
    """Roll-motor mount, buried in the wing. Clips up onto the spar inside the wing duct and hangs the motor
    just ahead of the spar with the propeller at the wing's upper surface. A 2 mm pin stops it sliding."""
    z = side * ROLL_Z; yb = ROLL_PAD_Y - 4.0
    ring = cyl("z", CLIP_OD / 2, z - 12, z + 12, SPAR_X, SPAR_Y).union(box(SPAR_X - CLIP_OD / 2, SPAR_X + CLIP_OD / 2, yb, SPAR_Y, z - 12, z + 12))
    body = ring.union(box(SPAR_X, ROLL_X, yb, ROLL_PAD_Y, z - 8, z + 8)).union(cyl("y", 16.0, yb, ROLL_PAD_Y, ROLL_X, z))
    cut = cyl("z", CLIP_ID / 2, z - 13, z + 13, SPAR_X, SPAR_Y).union(box(SPAR_X - CLIP_SLOT / 2, SPAR_X + CLIP_SLOT / 2, SPAR_Y, SPAR_Y + CLIP_OD, z - 13, z + 13))
    cut = cut.union(motor_holes("y", yb - 1, ROLL_PAD_Y + 1, ROLL_X, z, cbore=(yb - 1, yb + 1.2)))
    cut = cut.union(cyl("x", 1.1, SPAR_X - 10, SPAR_X + 10, SPAR_Y, z))                    # 2 mm retaining pin through clip and spar
    cut = cut.union(box(SPAR_X - 4, SPAR_X + 4, yb - 1, -15.5, z - 13, z + 13))               # motor wires pass under the spar
    return body.cut(cut)

# ================================================================ airframe (LW-PLA) and remaining PETG parts
import math
TAN = lambda d: math.tan(math.radians(d))
W_ = lambda solid: cq.Workplane("XY").newObject([solid])
BORE = 8.5                    # tube bore in foamed shells
X_NOSE, X_FAN0, X_TRAY0, X_BRIDGE0, X_NOTCH, X_AFT = 230.0, 30.0, -170.0, -260.0, -258.0, -430.0
X_J1, Y_AX = -272.0, 2.0           # first nozzle bearing and the main fan axis (cad/propulsion.py kit frame origin)
NAC_R, DUCT_R = 51.0, 43.1          # engine nacelle (flush with the nozzle's bearing rings) and the bore the fan duct slides into
# nozzle servos: buried either side of the fan duct, shaft pointing inboard, each turning a cord drum that stands on edge
NZ = {"xs": -222.0, "yc": -6.5, "zd": 53.0, "drum_r": 27.5, "drum_t": 6.0, "fair_t": 3.8}
NZ["zc"] = NZ["zd"] + NZ["drum_t"] / 2 - HORN_T + SV_HORN_PLANE     # servo body centre: the horn sits in the drum's outboard face
NZ["xc"] = NZ["xs"] + SV_SHAFT_OFF                                  # servo body is forward of its shaft
NZ["cord_y"] = (NZ["yc"] + NZ["drum_r"], NZ["yc"] - NZ["drum_r"])   # the two cords leave the drum top and bottom, heading aft
PLENUM = (-176.0, -140.0, 58.0)     # x range and half width of the main fan's air inlet, open above and below
LIFT_HOLE_R = 62.4                  # bore for the lift-fan shroud ring
TUBE_FRONT, TUBE_REAR = 212.0, -425.0
HALF_W, NOTCH_W, FAN_R = 108.0, 84.0, LIFT_HOLE_R
CAV = dict(x0=-136.0, x1=20.0, z=80.0, floor=-21.0, top=14.0)      # electronics bay (the spar crosses it)
HATCH = dict(x0=-140.0, x1=24.0, z=84.0)
WING = dict(root_z=108.0, bury=5.0, mid_z=180.0, tip_z=WING_TIP_Z, root_le=70.0, root_c=300.0, tip_c=95.0, sweep=34.0, y=-9.0)
STAB = dict(pivot_x=-400.0, y=-9.0, root_z=110.0, tip_z=217.0, root_le=-328.0, root_c=160.0, tip_c=62.0, sweep=34.0)   # tail span = 63% of wing span, as on the real aircraft
FIN = dict(root_le=-218.0, root_c=165.0, tip_c=62.0, h=155.0, sweep=42.0, cant=25.0, z=95.0, y0=13.0, bury=2.0)
SKID_X, GROUND_Y = (10.0, -150.0), -150.0     # tall skids: the nozzle hangs about 130 mm below the fan axis when it points down
BATT_X = -52.0
STAB_SERVO_X = -362.0

# fuselage cross-sections: hexagon (top flat, chine, bottom flat) -> the faceted look of the real aircraft
#        x     chine  top   bot   y_top  y_bot  y_chine
#        x     chine  (top)  bot   y_top  y_bot  y_chine  roundness of the top (2 = ellipse, 5 = nearly flat)
MID = [(230.0, 108.0, 88.0, 78.0, 38.0, -46.0, 0.0, 2.6), (130.0, 108.0, 90.0, 80.0, 38.0, -46.0, 0.0, 2.6), (30.0, 108.0, 90.0, 80.0, 36.0, -46.0, 0.0, 2.8),
       (-170.0, 108.0, 88.0, 76.0, 30.0, -42.0, 0.0, 3.4), (-260.0, 108.0, 98.0, 72.0, 25.0, -37.0, 0.0, 4.5), (-430.0, 106.0, 101.0, 88.0, 15.0, -21.0, -2.0, 5.0)]
NOSE = [(230.0, 80.0, 44.0, 50.0, 40.0, -46.0, 0.0, 2.6), (300.0, 72.0, 36.0, 44.0, 38.0, -43.0, 0.0, 2.6), (370.0, 58.0, 27.0, 34.0, 31.0, -37.0, -1.0, 2.5),
        (430.0, 42.0, 17.0, 23.0, 21.0, -28.0, -2.0, 2.4), (472.0, 26.0, 9.0, 13.0, 10.0, -18.0, -3.0, 2.3), (498.0, 10.0, 3.0, 4.5, 3.0, -10.0, -4.0, 2.2), (508.0, 2.0, 0.8, 1.0, -2.5, -5.5, -4.0, 2.2)]
X_CONE = 380.0                # the nose is split here so each half fits the printer height
CHEEK_X = 262.0               # forward reach of the intake lips

def interp(tab, x, col):
    t = sorted(tab)
    for a, b in zip(t, t[1:]):
        if a[0] <= x <= b[0]:
            return a[col] + (b[col] - a[col]) * (x - a[0]) / (b[0] - a[0])
    return t[0][col] if x < t[0][0] else t[-1][col]

def wire(pts):   # aircraft (x,y,z) -> closed CadQuery wire
    return cq.Wire.makePolygon([cq.Vector(x, -z, y) for x, y, z in pts], close=True)

def hexwire(x, w, tw, bw, yt, yb, yc, k=1.0):
    return wire([(x, yt * k, tw * k), (x, yc * k, w * k), (x, yb * k, bw * k), (x, yb * k, -bw * k), (x, yc * k, -w * k), (x, yt * k, -tw * k)])

def secwire(x, w, tw, bw, yt, yb, yc, n=2.6, N=10):
    """fuselage section: rounded upper surface from the chine over the top, faceted belly below the chine"""
    arc = [(w * math.sin(math.pi / 2 * i / N) ** (2 / n), yc + (yt - yc) * math.cos(math.pi / 2 * i / N) ** (2 / n)) for i in range(N + 1)]
    pts = [(x, y, z) for z, y in arc] + [(x, yb, bw), (x, yb, -bw)] + [(x, y, -z) for z, y in reversed(arc[1:])]
    return wire(pts)

def loft(wires, ruled=True):
    return W_(cq.Solid.makeLoft(wires, ruled))

def naca(xc, t):
    return 5 * t * (0.2969 * math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)

def foil(le, c, t, place, n=22):
    """closed aerofoil polygon; place(x, th) -> aircraft point"""
    xs = [(1 - math.cos(math.pi * i / n)) / 2 for i in range(n + 1)]
    up = [place(le - c * x, naca(x, t) * c) for x in xs]
    lo = [place(le - c * x, -naca(x, t) * c) for x in xs[-2:0:-1]]
    return wire(up + lo)

def body_master():
    body = loft([secwire(*s) for s in MID])
    hump = [(24.0, 64.0, 46.0, 50.0), (-60.0, 60.0, 42.0, 50.0), (-139.0, 54.0, 38.0, 48.0)]   # engine spine behind the lift fan
    hw = [secwire(x, w, tw, w, top, 14.0, 20.0, 2.3) for x, w, tw, top in hump]
    body = body.union(loft(hw))
    body = body.union(cyl("x", NAC_R, X_NOTCH, PLENUM[0], Y_AX, 0))                               # round engine nacelle around the main fan duct
    # intake lips: the body sides run forward of the intake face, swept so the outboard edge leads
    ext = loft([secwire(X_NOSE - 1, *MID[0][1:]), secwire(CHEEK_X, *MID[0][1:])])
    for sg in (-1, 1):
        tri = [(X_NOSE - 1, -sg * 82.0), (X_NOSE - 1, -sg * 109.0), (CHEEK_X, -sg * 109.0)]
        wedge = cq.Workplane("XY").polyline(tri).close().extrude(140).translate((0, 0, -70))
        body = body.union(ext.intersect(wedge))
    return body

def nose_solid():
    return loft([secwire(*s) for s in NOSE])

def spigot(k):    # PETG plug that joins nose to fan bay
    s0 = NOSE[0]
    a = hexwire(X_NOSE, *s0[1:7], k=k); b = hexwire(X_NOSE - 12.0, *s0[1:7], k=k)
    return loft([b, a])

def wing_le(z): return WING["root_le"] - (z - WING["root_z"]) * TAN(WING["sweep"])
def wing_c(z): return WING["root_c"] + (WING["tip_c"] - WING["root_c"]) * (z - WING["root_z"]) / (WING["tip_z"] - WING["root_z"])
def wing_t(z): return 0.09 + 0.04 * (z - WING["root_z"]) / (WING["tip_z"] - WING["root_z"])

def wing_panel(z0, z1, side=1, grow=0.0):
    secs = [foil(wing_le(z) + grow, wing_c(z) + 2 * grow, wing_t(z) * (1 + grow / 6), lambda x, th, z=z: (x, WING["y"] + th, side * z)) for z in (z0, (z0 + z1) / 2, z1)]
    return loft(secs)

def wing_cuts(side):
    lo, hi = sorted((side * 60.0, side * (SPAR_HALF + 0.6)))
    c = cyl("z", BORE / 2, lo, hi, SPAR_X, SPAR_Y)                                        # spar bore, closed at the tip
    lo, hi = sorted((side * 60.0, side * ROLL_Z))
    c = c.union(box(SPAR_X - 4, SPAR_X + 4, -24.0, -15.2, lo, hi))                        # wire slot under the spar, as far as the roll motor
    c = c.union(cyl("y", ROLL_HOLE_R, -60, 60, ROLL_X, side * ROLL_Z))                    # duct for the roll propeller
    c = c.union(cyl("y", 1.1, -30, 30, SPAR_X, side * (SPAR_HALF - 8)))                   # 2 mm tip pin through wing and spar
    zm = WING["mid_z"]; xp = wing_le(zm) - 0.22 * wing_c(zm)
    a, b = sorted((side * (zm - 22), side * (zm + 22)))
    return c.union(cyl("z", 1.7, a, b, xp, WING["y"]))                                    # 3 mm bamboo-skewer alignment pin

def wing(part, side):
    z0 = WING["root_z"] - WING["bury"]
    p = wing_panel(z0, WING["mid_z"], side) if part == "in" else wing_panel(WING["mid_z"], WING["tip_z"], side)
    return p.cut(wing_cuts(side))

def stab(side, grow=0.0):
    s = STAB
    def sec(z):
        u = (z - s["root_z"]) / (s["tip_z"] - s["root_z"])
        return foil(s["root_le"] - (z - s["root_z"]) * TAN(s["sweep"]) + grow, s["root_c"] + (s["tip_c"] - s["root_c"]) * u + 2 * grow, 0.07 + 0.02 * u, lambda x, th: (x, s["y"] + th, side * z))
    body = loft([sec(s["root_z"]), sec((s["root_z"] + s["tip_z"]) / 2), sec(s["tip_z"])])
    a, b = sorted((side * (s["root_z"] - 1), side * (s["root_z"] + 62)))
    body = body.cut(cyl("z", 1.6, a, b, s["pivot_x"], s["y"]))                              # 3 mm pivot wire
    h0, h1 = sorted((side * s["root_z"], side * (s["root_z"] + 3.2)))
    horn = box(s["pivot_x"] + 20, s["pivot_x"] + 24, s["y"] - 30, s["y"], h0, h1).cut(cyl("z", 0.7, h0 - 1, h1 + 1, s["pivot_x"] + 22, s["y"] - 26))
    return body.union(horn)

def fin(side, grow=0.0):
    f = FIN; ca, sa = math.cos(math.radians(f["cant"])), math.sin(math.radians(f["cant"]))
    def sec(sp):
        u = max(sp, 0) / f["h"]
        place = lambda x, th: (x, f["y0"] + sp * ca - th * sa, side * (f["z"] + sp * sa + th * ca))
        return foil(f["root_le"] - max(sp, 0) * TAN(f["sweep"]) + grow, f["root_c"] + (f["tip_c"] - f["root_c"]) * u + 2 * grow, (0.055 + 0.02 * u) * (1 + grow), place)
    return loft([sec(-f["bury"]), sec(0.0), sec(f["h"] / 2), sec(f["h"])])

def canopy_solid():
    ws = []
    for i in range(13):
        s = i / 12; x = 246 + 180 * s; k = math.sin(math.pi * s ** 0.72)
        cw, ch = max(1.2, 34 * k ** 0.5), max(1.2, 27 * k ** 0.65)
        yb = interp(NOSE, x, 4) - 14
        pts = [(x, yb + 14 + ch * math.sin(a) ** 0.9, cw * math.cos(a)) for a in [math.pi * j / 16 for j in range(17)]]
        ws.append(wire(pts + [(x, yb, -cw), (x, yb, cw)]))
    return loft(ws).cut(nose_solid())

# ---- cut-outs shared by the fuselage modules
def longeron_bores():
    c = None
    for s in (-1, 1):
        b = cyl("x", BORE / 2, TUBE_REAR - 0.6, TUBE_FRONT + 0.6, 0, s * LZ)
        c = b if c is None else c.union(b)
    return c

def clip_pocket(x, half, s, yb):
    lo, hi = sorted((s * (LZ - 8.0), s * (LZ + 8.0)))
    return box(x - half, x + half, yb - 2, 8.6, lo, hi)

def zbox(x0, x1, y0, y1, s, z0, z1):   # box on side s (+1 right, -1 left) between |z| = z0 and z1
    lo, hi = sorted((s * z0, s * z1)); return box(x0, x1, y0, y1, lo, hi)

def nozzle_servo_cut(s, yb):
    """Pocket for one nozzle servo and its cord drum, open to the belly: the servo goes in from below with the drum already on it."""
    xs, yc, zd, zc, xc, t = NZ["xs"], NZ["yc"], NZ["zd"], NZ["zc"], NZ["xc"], NZ["drum_t"]
    w, l, r = SV_W + SV_FIT, SV_L + SV_FIT, NZ["drum_r"] + 2.6
    c = zbox(xc - l / 2, xc + l / 2, yb, yc + w / 2, s, zc - SV_HALF_H - 0.3, zc + SV_HALF_H + 0.3)         # servo body
    c = c.union(zbox(xc - SV_EAR_SPAN / 2 - 0.3, xc + SV_EAR_SPAN / 2 + 0.3, yb, yc + w / 2, s, zc - SV_EAR_UNDER - 2.8, zc - SV_EAR_UNDER + 0.3))   # ears
    c = c.union(zbox(xs - 6.5, xs + 6.5, yb, yc + 6.5, s, zd + t / 2, zc - SV_HALF_H))                     # output boss and shaft
    lo, hi = sorted((s * (zd - t / 2 - 0.5), s * (zd + t / 2 + 0.5)))
    c = c.union(cyl("z", r, lo, hi, xs, yc)).union(box(xs - r, xs + r, yb, yc, lo, hi))                    # drum slot
    c = c.union(cyl("x", 1.7, X_NOTCH - 1, xs, NZ["cord_y"][0], s * zd))                                   # upper cord bore
    c = c.union(zbox(X_NOTCH - 1, xs, yb, NZ["cord_y"][1] + 1.7, s, zd - 1.7, zd + 1.7))                   # lower cord groove, open to the belly
    return c.union(zbox(X_NOTCH - 1, X_NOTCH + NZ["fair_t"] + 0.2, -70, 70, s, zd - 4.5, zd + 4.5))        # seat for the hard fairlead strip

def cord_fairlead(s):
    """PETG strip glued into the rear face of the body: the two cords of one servo turn the corner here, not on soft LW-PLA."""
    f = body_master().intersect(zbox(X_NOTCH, X_NOTCH + NZ["fair_t"], -70, 70, s, NZ["zd"] - 4.3, NZ["zd"] + 4.3))
    for y in NZ["cord_y"]:
        f = f.cut(cyl("x", 1.1, X_NOTCH - 1, X_NOTCH + 6, y, s * NZ["zd"]))
        f = f.cut(cq.Workplane("YZ").center(-s * NZ["zd"], y).circle(2.6).workplane(offset=1.6).circle(1.1).loft().translate((X_NOTCH - 0.01, 0, 0)))   # flared mouth on the nozzle side
    return f

def fuselage_cuts():
    yb = -60.0
    c = longeron_bores().union(cyl("y", FAN_R, -70, 70, FAN_X, 0))                               # lift-fan duct, sized for the shroud ring
    c = c.union(cq.Workplane("XY").circle(FAN_R + 5.2).workplane(offset=-5.2).circle(FAN_R).loft().translate((FAN_X, 0, MID[1][4])))   # seat for the ring lip
    c = c.union(cyl("x", DUCT_R, X_NOTCH - 1, PLENUM[0] + 1, Y_AX, 0))                              # main fan duct
    c = c.union(box(PLENUM[0], PLENUM[1], -90, 90, -PLENUM[2], PLENUM[2]))                       # main fan inlet: open on the spine and the belly
    c = c.union(cyl("z", BORE / 2, -HALF_W - 5, HALF_W + 5, SPAR_X, SPAR_Y))                     # spar
    c = c.union(box(X_AFT - 5, X_NOTCH, -70, 70, -NOTCH_W, NOTCH_W))                             # main-propeller swing space
    c = c.union(box(CAV["x0"], CAV["x1"], CAV["floor"], 80, -CAV["z"], CAV["z"]))                # electronics bay
    c = c.union(box(HATCH["x0"], HATCH["x1"], CAV["top"], 80, -HATCH["z"], HATCH["z"]))          # hatch opening (ledge all round)
    c = c.union(spigot(0.872))                                                                   # nose plug socket (closed above and below)
    c = c.union(box(HATCH["x1"] - 5, HATCH["x1"] + 9, 9.0, 15.6, -41, 41))                       # hatch tongue slot
    for sg in (-1, 1): c = c.union(cyl("y", 1.7, -12.0, 60.0, X_NOSE - 6.0, sg * 40.0))             # nose retaining pins (3 mm bamboo skewer)
    c = c.union(box(HATCH["x0"] - 2.4, HATCH["x0"] + 1, 15.0, 19.0, -16, 16))                    # hatch latch groove
    for s in (-1, 1):
        lo, hi = sorted((s * 82.0, s * 109.0)); c = c.union(box(222.0, 232.0, -40.0, -3.0, lo, hi))   # intake mouths
        for dx in (-50, 50):                                                                     # fan spider: clips + arms
            c = c.union(clip_pocket(FAN_X + dx, 8.2, s, yb)).union(bar((FAN_X, 0), (FAN_X + dx, s * (LZ - 2)), 11.0, yb, -11.0))
        c = c.union(clip_pocket(SPAR_X, 15.6, s, yb))                                            # spar carrier block
        lo, hi = sorted((s * (LZ - 11.5), s * (LZ + 11.5))); c = c.union(box(SPAR_X - 15.6, SPAR_X + 15.6, yb, -2.4, lo, hi))
        lo, hi = sorted((s * 78.0, s * 110.0)); c = c.union(box(SPAR_X - 4, SPAR_X + 4, CAV["floor"], -15.2, lo, hi))   # roll-motor wires under the spar
        for xs in SKID_X: c = c.union(clip_pocket(xs, 6.0, s, yb))
        sx = STAB_SERVO_X - s * SV_SHAFT_OFF                                                     # tail servo, dropped in from below
        lo, hi = sorted((s * (STAB["root_z"] - 14 - 6.5), s * (STAB["root_z"] - 14 + 6.5)))
        c = c.union(box(sx - 11.8, sx + 11.8, yb, -7.5, lo, hi)).union(box(sx - 16.8, sx + 16.8, yb, interp(MID, STAB_SERVO_X, 5) + 2.6, lo, hi))
        lo, hi = sorted((s * 80.0, s * 112.0)); c = c.union(cyl("z", 1.65, lo, hi, STAB["pivot_x"], STAB["y"]))   # tail pivot wire
        lo, hi = sorted((s * 56.0, s * 86.0)); c = c.union(box(X_NOTCH - 2, CAV["x0"] + 2, -19.0, -9.0, lo, hi))  # wire run to the tail
        c = c.union(nozzle_servo_cut(s, yb))
        c = c.union(wing_panel(WING["root_z"] - WING["bury"] - 0.4, WING["mid_z"], s, grow=0.35))  # wing root socket
        c = c.union(fin(s, grow=0.3))
    c = c.union(box(CAV["x1"] - 2, FAN_X - FAN_R + 6, -19.0, -11.0, -9, 9))                      # wire run to the fan motor
    return c

_cache = {}
def fuselage_all():
    if "f" not in _cache: _cache["f"] = body_master().cut(fuselage_cuts())
    return _cache["f"]

def slab(x0, x1, z0=-200, z1=200, y0=-100, y1=100): return box(x0, x1, y0, y1, z0, z1)
def fanbay(): return fuselage_all().intersect(slab(X_FAN0, CHEEK_X + 1))
def tray(): return fuselage_all().intersect(slab(X_TRAY0, X_FAN0))
def aft_bridge(): return fuselage_all().intersect(slab(X_BRIDGE0, X_TRAY0))
def boom(side): return fuselage_all().intersect(slab(X_AFT, X_BRIDGE0, *sorted((side * 1.0, side * 200.0))))
def dowels():   # two 3 mm bamboo-skewer dowels across the nose split
    c = None
    for sg in (-1, 1):
        d = cyl("x", 1.7, X_CONE - 14, X_CONE + 14, 0.0, sg * 22.0); c = d if c is None else c.union(d)
    return c
def nose(): return nose_solid().intersect(slab(X_NOSE - 1, X_CONE)).cut(dowels())
def nose_cone(): return nose_solid().intersect(slab(X_CONE, 600)).cut(dowels())

def hatch():
    h = body_master().intersect(box(HATCH["x0"] + 0.4, HATCH["x1"] - 0.4, CAV["top"] + 0.2, 80, -HATCH["z"] + 0.4, HATCH["z"] - 0.4))
    h = h.union(box(HATCH["x1"] - 3, HATCH["x1"] + 7.5, 9.6, 15.0, -40, 40))                     # front tongue
    return h.cut(box(HATCH["x0"] - 1, HATCH["x0"] + 12, CAV["top"] - 1, 20.5, -15.5, 15.5))      # seat for the PETG latch

def hatch_latch():   # glued into the hatch; the ridge clicks into the tray groove
    x = HATCH["x0"]
    b = box(x + 0.6, x + 11.5, CAV["top"] + 0.4, 20.0, -15, 15).cut(box(x + 2.4, x + 11.5, CAV["top"] + 0.4, 18.2, -12.5, 12.5))
    return b.union(cyl("z", 1.5, -13, 13, x + 0.2, 17.0)).cut(box(x - 3, x - 1.6, 10, 25, -20, 20))

def nose_ring():     # PETG plug glued to the nose; detent ridges hold it in the fan bay
    s = spigot(0.86).cut(spigot(0.78)).intersect(slab(X_NOSE - 10, X_NOSE - 0.2))
    for sg in (-1, 1):   # pillars for the two retaining pins
        s = s.union(cyl("y", 5.0, -60.0, 60.0, X_NOSE - 6.0, sg * 40.0).intersect(spigot(0.86))).cut(cyl("y", 1.7, -60.0, 60.0, X_NOSE - 6.0, sg * 40.0))
    return s

def skid(xs):
    yb = interp(MID, xs, 5)
    body = box(xs - 4, xs + 4, yb - 7.0, yb - 3.0, -LZ - 6, LZ + 6)                              # bar under the belly
    cut = None
    for s in (-1, 1):
        a, c = clip(xs - 5, xs + 5, s * LZ, -8.0)
        lo, hi = sorted((s * (LZ - 3.5), s * (LZ + 3.5)))
        body = body.union(a).union(box(xs - 4, xs + 4, yb - 7.0, -6.0, lo, hi))                  # leg up to the clip
        lo, hi = sorted((s * (LZ + 2.0), s * (LZ + 8.0)))
        body = body.union(box(xs - 4, xs + 4, GROUND_Y, yb - 3.0, lo, hi)).union(box(xs - 15, xs + 15, GROUND_Y, GROUND_Y + 4.0, lo, hi))
        cut = c if cut is None else cut.union(c)
    return body.cut(cut)

def battery_tray():  # slides fore-aft on the bay floor; strap slots
    x, y = BATT_X, CAV["floor"]
    b = box(x - 71, x + 71, y + 0.4, y + 2.4, -25, 25)
    for s in (-1, 1):
        lo, hi = sorted((s * 23.0, s * 25.0)); b = b.union(box(x - 71, x + 71, y + 0.4, y + 9.0, lo, hi))
    b = b.union(box(x + 68, x + 71, y + 0.4, y + 10.0, -25, 25))
    for xx in (x - 30, x + 30): b = b.cut(box(xx - 11, xx + 11, y - 1, y + 4, -22, -18)).cut(box(xx - 11, xx + 11, y - 1, y + 4, 18, 22))
    return b

def fc_sled():       # carries the ESP32 (47 x 23.5 mm hole pattern) and the gyro board
    y = CAV["floor"]; zc = -52.0
    b = box(-110, -22, y + 5.0, y + 7.0, zc - 18, zc + 18)
    for xx in (-106, -26): b = b.union(box(xx - 4, xx + 4, y + 0.4, y + 5.0, zc - 18, zc + 18))
    for dx in (-23.5, 23.5):
        for dz in (-11.75, 11.75): b = b.union(cyl("y", 1.3, y + 7.0, y + 11.0, -52 + dx, zc + dz))
    for dz in (-7.62, 7.62): b = b.union(cyl("y", 1.3, y + 7.0, y + 10.0, -98, zc + dz))
    return b

LW, PETG_D = 0.62e-3, 1.27e-3
# name: (builder, twin id, pivot, print rotation, material)
ROT_UP = ((0, 1, 0), -90)      # stand the part on its tail: aircraft +X becomes printer up
PARTS = {
    "spar_carrier": (spar_carrier, "sparCarrier", (0, 0, 0), None, "PETG"),
    "fan_spider": (fan_spider, "fanSpider", (0, 0, 0), None, "PETG"),
    "roll_mount_right": (lambda: roll_pod(1), "podR", (0, 0, 0), ((1, 0, 0), 180), "PETG"),
    "roll_mount_left": (lambda: roll_pod(-1), "podL", (0, 0, 0), ((1, 0, 0), 180), "PETG"),
    "skid_front": (lambda: skid(SKID_X[0]), "skidF", (0, 0, 0), ROT_UP, "PETG"),
    "skid_rear": (lambda: skid(SKID_X[1]), "skidR", (0, 0, 0), ROT_UP, "PETG"),
    "battery_tray": (battery_tray, "batteryTray", (BATT_X, 0, 0), None, "PETG"),
    "fc_sled": (fc_sled, "fcSled", (0, 0, 0), None, "PETG"),
    "cord_fairlead_right": (lambda: cord_fairlead(1), "fairleadR", (0, 0, 0), ROT_UP, "PETG"),
    "cord_fairlead_left": (lambda: cord_fairlead(-1), "fairleadL", (0, 0, 0), ROT_UP, "PETG"),
    "nose_plug": (nose_ring, "noseRing", (0, 0, 0), ROT_UP, "PETG"),
    "hatch_latch": (hatch_latch, "hatchLatch", (0, 0, 0), ((0, 1, 0), 90), "PETG"),
    "canopy": (canopy_solid, "canopy", (0, 0, 0), None, "PETG-clear"),
    "nose": (nose, "nose", (0, 0, 0), ROT_UP, "LW-PLA"),
    "nose_cone": (nose_cone, "noseCone", (0, 0, 0), ROT_UP, "LW-PLA"),
    "fan_bay": (fanbay, "fanbay", (0, 0, 0), ROT_UP, "LW-PLA"),
    "centre_section": (tray, "tray", (0, 0, 0), ROT_UP, "LW-PLA"),
    "hatch": (hatch, "hatch", (0, 0, 0), ((1, 0, 0), 180), "LW-PLA"),
    "aft_bridge": (aft_bridge, "aftBridge", (0, 0, 0), ROT_UP, "LW-PLA"),
    "tail_boom_right": (lambda: boom(1), "boomR", (0, 0, 0), ROT_UP, "LW-PLA"),
    "tail_boom_left": (lambda: boom(-1), "boomL", (0, 0, 0), ROT_UP, "LW-PLA"),
    "wing_inner_right": (lambda: wing("in", 1), "wingInR", (0, 0, 0), ((1, 0, 0), 90), "LW-PLA"),
    "wing_inner_left": (lambda: wing("in", -1), "wingInL", (0, 0, 0), ((1, 0, 0), -90), "LW-PLA"),
    "wing_outer_right": (lambda: wing("out", 1), "wingOutR", (0, 0, 0), ((1, 0, 0), 90), "LW-PLA"),
    "wing_outer_left": (lambda: wing("out", -1), "wingOutL", (0, 0, 0), ((1, 0, 0), -90), "LW-PLA"),
    "stabilator_right": (lambda: stab(1), "stabR", (STAB["pivot_x"], STAB["y"], 0), ((1, 0, 0), 90), "LW-PLA"),
    "stabilator_left": (lambda: stab(-1), "stabL", (STAB["pivot_x"], STAB["y"], 0), ((1, 0, 0), -90), "LW-PLA"),
    "fin_right": (lambda: fin(1), "finR", (0, 0, 0), ((1, 0, 0), 90 - FIN["cant"]), "LW-PLA"),
    "fin_left": (lambda: fin(-1), "finL", (0, 0, 0), ((1, 0, 0), -(90 - FIN["cant"])), "LW-PLA"),
}

def nozzle_servo_env(s):
    return zbox(NZ["xc"] - SV_L / 2, NZ["xc"] + SV_L / 2, NZ["yc"] - SV_W / 2, NZ["yc"] + SV_W / 2, s, NZ["zc"] - SV_HALF_H, NZ["zc"] + SV_HALF_H)

def envelopes():
    return {
        "longerons": cyl("x", TUBE / 2, TUBE_REAR, TUBE_FRONT, 0, -LZ).union(cyl("x", TUBE / 2, TUBE_REAR, TUBE_FRONT, 0, LZ)),
        "spar": cyl("z", TUBE / 2, -SPAR_HALF, SPAR_HALF, SPAR_X, SPAR_Y),
        "lift fan rotor": cyl("y", 60.2, -6.0, 24.0, FAN_X, 0),
        "lift fan shroud ring": cyl("y", LIFT_HOLE_R - 0.2, -4.0, MID[1][4] - 5.5, FAN_X, 0).cut(cyl("y", 60.6, -10, 60, FAN_X, 0)),
        "main fan duct": cyl("x", DUCT_R - 0.3, X_J1, PLENUM[0] + 4, Y_AX, 0),
        "roll propeller discs": cyl("y", 52.0, ROLL_PROP_Y - 4, ROLL_PROP_Y + 4, ROLL_X, -ROLL_Z).union(cyl("y", 52.0, ROLL_PROP_Y - 4, ROLL_PROP_Y + 4, ROLL_X, ROLL_Z)),
        "roll motor bodies": cyl("y", 15.0, ROLL_PAD_Y + 0.3, ROLL_PROP_Y - 5, ROLL_X, -ROLL_Z).union(cyl("y", 15.0, ROLL_PAD_Y + 0.3, ROLL_PROP_Y - 5, ROLL_X, ROLL_Z)),
        "speed controllers": box(-128.5, -29.5, -18.5, 7.5, -79.8, -72.0).union(box(-128.5, -29.5, -18.5, 7.5, 72.0, 79.8)),
        "nozzle servos": nozzle_servo_env(1).union(nozzle_servo_env(-1)),
        "cord drums": cyl("z", NZ["drum_r"] + 1.4, NZ["zd"] - 3, NZ["zd"] + 3, NZ["xs"], NZ["yc"]).union(cyl("z", NZ["drum_r"] + 1.4, -NZ["zd"] - 3, -NZ["zd"] + 3, NZ["xs"], NZ["yc"])),
        "battery": box(BATT_X - 67.5, BATT_X + 67.5, CAV["floor"] + 2.5, CAV["floor"] + 32.5, -21.5, 21.5),
    }

def vol(w):
    try: return sum(s.Volume() for s in w.solids().vals())
    except Exception: return 0.0

def main():
    import sys, time
    only = set(sys.argv[1:])
    here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
    for d in ("stl", "step"): os.makedirs(os.path.join(here, d), exist_ok=True)
    site_cad = os.path.join(root, "site", "cad"); os.makedirs(site_cad, exist_ok=True)
    rep_path = os.path.join(here, "report.json")
    report = json.load(open(rep_path)) if only and os.path.exists(rep_path) else {}
    solids = {}
    for name, (fn, tid, pivot, rot, mat) in PARTS.items():
        if only and name not in only: continue
        t0 = time.time(); s = fn(); solids[name] = s
        p = s.rotate((0, 0, 0), rot[0], rot[1]) if rot else s
        bb = p.val().BoundingBox(); shift = (-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin)
        p = p.translate(shift)
        fine = mat.startswith("PETG") and name != "canopy"
        cq.exporters.export(p, os.path.join(here, "stl", name + ".stl"), tolerance=0.01 if fine else 0.04, angularTolerance=0.1 if fine else 0.25)
        cq.exporters.export(p, os.path.join(here, "step", name + ".step"))
        shutil.copy(os.path.join(here, "stl", name + ".stl"), os.path.join(site_cad, name + ".stl"))
        # print pose -> assembly pose (aircraft axes), as a column-major 4x4 for three.js
        T = cq.Location(cq.Vector(-shift[0], -shift[1], -shift[2]))
        if rot: T = cq.Location(cq.Vector(0, 0, 0), cq.Vector(*rot[0]), -rot[1]) * T
        T = cq.Location(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), -90) * cq.Location(cq.Vector(-pivot[0], 0, -pivot[1])) * T if True else T
        m = T.wrapped.Transformation(); mat4 = [m.Value(r, c) for c in (1, 2, 3, 4) for r in (1, 2, 3)]
        mat4 = mat4[0:3] + [0] + mat4[3:6] + [0] + mat4[6:9] + [0] + mat4[9:12] + [1]
        v = vol(s); area = sum(f.Area() for f in s.faces().vals())
        mass = v * PETG_D * 0.62 if mat == "PETG" else area * 0.5 * 1.24e-3 if mat == "PETG-clear" else area * 0.55 * LW + v * 0.04 * LW
        report[name] = {"twin_id": tid, "material": mat, "bed_mm": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "solids": s.solids().size(),
                        "mass_est_g": round(mass, 1), "matrix": [round(x, 5) for x in mat4]}
        print(f"{name:20s} {mat:10s} bed {report[name]['bed_mm']}  solids {report[name]['solids']}  ~{report[name]['mass_est_g']} g  ({time.time() - t0:.1f}s)", flush=True)
    json.dump(report, open(rep_path, "w"), indent=1)
    json.dump({v["twin_id"]: {"file": k, "matrix": v["matrix"], "material": v["material"], "bed": v["bed_mm"], "mass": v["mass_est_g"]} for k, v in report.items()}, open(os.path.join(site_cad, "manifest.json"), "w"))
    if only: return
    env = envelopes(); clashes = []
    names = list(solids)
    for name, s in solids.items():
        for en, e in env.items():
            v = vol(s.intersect(e))
            if v > 1.0: clashes.append((name, en, round(v, 1)))
    for i, a in enumerate(names):
        ba = solids[a].val().BoundingBox()
        for b in names[i + 1:]:
            bb = solids[b].val().BoundingBox()
            if ba.xmax < bb.xmin or bb.xmax < ba.xmin or ba.ymax < bb.ymin or bb.ymax < ba.ymin or ba.zmax < bb.zmin or bb.zmax < ba.zmin: continue
            v = vol(solids[a].intersect(solids[b]))
            if v > 1.0: clashes.append((a, b, round(v, 1)))
    over = [k for k, v in report.items() if not (min(v["bed_mm"][0], v["bed_mm"][1]) <= 220 and max(v["bed_mm"][0], v["bed_mm"][1]) <= 311 and v["bed_mm"][2] <= 250)]
    print("clashes (mm^3):", clashes or "none"); print("too big for a 220 x 220 x 250 bed (even diagonal):", over or "none")

if __name__ == "__main__":
    main()
