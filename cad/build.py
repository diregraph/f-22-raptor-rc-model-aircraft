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
FAN_X, PIVOT_X, SPAR_X, SPAR_Y = 210.0, -300.0, -160.0, -9.0      # layout from analysis/sizing.py: lift fan forward, wing aft; the spar crosses the main fan's inlet
WING_TIP_Z = 345.0
ROLL_X, ROLL_Z, ROLL_HOLE_R = -139.0, 193.0, 68.5   # roll motors buried in the wings ahead of the spar, 5 in propellers (analysis/design_v4.py)
ROLL_PAD_Y, ROLL_PROP_Y = -27.0, 2.0
SPAR_HALF = 300.0        # the swept wing is too thin for the tube beyond this
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
    just behind the spar with the propeller at the wing's upper surface. A 2 mm pin stops it sliding."""
    z = side * ROLL_Z; yb = ROLL_PAD_Y - 4.0
    ring = cyl("z", CLIP_OD / 2, z - 12, z + 12, SPAR_X, SPAR_Y).union(box(SPAR_X - CLIP_OD / 2, SPAR_X + CLIP_OD / 2, yb, SPAR_Y, z - 12, z + 12))
    body = ring.union(box(min(SPAR_X, ROLL_X), max(SPAR_X, ROLL_X), yb, ROLL_PAD_Y, z - 8, z + 8)).union(cyl("y", 16.0, yb, ROLL_PAD_Y, ROLL_X, z))
    cut = cyl("z", CLIP_ID / 2, z - 13, z + 13, SPAR_X, SPAR_Y).union(box(SPAR_X - CLIP_SLOT / 2, SPAR_X + CLIP_SLOT / 2, SPAR_Y, SPAR_Y + CLIP_OD, z - 13, z + 13))
    cut = cut.union(motor_holes("y", yb - 1, ROLL_PAD_Y + 1, ROLL_X, z, cbore=(yb - 1, yb + 1.2)))
    cut = cut.union(cyl("y", 14.8, ROLL_PAD_Y + 0.2, 40.0, ROLL_X, z))                     # keep clear of the motor can: it stands only 6 mm from the clip
    cut = cut.union(cyl("x", 1.1, SPAR_X - 10, SPAR_X + 10, SPAR_Y, z))                    # 2 mm retaining pin through clip and spar
    cut = cut.union(box(SPAR_X - 4, SPAR_X + 4, yb - 1, -15.5, z - 13, z + 13))               # motor wires pass under the spar
    return body.cut(cut)

# ================================================================ airframe (LW-PLA) and remaining PETG parts
import math
TAN = lambda d: math.tan(math.radians(d))
W_ = lambda solid: cq.Workplane("XY").newObject([solid])
BORE = 8.5                    # tube bore in foamed shells
X_NOSE, X_FAN0, X_TRAY0, X_BRIDGE0, X_NOTCH, X_AFT = 300.0, 96.0, -140.0, -260.0, -258.0, -430.0
X_J1, Y_AX = -272.0, 2.0           # first nozzle bearing and the main fan axis (cad/propulsion.py kit frame origin)
NAC_R, DUCT_R = 51.0, 43.1          # engine nacelle (flush with the nozzle's bearing rings) and the bore the fan duct slides into
# nozzle drive (cad/propulsion.py): the joint-1 gearmotor hangs off a plate on the fan duct, on the right, and runs forward into a
# slot in the body that is open aft, so it goes in with the duct. The nozzle board (RP2040 and two DRV8833) stands in a bay on the left.
NZ = {"cd": 57.1,                                   # joint-1 pinion from the duct axis (propulsion.py CD[0])
      "motor_x": (X_J1 + 8.6, X_J1 + 8.6 + 28.7),   # gearmotor body, gearbox face to encoder end
      "motor_w": 12.0, "motor_h": 10.0,             # across (vertical here) and radial (sideways here)
      "board": dict(x=(-248.0, -206.0), y=(-20.0, 8.0), z=(56.0, 68.0))}   # board bay: 40 x 24 mm stack, standing on edge
