"""Printed 80 mm ducted fan for the EMAX 2306 motor and a three-bearing swivel nozzle that sits flush with the body.
Nothing rides on the nozzle but cords: two MG90S servos buried in the aft body pull them (see docs/ducted-propulsion.md).
Run: python3 cad/propulsion.py

Kit frame: +X is the flow direction (aft), +Y up, +Z right. x = 0 is the first nozzle bearing.
Everything here is a first design to be printed, run on the thrust stand and corrected.
The joint maths lives in site/js/nozzle.js; ALPHA and the cord radii must match it.
"""
import json, math, os, shutil, sys, time
import cadquery as cq
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B
from build import box, cyl, W_, naca

# ------------------------------------------------------------------ parameters
BORE = 80.0                 # fan diameter
TIP_GAP = 0.6               # blade tip to shroud
SHROUD_ID, WALL = BORE + 2 * TIP_GAP, 2.2
HUB_R = 17.0                # rotor hub radius (covers the 28.6 mm motor bell)
BELL_R = 15.3               # clearance bore over the bell
N_BLADES, N_VANES = 7, 5
RPM, V_AXIAL = 18000.0, 37.6    # design point: about 0.7 kg static thrust
X_ROTOR0, X_WEB0, X_WEB1, X_SKIRT1 = -97.0, -76.0, -68.0, -46.0
X_MOTOR_FACE, X_STATOR1, X_DUCT0 = -44.0, -14.0, -100.0
ALPHA = 40.0                # cant of bearings 2 and 3  (site/js/nozzle.js NOZZLE.alpha)
DJ = BORE / math.sqrt(math.cos(math.radians(ALPHA)))   # bore at a canted bearing: same flow area as the round duct
NW = 1.3                    # nozzle wall
FL_W, FL_T, LEG = 6.0, 3.0, 3.5  # bearing flange width and thickness; how far the collar legs reach down the flange faces
L1, L2, L3 = 58.0, 104.0, 56.0     # long enough that the canted bearings and their collars clear each other on the short side of each wedge
JOINTS = [(0.0, 0.0, BORE + 2 * TIP_GAP), (L1, ALPHA, DJ), (L1 + L2, -ALPHA, DJ)]   # x, tilt about Z, bore
BELL = 6.0                  # bellmouth flare
NECK_UP, NECK_DN = 10.0, 7.0    # straight length of tube each side of a canted bearing, so collars and cord bands sit on a true cylinder
R_J1, R_J = (BORE + 2 * TIP_GAP) / 2 + FL_W, DJ / 2 + FL_W     # flange radius at bearing 1 and at the canted bearings
G_W, G_D, CORD = 1.4, 1.2, 0.3  # cord groove width and depth; the cord centre rides 0.3 above the groove floor
R_BAND1 = R_J1 + 2.6 - G_D + CORD          # cord radius on the bearing-1 collar            (NOZZLE.cord.band1)
R_COLLAR = R_J + 2.6 - G_D + CORD          # cord radius on the bearing-2 and -3 collars    (NOZZLE.cord.collar)
RING_ID, RING_W, RING_X = R_J1 + 0.6, 6.6, FL_T + 2.2 + 0.5      # free drive ring: slips over the bearing-1 flange, rides on segment 1
R_RING = RING_ID + 2.5 + CORD              # cord radius on the drive ring                 (NOZZLE.cord.ring)
DRUM_R, DRUM_T = B.NZ["drum_r"], B.NZ["drum_t"]                  # servo drum cord radius  (NOZZLE.cord.drum)
SHORT = (0.0, 180.0, 180.0)                # clock angle of the short side of the wedge at each bearing, seen from its downstream part

def revolve(profile):       # profile: [(x, r)] revolved about X
    return cq.Workplane("XY").polyline(profile).close().revolve(360, (0, 0, 0), (1, 0, 0))