PLENUM = (-176.0, -140.0, 58.0)     # x range and half width of the main fan's air inlet, open above and below
LIFT_HOLE_R = 72.4                  # bore for the lift-fan shroud ring
TUBE_FRONT, TUBE_REAR = 282.0, -425.0
HALF_W, NOTCH_W, FAN_R = 108.0, 84.0, LIFT_HOLE_R
CAV = dict(x0=-58.0, x1=90.0, z=80.0, floor=-21.0, top=14.0)      # battery bay, behind the lift fan
NB = dict(x0=344.0, x1=414.0, z=30.0, floor=-14.0, top=26.0, open_x0=352.0, open_z=28.0)   # nose bay: now only the lift-fan controller, flight controller and receiver, so it is shorter and its floor sits above the gear well
ESC_BAY = dict(x=65.0, y=-18.5, z=(43.0, 65.0))      # main and roll speed controllers and the power board, flat on the battery-bay floor either side of the battery
HATCH = dict(x0=-62.0, x1=94.0, z=84.0)
WING = dict(root_z=108.0, bury=5.0, mid_z=278.0, tip_z=WING_TIP_Z, root_le=-5.0, root_c=300.0, tip_c=95.0, sweep=34.0, y=-9.0)   # panel joint outboard of the roll duct
STAB = dict(pivot_x=-400.0, y=-9.0, root_z=110.0, tip_z=240.0, root_le=-328.0, root_c=195.0, tip_c=76.0, sweep=34.0)   # 1.5x the original area: trim at 18 m/s needed 19.5 deg of the 25 available, leaving nothing for manoeuvre
FIN = dict(root_le=-218.0, root_c=165.0, tip_c=62.0, h=155.0, sweep=42.0, cant=25.0, z=95.0, y0=13.0, bury=2.0)
GROUND_Y = -150.0            # the nozzle hangs about 130 mm below the fan axis when it points down, so the legs must be this long
# Retractable legs, in place of the two tall skids. Each is a flat PETG blade on a 3 mm pivot wire, swung by a 9 g servo,
# and folds into a T-slot in the belly whose mouth the blade itself closes: no doors, nothing standing in the airflow.
# Feet are pads, not wheels: the aircraft lands vertically, and a pad folds into a 16 mm slot where a wheel would not.
GEAR = dict(retract=90.0, blade_w=22.0, blade_t=6.0, pad_t=9.0, pad_l=20.0, hub_r=9.0, pin=1.65, slot_d=24.5, lip=2.4,
            nose=dict(x=437.0, z=0.0, foot_x=430.0),                       # pivot station; folds AFT under the nose bay
            main=dict(x=(-83.0, -121.0), z=80.0, foot_z=128.0))            # left leg forward of the right one so the two fold past each other
GEAR_SERVO = dict(nose_x=398.0, main_x=(-83.0, -121.0))
WIRE_CH = dict(x0=-66.0, x1=X_NOSE, z0=66.0, z1=84.0, zt0=61.0, zt1=89.0, roof=-30.0, lip=-38.0, skin=-40.2, split=120.0)
#   open belly raceway each side: the wires drop in from below, then a cover strip slides into the T-slot and is flush with the skin
BATT_X = 16.0
BAY_DX = BATT_X + 52.0     # how far the bay contents moved forward from the first layout
STAB_SERVO_X = -362.0

# fuselage cross-sections: hexagon (top flat, chine, bottom flat) -> the faceted look of the real aircraft
#        x     chine  top   bot   y_top  y_bot  y_chine
#        x     chine  (top)  bot   y_top  y_bot  y_chine  roundness of the top (2 = ellipse, 5 = nearly flat)
MID = [(300.0, 108.0, 88.0, 78.0, 38.0, -46.0, 0.0, 2.6), (130.0, 108.0, 90.0, 80.0, 38.0, -46.0, 0.0, 2.6), (30.0, 108.0, 90.0, 80.0, 36.0, -46.0, 0.0, 2.8),
       (-170.0, 108.0, 88.0, 76.0, 30.0, -42.0, 0.0, 3.4), (-260.0, 108.0, 98.0, 72.0, 25.0, -37.0, 0.0, 4.5), (-430.0, 106.0, 101.0, 88.0, 15.0, -21.0, -2.0, 5.0)]
NOSE = [(300.0, 80.0, 44.0, 50.0, 40.0, -46.0, 0.0, 2.6), (370.0, 72.0, 36.0, 44.0, 38.0, -43.0, 0.0, 2.6), (440.0, 58.0, 27.0, 34.0, 31.0, -37.0, -1.0, 2.5),
        (500.0, 42.0, 17.0, 23.0, 21.0, -28.0, -2.0, 2.4), (542.0, 26.0, 9.0, 13.0, 10.0, -18.0, -3.0, 2.3), (568.0, 10.0, 3.0, 4.5, 3.0, -10.0, -4.0, 2.2), (578.0, 2.0, 0.8, 1.0, -2.5, -5.5, -4.0, 2.2)]
X_CONE = 450.0                # the nose is split here so each half fits the printer height
CHEEK_X = 332.0               # forward reach of the intake lips

_cache = {}
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
    if "m" in _cache: return _cache["m"]
    return _cache.setdefault("m", _body_master())

def _body_master():
    body = loft([secwire(*s) for s in MID], ruled=False)                                        # a smooth loft through the stations, not straight tapers between them
    # dorsal spine: it starts at the canopy, wraps the lift fan as a raised collar (a longer fan duct for free) and runs aft
    # to the engine, as on the real aircraft, where the fan doors sit on a hump behind the cockpit
    hump = [(298.0, 80.0, 50.0, 45.0), (250.0, 89.0, 60.0, 48.0), (170.0, 89.0, 60.0, 49.0), (110.0, 72.0, 48.0, 50.0), (-10.0, 60.0, 42.0, 50.0), (-139.0, 54.0, 38.0, 48.0)]
    hw = [secwire(x, w, tw, w, top, 14.0, 20.0, 2.3) for x, w, tw, top in hump]
    body = body.union(loft(hw, ruled=False))
    for sg in (-1, 1):                                                                          # wing-root blend: the section swells into the body instead of meeting it at a corner
        body = body.union(wing_panel(WING["root_z"] - 16.0, WING["root_z"] + 30.0, sg, grow=5.0).intersect(
            zbox(WING["root_le"] - 320.0, WING["root_le"] + 20.0, -70.0, 70.0, sg, 0.0, WING["root_z"] + 30.0)))
    body = body.union(cyl("x", NAC_R, X_NOTCH, PLENUM[0], Y_AX, 0))                               # round engine nacelle around the main fan duct
    # intake lips: the body sides run forward of the intake face, swept so the outboard edge leads
    ext = loft([secwire(X_NOSE - 1, *MID[0][1:]), secwire(CHEEK_X, *MID[0][1:])])
    for sg in (-1, 1):
        tri = [(X_NOSE - 1, -sg * 82.0), (X_NOSE - 1, -sg * 109.0), (CHEEK_X, -sg * 109.0)]
        wedge = cq.Workplane("XY").polyline(tri).close().extrude(140).translate((0, 0, -70))
        body = body.union(ext.intersect(wedge))
    # intake mouths: a 44 mm deep recess behind each swept lip, kept above the wire raceway and outboard of the nose joint
    k = 0.955; m0 = MID[0]
    mouth = loft([secwire(x, m0[1] * k, m0[2] * k, m0[3] * k, m0[4] * k - 2.0, m0[5] * k, m0[6], m0[7]) for x in (X_NOSE - 12.0, CHEEK_X + 2.0)])
    for sg in (-1, 1):
        body = body.cut(mouth.intersect(zbox(X_NOSE - 13.0, CHEEK_X + 3.0, -24.0, 60.0, sg, 85.0, 120.0)))
    return body

def nose_bay_cut():
    c = box(NB["x0"], NB["x1"], NB["floor"], NB["top"], -NB["z"], NB["z"])                                   # speed controllers below, flight controller and receiver above
    c = c.union(box(NB["open_x0"], NB["x1"], NB["top"] - 1, 70, -NB["open_z"], NB["open_z"]))                # opening under the canopy
    c = c.union(gear_well("nose")).union(nose_pushrod_cut()).union(nose_doubler_pocket())                    # nose leg well, its pushrod slot and the doubler's seat
    c = c.union(cyl("z", GEAR["pin"], -40.0, 40.0, GEAR["nose"]["x"], pivot_y(GEAR["nose"]["x"])))      # pivot wire through both well walls
    for s in (-1, 1): c = c.union(zbox(X_NOSE - 2, NB["x0"] + 8, WIRE_CH["lip"], NB["floor"] + 1, s, 20, 30))  # the raceway comes in under the floor
    return c

def nose_loft(): return loft([secwire(*s) for s in NOSE])
def nose_solid(): return nose_loft().cut(nose_bay_cut())

def spigot(k):    # PETG plug that joins nose to fan bay
    s0 = NOSE[0]
    a = hexwire(X_NOSE, *s0[1:7], k=k); b = hexwire(X_NOSE - 12.0, *s0[1:7], k=k)
    return loft([b, a])

def wing_le(z): return WING["root_le"] - (z - WING["root_z"]) * TAN(WING["sweep"])
def wing_c(z): return WING["root_c"] + (WING["tip_c"] - WING["root_c"]) * (z - WING["root_z"]) / (WING["tip_z"] - WING["root_z"])
def wing_t(z): return 0.09 + 0.04 * (z - WING["root_z"]) / (WING["tip_z"] - WING["root_z"])

SD7062 = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sd7062.json")))   # wing section chosen in analysis/sizing.py: 14% thick, 4% camber
def wing_foil(z, side, grow=0.0):
    """SD7062 section at span station z, upper surface first. grow fattens it for the root socket. The 30% chord point stays at
    the spar height, so the spar bore sits inside the thickest part of the section."""
    le, c = wing_le(z) + grow, wing_c(z) + 2 * grow; k = 1 + grow / (0.07 * c)
    pts = [(le - c * x, WING["y"] - 0.035 * c + (y - 0.035) * c * k + 0.035 * c, side * z) for x, y in SD7062[:-1]]
    return wire(pts)