def rot_x(s, deg): return s.rotate((0, 0, 0), (1, 0, 0), deg)
def tilt_z(s, deg, x0=0.0):  # rotate about the kit Z axis through (x0, 0, 0); +deg turns +X toward +Y
    return s.rotate((x0, 0, 0), (x0, -1, 0), deg)
def place(s, j):            # canonical bearing frame (plane x = 0, normal +X) -> bearing j
    x, tilt, _ = JOINTS[j]
    return tilt_z(s.translate((x, 0, 0)), tilt, x)

def circle_wire(x, tilt, r):
    c = cq.Vector(x, 0, 0); t = math.radians(tilt)
    n = cq.Vector(math.cos(t), 0, math.sin(t))      # kit (cos, sin, 0) in CadQuery axes (x, -z, y)
    return cq.Wire.makeCircle(r, c, n)

def circle_at(x, tilt, r, s=0.0):       # circle of bearing (x, tilt), moved s along the bearing normal
    t = math.radians(tilt); n = cq.Vector(math.cos(t), 0, math.sin(t))
    return cq.Wire.makeCircle(r, cq.Vector(x, 0, 0) + n * s, n)

def seg_tube(k, extra):     # wall (or, with extra = 0, the bore) of nozzle segment k: a straight neck at each canted bearing, lofted between
    xa, ta, da = JOINTS[k]
    xb, tb, db = JOINTS[k + 1] if k < 2 else (L1 + L2 + L3, 0.0, 74.0)             # slightly convergent exit
    secs = [circle_at(xa, ta, da / 2 + extra)]
    if ta: secs.append(circle_at(xa, ta, da / 2 + extra, NECK_DN))
    if tb: secs.append(circle_at(xb, tb, db / 2 + extra, -NECK_UP))
    secs.append(circle_at(xb, tb, db / 2 + extra))
    return W_(cq.Solid.makeLoft(secs, True))      # ruled: the necks come out as true cylinders

# ------------------------------------------------------------------ fan
def blade_section(r, pitch_deg, chord, thick, xc, hand=1, n=16):
    """aerofoil wrapped on the cylinder of radius r; the blade moves toward -phi (hand=1), leading edge first"""
    th = math.radians(pitch_deg)
    xs = [(1 - math.cos(math.pi * i / n)) / 2 for i in range(n + 1)]
    def pt(u, t):
        camber = 0.04 * chord * 4 * u * (1 - u)
        s = (u - 0.5) * chord * math.sin(th) + (t - camber) * math.cos(th)      # axial
        tt = hand * ((u - 0.5) * chord * math.cos(th) - (t - camber) * math.sin(th))     # tangential
        phi = tt / r
        return cq.Vector(xc + s, -r * math.sin(phi), r * math.cos(phi))
    up = [pt(u, naca(u, thick) * chord) for u in xs]
    lo = [pt(u, -naca(u, thick) * chord) for u in xs[-2:0:-1]]
    return cq.Wire.makePolygon(up + lo, close=True)

def rotor(bore, blades, rpm, v_axial, chord0, chord1, skirt_end, hand=1):
    """Fan rotor that clamps on the 2306's M5 shaft like a propeller. Flow is along +X; the motor sits downstream
    inside the skirt. hand=-1 mirrors the blades for the opposite direction of rotation."""
    omega = rpm * 2 * math.pi / 60; tip = bore / 2; xc = (X_WEB0 + X_WEB1) / 2 - 2.0
    radii = [HUB_R - 1.5, HUB_R + 5, (HUB_R + tip) / 2, tip - 4, tip + 1.5]
    secs = []
    for r in radii:
        u = min(max((r - HUB_R) / (tip - HUB_R), 0), 1)
        beta = math.degrees(math.atan2(v_axial, omega * max(r, HUB_R) / 1000))
        secs.append(blade_section(r, beta + 5.0, chord0 + (chord1 - chord0) * u, 0.10 - 0.04 * u, xc, hand))
    blade = W_(cq.Solid.makeLoft(secs, True)).intersect(cyl("x", tip, X_ROTOR0 - 5, X_SKIRT1 + 5, 0, 0))
    hub = revolve([(X_ROTOR0, 0), (X_ROTOR0, 6.5), (X_ROTOR0 + 3, 11.5), (X_ROTOR0 + 8, 15.3), (X_ROTOR0 + 14, HUB_R), (skirt_end, HUB_R), (skirt_end, 0)])
    body = hub
    for i in range(blades):
        body = body.union(rot_x(blade, 360.0 * i / blades))
    cut = cyl("x", BELL_R, X_WEB1, skirt_end + 1, 0, 0)                          # skirt over the motor bell
    cut = cut.union(cyl("x", 2.6, X_ROTOR0 - 1, X_WEB1 + 1, 0, 0))               # M5 motor shaft
    cut = cut.union(cyl("x", 6.2, X_ROTOR0 - 1, X_WEB0, 0, 0))                   # pocket for the propeller nut and a socket
    return body.cut(cut)