def wing_panel(z0, z1, side=1, grow=0.0):
    return loft([wing_foil(z, side, grow) for z in (z0, (z0 + z1) / 2, z1)])

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
        s = i / 12; x = 305 + 214 * s; k = math.sin(math.pi * s ** 0.66)     # a fifth of the aircraft's length, peak ahead of the middle
        cw, ch = max(1.2, 37 * k ** 0.5), max(1.2, 33 * k ** 0.62)
        yb = interp(NOSE, x, 4) - 14
        pts = [(x, yb + 14 + ch * math.sin(a) ** 0.9, cw * math.cos(a)) for a in [math.pi * j / 16 for j in range(17)]]
        ws.append(wire(pts + [(x, yb, -cw), (x, yb, cw)]))
    return loft(ws).cut(nose_loft())

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

def nozzle_drive_cut(s, yb):
    """Right side: slot for the joint-1 gearmotor, open aft. Left side: the nozzle-board bay, open to the belly.
    A channel under the duct carries the motor leads across to the board."""
    if s > 0:
        cd, (x0, x1), w, h = NZ["cd"], NZ["motor_x"], NZ["motor_w"], NZ["motor_h"]
        c = box(X_NOTCH - 1, x1 + 1.5, Y_AX - w / 2 - 0.6, Y_AX + w / 2 + 0.6, DUCT_R - 0.5, cd + h / 2 + 0.6)       # motor and the web under it
        return c.union(box(x1 - 6, x1 + 1.5, yb, Y_AX - w / 2, cd - 4, cd + 4))                              # leads drop to the channel
    b = NZ["board"]
    c = box(b["x"][0], b["x"][1], yb, b["y"][1], -b["z"][1], -b["z"][0])
    return c.union(box(NZ["motor_x"][1] - 6, NZ["motor_x"][1] + 1.5, yb, Y_AX - DUCT_R - 3, -b["z"][0] - 2, NZ["cd"]))   # channel under the duct

def fuselage_cuts():
    yb = -60.0
    c = longeron_bores().union(cyl("y", FAN_R, -70, 70, FAN_X, 0))                               # lift-fan duct, sized for the shroud ring
    c = c.union(cq.Workplane("XY").circle(FAN_R + 5.2).workplane(offset=-5.2).circle(FAN_R).loft().translate((FAN_X, 0, MID[1][4])))   # seat for the ring lip
    c = c.union(cq.Workplane("XY").circle(FAN_R + 5.2).workplane(offset=16.0).circle(FAN_R + 10.5).loft().translate((FAN_X, 0, MID[1][4] - 0.01)))   # bellmouth through the spine collar above the ring: the ring still drops in from the top
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
        lo, hi = sorted((s * 82.0, s * 109.0)); c = c.union(box(X_NOSE - 8, X_NOSE + 2, -40.0, -3.0, lo, hi))   # intake mouths
        for dx in (-50, 50):                                                                     # fan spider: clips + arms
            c = c.union(clip_pocket(FAN_X + dx, 8.2, s, yb)).union(bar((FAN_X, 0), (FAN_X + dx, s * (LZ - 2)), 11.0, yb, -11.0))
        c = c.union(clip_pocket(SPAR_X, 15.6, s, yb))                                            # spar carrier block
        lo, hi = sorted((s * (LZ - 11.5), s * (LZ + 11.5))); c = c.union(box(SPAR_X - 15.6, SPAR_X + 15.6, yb, -2.4, lo, hi))
        lo, hi = sorted((s * 78.0, s * 110.0)); c = c.union(box(SPAR_X - 4, SPAR_X + 4, CAV["floor"], -15.2, lo, hi))   # roll-motor wires under the spar
        c = c.union(gear_well("main", s)).union(gear_bay(s)).union(main_servo_cut(s))            # main leg well, the bay its bracket sits in, its servo pocket
        c = c.union(clip_pocket(GEAR["main"]["x"][0 if s > 0 else 1], 16.0, s, yb))
        c = c.union(wire_channel(s))
        sx = STAB_SERVO_X - s * SV_SHAFT_OFF                                                     # tail servo, dropped in from below
        lo, hi = sorted((s * (STAB["root_z"] - 14 - 6.5), s * (STAB["root_z"] - 14 + 6.5)))
        c = c.union(box(sx - 11.8, sx + 11.8, yb, -7.5, lo, hi)).union(box(sx - 16.8, sx + 16.8, yb, interp(MID, STAB_SERVO_X, 5) + 2.6, lo, hi))
        lo, hi = sorted((s * 80.0, s * 112.0)); c = c.union(cyl("z", 1.65, lo, hi, STAB["pivot_x"], STAB["y"]))   # tail pivot wire
        lo, hi = sorted((s * 56.0, s * 86.0)); c = c.union(box(X_NOTCH - 2, CAV["x0"] + 2, -19.0, -9.0, lo, hi))  # wire run to the tail
        c = c.union(nozzle_drive_cut(s, yb))
        c = c.union(wing_panel(WING["root_z"] - WING["bury"] - 0.4, WING["mid_z"], s, grow=0.35))  # wing root socket
    c = c.union(box(CAV["x1"] - 2, FAN_X - FAN_R + 6, -19.0, -11.0, -9, 9))                      # wire run to the fan motor
    return c

def fuselage_all():
    if "f" not in _cache: _cache["f"] = body_master().cut(fuselage_cuts())
    return _cache["f"]

def trim_fins(w):
    """The fin sockets are cut from the finished module, not unioned into the big cut compound: in the compound the solver
    quietly dropped them and the fins ended up buried in solid tail booms. Cutting the multi-solid body instead empties it."""
    for s in (-1, 1): w = w.cut(fin(s, grow=0.3))
    return w

def slab(x0, x1, z0=-200, z1=200, y0=-100, y1=100): return box(x0, x1, y0, y1, z0, z1)
def fanbay(): return fuselage_all().intersect(slab(X_FAN0, CHEEK_X + 1))
def tray(): return fuselage_all().intersect(slab(X_TRAY0, X_FAN0))
def aft_bridge(): return trim_fins(fuselage_all().intersect(slab(X_BRIDGE0, X_TRAY0)))
def boom(side): return trim_fins(fuselage_all().intersect(slab(X_AFT, X_BRIDGE0, *sorted((side * 1.0, side * 200.0)))))
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

def belly_y(x):
    return interp(NOSE, x, 5) if x > X_NOSE else interp(MID, x, 5)

def pivot_y(x):
    """Hinge height: with the leg folded flat the blade lies along the belly, so the hinge sits half a blade width inside it."""
    return belly_y(x) + GEAR["blade_w"] / 2 + 0.6

def gear_blade(length, lean=0.0):
    """One leg, DOWN, about a pivot at the origin. The blade lies in the X-Y plane (thickness along Z) and runs down
    the -Y axis; `lean` shifts the foot in +X so a leg can splay. Hub bore takes a 3 mm wire; a horn stands off one face."""
    g = GEAR; w, t, hr = g["blade_w"], g["blade_t"], g["hub_r"]
    foot = -length + g["pad_t"]
    plate = cq.Workplane("XZ").polyline([(-hr + 0.5, 0.0), (hr - 0.5, 0.0), (w * 0.36 + lean, foot), (-w * 0.36 + lean, foot)]).close().extrude(t)
    s = W_(plate.val()).translate((0, -t / 2, 0))
    s = s.union(cyl("z", hr, -t / 2, t / 2, 0.0, 0.0))                                             # pivot hub
    s = s.union(box(lean - w / 2, lean + w / 2, -length, foot + 1.0, -g["pad_l"] / 2, g["pad_l"] / 2))   # foot pad, wide across the slot
    s = s.cut(cyl("z", g["pin"], -w, w, 0.0, 0.0))                                                 # pivot wire
    s = s.union(box(-5.0, 5.0, -28.0, -19.0, t / 2, t / 2 + 3.2))                                  # horn
    return s.cut(cyl("z", 0.7, t / 2 - 1, t / 2 + 5, 0.0, -23.5))                                  # pushrod eye

def gear_nose():
    """Swings about a Z axis under the nose: down for landing, aft and flat into the belly slot when it folds."""
    n = GEAR["nose"]; y = pivot_y(n["x"])
    return gear_blade(y - GROUND_Y).translate((n["x"], 0.0, y))      # translate is in CadQuery axes: (x, -z, y)

def gear_main(side):
    """Swings about an X axis at the belly edge, splayed out when down and folded inboard across the belly when up."""
    m = GEAR["main"]; i = 0 if side > 0 else 1; x, y = m["x"][i], pivot_y(m["x"][i])
    # rotations are in CadQuery axes: its Z is aircraft +Y, its X is aircraft +X
    splay = math.degrees(math.atan2(m["foot_z"] - m["z"], y - GROUND_Y))                              # foot leans outboard, so the leg locks against its down-stop
    s = gear_blade((y - GROUND_Y) / math.cos(math.radians(splay))).rotate((0, 0, 0), (0, 0, 1), 90)    # blade now lies in the Y-Z plane
    s = s.rotate((0, 0, 0), (1, 0, 0), -side * splay)
    return s.translate((x, -side * m["z"], y))                       # translate is in CadQuery axes: (x, -z, y)