def impeller():             # main fan: 80 mm, 7 blades, about 18,000 rpm
    return rotor(BORE, N_BLADES, RPM, V_AXIAL, 21.0, 26.0, X_SKIRT1)

# lift fan: bigger and slower. Sized by motor torque: about 20 A in the hover at 13,500 rpm.
LIFT_BORE, LIFT_BLADES, LIFT_RPM, LIFT_V = 120.0, 9, 13500.0, 26.0
LIFT_SKIRT = -52.0
def lift_rotor():
    return rotor(LIFT_BORE, LIFT_BLADES, LIFT_RPM, LIFT_V, 22.0, 30.0, LIFT_SKIRT, hand=-1)

LIFT_RING_ID, LIFT_RING_WALL = LIFT_BORE + 2 * TIP_GAP, 1.6
def lift_ring():            # hard, round shroud pressed into the soft body: sets the blade tip gap
    r0, r1 = LIFT_RING_ID / 2, LIFT_RING_ID / 2 + LIFT_RING_WALL
    return revolve([(X_ROTOR0 - 1, r0 + 5), (X_ROTOR0 + 4, r0), (-56, r0), (-56, r1), (X_ROTOR0 + 5, r1), (X_ROTOR0 - 1, r1 + 5)])

def flange(j, side):        # bearing flange ring in the canonical frame: side -1 upstream, +1 downstream
    r = JOINTS[j][2] / 2
    x0, x1 = (-FL_T, 0.0) if side < 0 else (0.0, FL_T)
    return cyl("x", r + FL_W, x0, x1, 0, 0)

def key(j):                 # rib behind the downstream flange: it fills a notch in the collar, so the collar turns with the downstream part
    r = JOINTS[j][2] / 2
    return rot_x(box(FL_T - 0.1, FL_T + 2.3, r - 1.0, r + FL_W - 0.6, -3.0, 3.0), SHORT[j])