def gear_well(which, s=1):
    """Space the folded leg sweeps through, cut from the belly. The slot mouth is as wide as the blade; above the lip it is wider,
    so the cover-less blade cannot fall out sideways and the T-shaped shoulders take the landing load."""
    g = GEAR; w, d, lip = g["blade_w"], g["slot_d"], g["lip"]
    if which == "nose":
        n = g["nose"]; x0, x1 = n["x"] - (pivot_y(n["x"]) - GROUND_Y) - 8.0, n["x"] + g["hub_r"] + 3.0
        c = box(x0, x1, -62.0, belly_y(n["x"]) + d, -w / 2 - 1.2, w / 2 + 1.2)
        return c.union(box(x0 + 6.0, x1 - 4.0, belly_y(n["x"]) + d - lip, belly_y(n["x"]) + d, -w / 2 - 5.0, w / 2 + 5.0))
    m = g["main"]; x = m["x"][0 if s > 0 else 1]
    reach = math.hypot(m["foot_z"] - m["z"], pivot_y(x) - GROUND_Y)                # folded flat, the foot passes 35 mm over the centreline
    lo, hi = sorted((s * (m["z"] - reach - 8.0), s * (m["foot_z"] + 6.0)))
    c = box(x - w / 2 - 1.2, x + w / 2 + 1.2, -62.0, belly_y(x) + d, lo, hi)
    return c.union(box(x - w / 2 - 5.0, x + w / 2 + 5.0, belly_y(x) + d - lip, belly_y(x) + d, lo, hi))

def gear_bay(s):
    """The space the main-leg bracket and its servo occupy inside the body, reached through the leg well."""
    g = GEAR; x = g["main"]["x"][0 if s > 0 else 1]
    lo, hi = sorted((s * 38.0, s * (LZ + 4.0)))
    return box(x - 16.0, x + 16.0, -62.0, -4.0, lo, hi)

def main_servo_cut(s):
    """Pocket for one main-leg servo, shaft along X so its horn swings in the same plane as the leg. It goes in from the
    belly through the leg well, and sits above the folded blade."""
    g = GEAR; i = 0 if s > 0 else 1; x = GEAR_SERVO["main_x"][i] + 16.0
    zc = s * 58.0
    lo, hi = sorted((zc - s * 13.0, zc + s * 13.0))
    c = box(x - 12.0, x + 12.0, -20.0, -2.0, lo, hi)
    for k in (-1, 1): c = c.union(cyl("x", SV_PILOT / 2, x - 14.0, x + 14.0, -11.0, zc + s * k * SV_HOLE_PITCH / 2))
    return c

def nose_pushrod_cut():
    """Slot from the nose-bay floor down into the leg well for the pushrod of the nose-leg servo."""
    x = GEAR_SERVO["nose_x"]
    return box(x - 6.0, x + 10.0, belly_y(x) + 2.0, NB["floor"] + 2.0, -5.0, 5.0)

def nose_doubler_pocket():
    g, n = GEAR, GEAR["nose"]; y = pivot_y(n["x"]); w = g["blade_w"]
    return box(n["x"] - 11.0, n["x"] + 11.0, y - 3.0, y + 11.0, -w / 2 - 7.0, w / 2 + 7.0)

def wire_channel(s):
    """Raceway cut: a T-slot in the belly from the nose joint back to the battery bay, plus the drop into the bay."""
    W = WIRE_CH
    c = zbox(W["x0"], W["x1"], -62.0, W["roof"], s, W["z0"], W["z1"])
    c = c.union(zbox(W["x0"], W["x1"], W["lip"], W["roof"], s, W["zt0"], W["zt1"]))
    c = c.union(zbox(W["x0"], W["x0"] + 14.0, -62.0, CAV["floor"] + 1.0, s, W["z0"] - 6.0, W["z1"]))        # into the battery bay
    c = c.union(zbox(X_NOSE - 22.0, X_NOSE + 1.0, W["lip"], W["roof"], s, 20.0, W["z1"]))                   # across into the nose bay
    return c

def wire_cover(s, part):
    """The strip that closes one raceway: belly skin plus two flanges that slide into the T-slot. Two per side, end to end."""
    W = WIRE_CH
    x0, x1 = (W["x0"] + 0.5, W["split"]) if part == 0 else (W["split"] + 0.5, W["x1"] - 0.5)
    skin = body_master().intersect(zbox(x0, x1, -62.0, W["skin"], s, W["z0"] + 0.4, W["z1"] - 0.4))
    flange = zbox(x0, x1, W["lip"] + 0.4, W["lip"] + 1.9, s, W["zt0"] + 0.4, W["zt1"] - 0.4)
    web = zbox(x0, x1, W["skin"] - 0.1, W["lip"] + 1.9, s, W["z0"] + 0.4, W["z1"] - 0.4)
    return skin.union(web).union(flange)

def gear_up(which, side=1):
    """A leg swung into its well, to check the well is big enough. Rotations are in CadQuery axes."""
    g = GEAR
    if which == "nose":
        n = g["nose"]; y = pivot_y(n["x"])
        return gear_nose().rotate((n["x"], 0.0, y), (n["x"], 1.0, y), g["retract"])
    m = g["main"]; i = 0 if side > 0 else 1; x, y = m["x"][i], pivot_y(m["x"][i])
    splay = math.degrees(math.atan2(m["foot_z"] - m["z"], y - GROUND_Y))
    return gear_main(side).rotate((x, -side * m["z"], y), (x + 1.0, -side * m["z"], y), side * (g["retract"] + splay))

def gear_bracket(side):
    """Carries one main leg. Clips up onto its longeron through a pocket in the belly, exactly where a skid used to,
    so landing loads go into the tube and the centre section stays locked fore and aft."""
    g, m = GEAR, GEAR["main"]; i = 0 if side > 0 else 1
    x, z, y = m["x"][i], side * m["z"], pivot_y(m["x"][i])
    # Everything sits on one side of the blade, so the leg's horn and pushrod have the other side clear.
    x0, x1 = x - 12.0, x - g["blade_t"] / 2 - 0.6
    add, cut = clip(x0, x1, side * LZ, -8.0)
    lo, hi = sorted((z - 3.0, side * (LZ + 3.0)))
    body = add.union(box(x0, x1, y - 3.0, -6.0, lo, hi))                                    # web from the clip down to the pivot
    body = body.union(cyl("x", g["hub_r"] + 5.0, x0, x1, y, z))                             # cheek the pivot wire bears in
    cut = cut.union(cyl("x", g["pin"], x0 - 2.0, x + 6.0, y, z))
    return body.cut(cut)

def gear_mount_nose():
    """PETG doubler glued into the roof of the nose-leg well: the pivot wire runs through it, not through soft LW-PLA."""
    g, n = GEAR, GEAR["nose"]; y = pivot_y(n["x"]); w = g["blade_w"]
    b = nose_doubler_pocket()
    b = b.cut(box(n["x"] - 12.0, n["x"] + 12.0, y - 4.0, y + 12.0, -w / 2 - 0.6, w / 2 + 0.6))       # the blade swings through this slot
    b = b.cut(cyl("z", g["hub_r"] + 0.7, -w / 2 - 1.0, w / 2 + 1.0, n["x"], y))                      # and its hub turns here
    return b.cut(cyl("z", g["pin"], -40.0, 40.0, n["x"], y))

def battery_tray():  # slides fore-aft on the bay floor; strap slots
    x, y = BATT_X, CAV["floor"]
    b = box(x - 71, x + 71, y + 0.4, y + 2.4, -25, 25)
    for s in (-1, 1):
        lo, hi = sorted((s * 23.0, s * 25.0)); b = b.union(box(x - 71, x + 71, y + 0.4, y + 9.0, lo, hi))
    b = b.union(box(x + 68, x + 71, y + 0.4, y + 10.0, -25, 25))
    for xx in (x - 30, x + 30): b = b.cut(box(xx - 11, xx + 11, y - 1, y + 4, -22, -18)).cut(box(xx - 11, xx + 11, y - 1, y + 4, 18, 22))
    return b

def fc_sled():       # carries the ESP32 (47 x 23.5 mm hole pattern) and the gyro board; stands on four legs over the speed controllers
    y = NB["floor"] + 17.0; x0, x1 = NB["x0"] + 4.0, NB["x1"] - 4.0; xm = (x0 + x1) / 2
    b = box(x0, x1, y, y + 2.0, -NB["z"] + 2.2, NB["z"] - 2.2)
    for xx in (x0 + 4, x1 - 4):
        for s in (-1, 1): b = b.union(zbox(xx - 4, xx + 4, NB["floor"] + 0.4, y, s, NB["z"] - 5.6, NB["z"] - 2.2))
    for dx in (-23.5, 23.5):
        for dz in (-11.75, 11.75): b = b.union(cyl("y", 1.3, y + 2.0, y + 6.0, x0 + 30.0 + dx, dz))
    for dz in (-7.62, 7.62): b = b.union(cyl("y", 1.3, y + 2.0, y + 5.0, x1 - 12, dz))
    return b.cut(box(xm - 30, xm + 30, y - 1, y + 3, -6, 6))             # slot for the wires coming up from below