def sector(a0, a1, x0=-30.0, x1=30.0, r=200.0):      # wedge between two clock angles (degrees from +Y toward +Z), for trimming
    n = max(2, int(abs(a1 - a0) / 6) + 1)
    pts = [(0.0, 0.0)] + [(-r * math.sin(math.radians(a0 + (a1 - a0) * i / n)), r * math.cos(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return cq.Workplane("YZ").polyline(pts).close().extrude(x1 - x0).translate((x0, 0, 0))

def post(x0, x1, r0, r1, clock, w=5.0):      # eyelet post: the cord runs through the hole near its top, along the circumference
    p = box(x0, x1, r0, r1, -w / 2, w / 2)
    return rot_x(p, clock), rot_x(cyl("z", 0.9, -w, w, (x0 + x1) / 2, r1 - 1.9), clock)

def annulus(x0, x1, r0, r1): return revolve([(x0, r0), (x0, r1), (x1, r1), (x1, r0)])

def fan_duct():
    r0, r1 = SHROUD_ID / 2, SHROUD_ID / 2 + WALL
    shell = revolve([(X_DUCT0, r0 + BELL), (X_DUCT0 + BELL, r0), (0, r0), (0, r1), (X_DUCT0 + BELL + 3, r1), (X_DUCT0, r1 + BELL)])   # 45 degree bellmouth
    hubcup = revolve([(X_MOTOR_FACE, 0), (X_MOTOR_FACE, HUB_R), (X_STATOR1, HUB_R), (X_STATOR1, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, 0)])
    body = shell.union(hubcup)
    for i in range(N_VANES):                                                    # straightening vanes; the widest one carries the wires
        t = 5.0 if i == 0 else 2.4
        v = box(X_MOTOR_FACE + 1, X_STATOR1 - 1, HUB_R - 1, r0 + 1, -t / 2, t / 2)
        body = body.union(rot_x(v, 360.0 * i / N_VANES + 36))
    body = body.union(flange(0, -1))
    cut = (cyl("x", r0, X_DUCT0 + BELL, 1, 0, 0).cut(cyl("x", HUB_R, X_MOTOR_FACE, X_STATOR1, 0, 0)).cut(cyl("x", r0 + 5, X_MOTOR_FACE + 1, X_STATOR1 - 1, 0, 0)))
    cut = cut.union(B.motor_holes("x", X_MOTOR_FACE - 1, X_MOTOR_FACE + 5, 0, 0))
    cut = cut.union(rot_x(box(X_MOTOR_FACE + 5, X_STATOR1 - 5, 8, r1 + 3, -1.6, 1.6), 36))      # wire slot through the wide vane
    return body.cut(cut)

def tail_cone():
    c = revolve([(X_STATOR1 - 6, HUB_R - 2.5), (X_STATOR1, HUB_R - 2.5), (X_STATOR1, HUB_R), (X_STATOR1 + 16, 11), (X_STATOR1 + 28, 3), (X_STATOR1 + 30, 1.2), (X_STATOR1 + 30, 0), (X_STATOR1 - 6, 0)])
    return c.cut(revolve([(X_STATOR1 - 7, 0), (X_STATOR1 - 7, HUB_R - 4.3), (X_STATOR1 + 12, 9), (X_STATOR1 + 22, 1.2), (X_STATOR1 + 22, 0)]))

def segment(k):
    """nozzle segment k (0, 1, 2): downstream half of bearing k, upstream half of bearing k + 1 (or the exit).
    No servo, no gear: only flanges, a key for the collar, and small posts and bands that guide the cords."""
    body = seg_tube(k, NW).union(place(flange(k, 1), k)).union(place(key(k), k))
    cut = seg_tube(k, 0.0)
    def add(shape, hole, j):
        nonlocal body, cut
        body = body.union(place(shape, j)); cut = cut.union(place(hole, j)) if hole is not None else cut
    if k < 2: body = body.union(place(flange(k + 1, -1), k + 1))
    if k == 0:
        body = body.union(annulus(RING_X - 0.1, RING_X + RING_W + 0.3, 30.0, RING_ID - 0.3))               # sleeve the drive ring turns on
        for cl in (120, 240): body = body.union(rot_x(box(RING_X + RING_W + 0.4, RING_X + RING_W + 2.2, 30.0, RING_ID + 1.6, -3, 3), cl))   # keep the ring on
        for sg in (-1, 1):
            add(*post(RING_X + RING_W + 0.5, RING_X + RING_W + 3.9, 30.0, R_RING + 1.9, sg * 20), 0)        # cords leave the drive ring here ...
            add(*post(-FL_T - 2.2 - 4.4, -FL_T - 2.2 - 0.8, 30.0, R_COLLAR + 1.9, sg * 20), 1)              # ... cross the short side, and reach the bearing-2 collar here
        x0, x1 = -FL_T - 2.2 - 3.6, -FL_T - 2.2 - 0.6                                                      # slave band: a sector on the long side
        band = annulus(x0, x1, 30.0, R_COLLAR - CORD + G_D).cut(annulus(x0 + 0.8, x1 - 0.8, R_COLLAR - CORD, 80.0)).intersect(sector(145, 300))
        holes = rot_x(cyl("x", 0.75, x0 - 1, x1 + 1, R_COLLAR - 3.5, 0), 151).union(rot_x(cyl("x", 0.75, x0 - 1, x1 + 1, R_COLLAR - 3.5, 0), 294))
        add(band, holes, 1)
    if k == 1:
        for sg in (-1, 1): add(*post(-FL_T - 2.2 - 4.4, -FL_T - 2.2 - 0.8, 30.0, R_COLLAR + 1.9, 180 + sg * 20), 2)   # slave cords reach the bearing-3 collar here
    return body.cut(cut)

def collar_half(rf=None, bosses=True):
    """Half of a bearing collar. Two halves clamp the pair of flanges; a zip tie sits in the middle groove.
    The collar is also a cord pulley: one groove on each shoulder, slits to knot the cords in, a notch for the segment's key."""
    rf = R_J if rf is None else rf
    o, t = rf + 2.6, FL_T + 2.2
    c = revolve([(-t, rf - LEG), (-t, o), (t, o), (t, rf - LEG), (FL_T + 0.25, rf - LEG), (FL_T + 0.25, rf + 0.35), (-FL_T - 0.25, rf + 0.35), (-FL_T - 0.25, rf - LEG)])
    cut = annulus(-2.2, 2.2, o - G_D, o + 0.3)                                                            # zip tie
    for sx in (-1, 1):
        a, b = sorted((sx * 3.0, sx * (3.0 + G_W))); cut = cut.union(annulus(a, b, o - G_D, o + 0.3))     # cord grooves
        a, b = sorted((sx * (2.9 + G_W), sx * (t + 0.1)))
        for cl in (-67.5, -22.5, 22.5, 67.5): cut = cut.union(rot_x(box(a, b, o - G_D, o + 0.3, -0.5, 0.5), cl))   # knot slits
    if bosses:                                                                                            # the slave cords pass through these, over the collar
        for sg in (-1, 1):
            c = c.union(rot_x(box(-t, t, o - 0.4, rf + 5.8, -2.6, 2.6), sg * 20))
            cut = cut.union(rot_x(cyl("x", 0.9, -t - 1, t + 1, rf + 4.3, 0), sg * 20))
    cut = cut.union(box(FL_T + 0.2, t + 0.1, rf - LEG - 0.1, rf - 0.3, -3.4, 3.4))                         # notch for the key
    return c.cut(cut).intersect(box(-20, 20, 0.15, 200, -200, 200))

def collar_half_j1(): return collar_half(R_J1, False)    # bearing 1 is on the round duct: smaller, and nothing crosses it

def drive_ring():
    """Free ring just behind bearing 1. Servo 2 turns it from the body; its second groove carries the cords that work bearing 2."""
    r0, r1 = RING_ID, R_RING - CORD + G_D
    c = annulus(0, RING_W, r0, r1)
    cut = annulus(0.9, 0.9 + G_W, R_RING - CORD, r1 + 1).union(annulus(RING_W - 0.9 - G_W, RING_W - 0.9, R_RING - CORD, r1 + 1))
    for cl in range(0, 360, 60): cut = cut.union(rot_x(box(0.9, RING_W - 0.9, R_RING - CORD - 0.6, r1 + 1, -2.0, 2.0), cl + 30))   # knot pockets between the grooves
    return c.cut(cut).translate((RING_X, 0, 0))

def servo_drum():
    """Cord drum for an MG90S. The stock single-arm horn presses into the recess; the horn screw holds it on."""
    r1 = DRUM_R - CORD + G_D
    c = annulus(0, DRUM_T, 0, r1).cut(annulus((DRUM_T - G_W) / 2, (DRUM_T + G_W) / 2, DRUM_R - CORD, r1 + 1))
    cut = cyl("x", B.HORN_HUB / 2, DRUM_T - 2.9, DRUM_T + 1, 0, 0).union(box(DRUM_T - 2.9, DRUM_T + 1, -B.HORN_LEN, 0, -B.HORN_W / 2, B.HORN_W / 2))
    cut = cut.union(cyl("x", 1.6, -1, DRUM_T + 1, 0, 0))
    for i in range(5): cut = cut.union(rot_x(cyl("x", 6.5, -1, DRUM_T + 1, 16.5, 0), 36 + 72 * i))           # lightening holes, clear of the horn arm
    for cl in (90, 270): cut = cut.union(rot_x(box((DRUM_T - G_W) / 2 - 0.1, DRUM_T + 0.1, DRUM_R - CORD - 0.5, r1 + 1, -0.5, 0.5), cl))   # knot slits
    return c.cut(cut)

UP, DOWN = [((0, 1, 0), -90)], [((0, 1, 0), 90)]      # stand on the upstream / downstream end
PARTS = {
    "lift_fan_rotor": (lift_rotor, "liftRotor", DOWN, "lift", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Mirror image of the main fan: it turns the other way. Balance it before running."),
    "lift_fan_ring": (lift_ring, "liftRing", DOWN, "lift", "Flared lip on the bed. 2 walls. Press it into the fan bay from the top."),
    "edf_impeller": (impeller, "impeller", DOWN, "base", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Balance it before running."),
    "edf_duct": (fan_duct, "duct", DOWN, "base", "Rear flange on the bed. The motor plate bridges 34 mm."),
    "edf_tail_cone": (tail_cone, "tailCone", UP, "base", "Open end on the bed. Push fit; take it off to reach the motor screws."),
    "nozzle_segment_1": (lambda: segment(0), "seg1", UP, "j1", "Bearing-1 flange on the bed, supports on. The sleeve behind the flange must be smooth: the drive ring turns on it."),
    "nozzle_segment_2": (lambda: segment(1), "seg2", [((0, 0, 1), 0)], "j2", "Lay the upstream bearing face on the bed: rotate 50 degrees in the slicer. Supports on."),
    "nozzle_segment_3": (lambda: segment(2), "seg3", DOWN, "j3", "Exit on the bed, supports under the flange."),
    "bearing_collar_half": (collar_half, "collar", None, "base", "Flat. Print 4 (bearings 2 and 3). The two bumps carry the cords over the collar."),
    "bearing_collar_half_j1": (collar_half_j1, "collarJ1", None, "base", "Flat. Print 2 (bearing 1)."),
    "nozzle_drive_ring": (drive_ring, "driveRing", UP, "ring", "Flat. Slip it over segment 1 from the front before the nozzle goes on the duct."),
    "servo_cord_drum": (servo_drum, "servoDrum", UP, "base", "Flat, horn recess up. Print 2. The stock servo horn presses into the recess; the horn screw goes through the centre."),
}

def main():
    here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
    out = os.path.join(root, "site", "cad", "kit"); os.makedirs(out, exist_ok=True)
    for d in ("stl", "step"): os.makedirs(os.path.join(here, d), exist_ok=True)
    report, solids = {}, {}
    for name, (fn, tid, rots, frame, note) in PARTS.items():
        t0 = time.time(); s = fn(); solids[name] = s; p = s
        T = cq.Location(cq.Vector(0, 0, 0))
        for ax, deg in (rots or []):
            p = p.rotate((0, 0, 0), ax, deg); T = T * cq.Location(cq.Vector(0, 0, 0), cq.Vector(*ax), -deg)
        bb = p.val().BoundingBox(); shift = (-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin)
        p = p.translate(shift)
        cq.exporters.export(p, os.path.join(here, "stl", name + ".stl"), tolerance=0.02, angularTolerance=0.15)
        cq.exporters.export(p, os.path.join(here, "step", name + ".step"))
        shutil.copy(os.path.join(here, "stl", name + ".stl"), os.path.join(out, name + ".stl"))
        M = cq.Location(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), -90) * T * cq.Location(cq.Vector(-shift[0], -shift[1], -shift[2]))
        m = M.wrapped.Transformation(); a = [m.Value(r, c) for c in (1, 2, 3, 4) for r in (1, 2, 3)]
        mat = a[0:3] + [0] + a[3:6] + [0] + a[6:9] + [0] + a[9:12] + [1]
        v = abs(sum(x.Volume() for x in s.solids().vals())); mass = v * B.PETG_D * (1.0 if name == "edf_impeller" else 0.75)
        if not s.val().isValid(): print("  WARNING: invalid solid", name)
        report[name] = {"id": tid, "frame": frame, "note": note, "bed": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "solids": s.solids().size(), "mass": round(mass, 1), "matrix": [round(x, 5) for x in mat]}
        print(f"{name:24s} bed {report[name]['bed']}  solids {report[name]['solids']}  ~{report[name]['mass']} g  ({time.time() - t0:.1f}s)", flush=True)
    geo = {"alpha": ALPHA, "joints": [j[0] for j in JOINTS], "bore": BORE, "exitX": L1 + L2 + L3, "rotorX": (X_WEB0 + X_WEB1) / 2, "ringX": RING_X,
           "cord": {"band1": R_BAND1, "ring": R_RING, "collar": R_COLLAR, "drum": DRUM_R},
           "drive": {"drumX": B.X_J1 - B.NZ["xs"], "drumY": B.NZ["yc"] - B.Y_AX, "drumZ": B.NZ["zd"], "drumT": DRUM_T, "bodyX": B.X_J1 - B.NZ["xc"], "bodyZ": B.NZ["zc"],
                     "fairX": B.X_J1 - B.X_NOTCH, "bandX": -(3.0 + G_W / 2), "ringX": RING_X + 0.9 + G_W / 2}}
    print("cord radii: bearing-1 collar %.1f, drive ring %.1f, canted collars %.1f, servo drum %.1f  (must match NOZZLE.cord in site/js/nozzle.js)" % (R_BAND1, R_RING, R_COLLAR, DRUM_R))
    json.dump({"geometry": geo, "parts": {v["id"]: {k: v[k] for k in ("frame", "note", "bed", "mass", "matrix")} | {"file": n} for n, v in report.items()}}, open(os.path.join(out, "kit.json"), "w"))
    json.dump(report, open(os.path.join(here, "kit-report.json"), "w"), indent=1)
    if "--fast" in sys.argv: return                       # geometry only: skip the clash checks
    rings = assembled_rings(solids)
    names, clashes = [n for n in solids if "collar" not in n and "lift" not in n and "drum" not in n and "ring" not in n], []
    def overlap(a, b):
        inter = a.intersect(b); return sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            v = overlap(solids[a], solids[b])
            if v > 1.0: clashes.append((a, b, round(v, 1)))
        for rn, r in rings.items():
            v = overlap(solids[a], r)
            if v > 1.0: clashes.append((a, rn, round(v, 1)))
    rn = list(rings)
    for i, a in enumerate(rn):
        for b in rn[i + 1:]:
            v = overlap(rings[a], rings[b])
            if v > 1.0: clashes.append((a, b, round(v, 1)))
    motor = cyl("x", 14.6, X_MOTOR_FACE - 19.5, X_MOTOR_FACE, 0, 0).union(cyl("x", 2.5, X_MOTOR_FACE - 33, X_MOTOR_FACE - 19, 0, 0))
    for n in ("edf_duct", "edf_tail_cone"):
        v = overlap(solids[n], motor)
        if v > 1.0: clashes.append((n, "motor", round(v, 1)))
    print("clashes with the nozzle straight (mm^3):", clashes or "none")
    print("total printed mass ~%.0f g (impeller, duct, cone, 3 segments, 6 collar halves, drive ring, 2 drums)" % (sum(v["mass"] for k, v in report.items() if "collar" not in k and "drum" not in k and "lift" not in k) + 4 * report["bearing_collar_half"]["mass"] + 2 * report["bearing_collar_half_j1"]["mass"] + 2 * report["servo_cord_drum"]["mass"]))
    installed_check(solids, rings)

def assembled_rings(solids):    # the collars as whole rings on their bearings, and the drive ring, nozzle straight
    out = {}
    for j in range(3):
        h = solids["bearing_collar_half" if j else "bearing_collar_half_j1"]
        out["collar %d" % (j + 1)] = place(rot_x(h, SHORT[j]).union(rot_x(h, SHORT[j] + 180)), j)
    out["drive ring"] = solids["nozzle_drive_ring"]
    return out

def installed_check(solids, rings):
    """Swing the nozzle through its travel inside the airframe and look for clashes with the tail and the ground."""
    al = math.radians(ALPHA)
    def solve(d, yaw):       # same maths as site/js/nozzle.js
        b = 2 * math.asin(min(1.0, math.sin(math.radians(d) / 4) / math.sin(al)))
        bz = max(b, math.radians(0.5))
        def rot(v, ax, t):
            c, s_ = math.cos(t), math.sin(t); k = sum(a_ * b_ for a_, b_ in zip(ax, v))
            cr = (ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0])
            return tuple(v[i] * c + cr[i] * s_ + ax[i] * k * (1 - c) for i in range(3))
        e = rot(rot((1, 0, 0), (math.cos(al), -math.sin(al), 0), -bz), (math.cos(al), math.sin(al), 0), bz)
        return math.degrees(math.atan2(e[2], -e[1])) - yaw, math.degrees(b), -math.degrees(b)
    def kit_axis(n):         # kit vector -> CadQuery vector
        return cq.Vector(n[0], -n[2], n[1])
    to_aircraft = lambda w: w.rotate((0, 0, 0), (0, 0, 1), 180).translate((B.X_J1, 0, B.Y_AX))
    tail = {"right boom": B.boom(1), "left boom": B.boom(-1), "right fin": B.fin(1), "left fin": B.fin(-1), "right tailplane": B.stab(1), "left tailplane": B.stab(-1),
            "aft bridge": B.aft_bridge(), "ground": box(-700, 100, B.GROUND_Y - 40, B.GROUND_Y, -300, 300)}
    n2, n3 = kit_axis((math.cos(al), math.sin(al), 0)), kit_axis((math.cos(al), -math.sin(al), 0))
    j2, j3 = cq.Vector(JOINTS[1][0], 0, 0), cq.Vector(JOINTS[2][0], 0, 0)
    worst = {}
    for d in (0, 30, 60, 90, 100):
        for yaw0 in (-20, 0, 20):
            yaw = yaw0 * (20 - max(0, d - 90) * 1.2) / 20      # same taper as yawLimit() in site/js/nozzle.js
            a, b, c = solve(d, yaw)
            g3 = solids["nozzle_segment_3"].union(rings["collar 3"]).rotate(j3, j3 + n3, c)       # each collar turns with its downstream part
            g2 = solids["nozzle_segment_2"].union(rings["collar 2"]).union(g3).rotate(j2, j2 + n2, b)
            g1 = solids["nozzle_segment_1"].union(rings["collar 1"]).union(rings["drive ring"]).union(g2).rotate((0, 0, 0), (1, 0, 0), a)
            moving = to_aircraft(g1)
            bb = moving.val().BoundingBox()
            for name, t in tail.items():
                inter = moving.intersect(t); v = sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
                if v > 5: worst[name] = max(worst.get(name, (0,))[0:1] + (v,)), d, yaw
            worst["_lowest"] = min(worst.get("_lowest", 1e9), bb.zmin); worst["_widest"] = max(worst.get("_widest", 0), max(abs(bb.ymin), abs(bb.ymax)))
    print("installed nozzle, 15 poses: lowest point y = %.0f mm (ground at %.0f), widest half-width %.0f mm (booms start at %.0f)" % (worst.pop("_lowest"), B.GROUND_Y, worst.pop("_widest"), B.NOTCH_W))
    print("installed clashes (mm^3, at deflection, yaw):", {k: (round(v[0]), v[1], v[2]) for k, v in worst.items()} or "none")

if __name__ == "__main__":
    main()