LW, PETG_D = 0.62e-3, 1.27e-3
# name: (builder, twin id, pivot, print rotation, material)
ROT_UP = ((0, 1, 0), -90)      # stand the part on its tail: aircraft +X becomes printer up
PARTS = {
    "spar_carrier": (spar_carrier, "sparCarrier", (0, 0, 0), None, "PETG"),
    "fan_spider": (fan_spider, "fanSpider", (0, 0, 0), None, "PETG"),
    "roll_mount_right": (lambda: roll_pod(1), "podR", (0, 0, 0), ((1, 0, 0), 180), "PETG"),
    "roll_mount_left": (lambda: roll_pod(-1), "podL", (0, 0, 0), ((1, 0, 0), 180), "PETG"),
    "gear_leg_nose": (gear_nose, "gearNose", (GEAR["nose"]["x"], pivot_y(GEAR["nose"]["x"]), 0), ((0, 1, 0), -90), "PETG"),
    "gear_leg_right": (lambda: gear_main(1), "gearMainR", (GEAR["main"]["x"][0], pivot_y(GEAR["main"]["x"][0]), GEAR["main"]["z"]), ((0, 1, 0), -90), "PETG"),
    "gear_leg_left": (lambda: gear_main(-1), "gearMainL", (GEAR["main"]["x"][1], pivot_y(GEAR["main"]["x"][1]), -GEAR["main"]["z"]), ((0, 1, 0), -90), "PETG"),
    "gear_bracket_right": (lambda: gear_bracket(1), "gearBktR", (0, 0, 0), ROT_UP, "PETG"),
    "gear_bracket_left": (lambda: gear_bracket(-1), "gearBktL", (0, 0, 0), ROT_UP, "PETG"),
    "gear_mount_nose": (gear_mount_nose, "gearMountN", (0, 0, 0), ROT_UP, "PETG"),
    "wire_cover_right_fwd": (lambda: wire_cover(1, 1), "coverRF", (0, 0, 0), ROT_UP, "LW-PLA"),
    "wire_cover_right_aft": (lambda: wire_cover(1, 0), "coverRA", (0, 0, 0), ROT_UP, "LW-PLA"),
    "wire_cover_left_fwd": (lambda: wire_cover(-1, 1), "coverLF", (0, 0, 0), ROT_UP, "LW-PLA"),
    "wire_cover_left_aft": (lambda: wire_cover(-1, 0), "coverLA", (0, 0, 0), ROT_UP, "LW-PLA"),
    "battery_tray": (battery_tray, "batteryTray", (BATT_X, 0, 0), None, "PETG"),
    "fc_sled": (fc_sled, "fcSled", (0, 0, 0), None, "PETG"),
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

def nozzle_motor_env():
    (x0, x1), w, h = NZ["motor_x"], NZ["motor_w"], NZ["motor_h"]
    return box(x0, x1, Y_AX - w / 2, Y_AX + w / 2, NZ["cd"] - h / 2, NZ["cd"] + h / 2)

def envelopes():
    return {
        "longerons": cyl("x", TUBE / 2, TUBE_REAR, TUBE_FRONT, 0, -LZ).union(cyl("x", TUBE / 2, TUBE_REAR, TUBE_FRONT, 0, LZ)),
        "spar": cyl("z", TUBE / 2, -SPAR_HALF, SPAR_HALF, SPAR_X, SPAR_Y),
        "lift fan rotor": cyl("y", 70.2, -6.0, 24.0, FAN_X, 0),
        "lift fan shroud ring": cyl("y", LIFT_HOLE_R - 0.2, -4.0, MID[1][4] - 5.5, FAN_X, 0).cut(cyl("y", 70.6, -10, 60, FAN_X, 0)),
        "main fan duct": cyl("x", DUCT_R - 0.3, X_J1, PLENUM[0] + 4, Y_AX, 0),
        "roll propeller discs": cyl("y", 65.0, ROLL_PROP_Y - 4, ROLL_PROP_Y + 4, ROLL_X, -ROLL_Z).union(cyl("y", 65.0, ROLL_PROP_Y - 4, ROLL_PROP_Y + 4, ROLL_X, ROLL_Z)),
        "roll motor bodies": cyl("y", 14.4, ROLL_PAD_Y + 0.3, ROLL_PROP_Y - 5, ROLL_X, -ROLL_Z).union(cyl("y", 14.4, ROLL_PAD_Y + 0.3, ROLL_PROP_Y - 5, ROLL_X, ROLL_Z)),
        "lift-fan speed controller": box(NB["x0"] + 2, NB["x0"] + 36, NB["floor"] + 0.5, NB["floor"] + 7.5, -11.0, 11.0),
        "main and roll speed controllers": cq.Workplane("XY").newObject([]).union(
            box(ESC_BAY["x"] - 17, ESC_BAY["x"] + 17, CAV["floor"] + 0.5, CAV["floor"] + 6.5, ESC_BAY["z"][0] - 10, ESC_BAY["z"][1] + 10)).union(
            box(ESC_BAY["x"] - 17, ESC_BAY["x"] + 17, CAV["floor"] + 0.5, CAV["floor"] + 6.5, -ESC_BAY["z"][1] - 10, -ESC_BAY["z"][0] + 10)),
        "joint-1 nozzle motor": nozzle_motor_env(),
        "nozzle board": (lambda b: box(b["x"][0] + 1, b["x"][1] - 1, b["y"][0], b["y"][1] - 1, -b["z"][1] + 0.5, -b["z"][0] - 0.5))(NZ["board"]),
        "battery": box(BATT_X - 56.0, BATT_X + 56.0, CAV["floor"] + 2.5, CAV["floor"] + 28.5, -19.0, 19.0),
        "gear legs down": gear_nose().union(gear_main(1)).union(gear_main(-1)),
        "gear legs up": gear_up("nose").union(gear_up("main", 1)).union(gear_up("main", -1)),
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
            if en.startswith("gear legs") and name.startswith("gear_leg"): continue            # a leg is allowed inside its own swept volume
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
