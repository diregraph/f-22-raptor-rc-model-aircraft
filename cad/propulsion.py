"""Bench kit: a printed 80 mm ducted fan for the EMAX 2306 motor and a three-bearing swivel nozzle
driven by three ordinary MG90S servos. Run: python3 cad/propulsion.py

Kit frame: +X is the flow direction (aft), +Y up, +Z right. x = 0 is the first nozzle bearing.
Everything here is a first design to be printed, run on the thrust stand and corrected.
The joint maths lives in site/js/nozzle.js; ALPHA and GEAR_RATIO must match it.
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
GEAR_M, Z_RING, Z_PINION = 1.25, 84, 42     # 2:1  (NOZZLE.gearRatio)
DJ = BORE / math.sqrt(math.cos(math.radians(ALPHA)))   # bore at a canted bearing: same flow area as the round duct
NW = 1.3                    # nozzle wall
FL_W, FL_T = 7.0, 3.0       # bearing flange width and thickness
L1, L2, L3 = 58.0, 104.0, 56.0     # long enough that the canted bearings and their collars clear each other on the short side of each wedge
JOINTS = [(0.0, 0.0, BORE + 2 * TIP_GAP), (L1, ALPHA, DJ), (L1 + L2, -ALPHA, DJ)]   # x, tilt about Z, bore
CLOCK = [150.0, 112.0, 100.0]                  # where each servo sits around its bearing, degrees from +Y toward +Z
TRAVEL = [(-146.0, -68.0), (0.0, 84.0), (-84.0, 0.0)]   # working range of each joint, degrees (site/js/nozzle.js)
BELL = 6.0                  # bellmouth flare
R_GEAR = GEAR_M * Z_RING / 2
R_PIN = GEAR_M * Z_PINION / 2
SERVO_R = R_GEAR + R_PIN

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

def tube(ends, extra):      # solid loft between two circles: ends = [(x, tilt, r), (x, tilt, r)]
    return W_(cq.Solid.makeLoft([circle_wire(x, t, r + extra) for x, t, r in ends]))

def gear(z, m, x0, x1, phase=0.0):
    r, pts, tau = m * z / 2, [], 2 * math.pi / z
    for i in range(z):
        th = i * tau + phase
        for rr, d in ((r - 1.25 * m, -0.30), (r + m, -0.15), (r + m, 0.15), (r - 1.25 * m, 0.30)):
            a = th + d * tau
            pts.append((-rr * math.sin(a), rr * math.cos(a)))
    return cq.Workplane("YZ").polyline(pts).close().extrude(x1 - x0).translate((x0, 0, 0))

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

def paddle(j):              # servo bracket on the upstream part of bearing j
    w, l = B.SV_W + B.SV_FIT, B.SV_L + B.SV_FIT
    p = box(-14.0, -11.0, 20.0, SERVO_R + 9.0, -19.5, 19.5)                     # plate, radial along +Y before clocking
    p = p.union(box(-14.0, -3.0, 30.0, JOINTS[j][2] / 2 + FL_W, -2.0, 2.0))      # gusset back to the flange
    yc = SERVO_R; zc = -B.SV_SHAFT_OFF                                           # shaft on the pinion axis, body tangential
    cut = box(-15.0, -10.0, yc - w / 2, yc + w / 2, zc - l / 2, zc + l / 2)
    for s in (-1, 1): cut = cut.union(cyl("x", B.SV_PILOT / 2, -15.0, -10.0, yc, zc + s * B.SV_HOLE_PITCH / 2))
    return rot_x(p, CLOCK[j]), rot_x(cut, CLOCK[j])

def sector(a0, a1, x0=-30.0, x1=30.0, r=200.0):      # wedge between two clock angles, for trimming
    n = max(2, int(abs(a1 - a0) / 6) + 1)
    pts = [(0.0, 0.0)] + [(-r * math.sin(math.radians(a0 + (a1 - a0) * i / n)), r * math.cos(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return cq.Workplane("YZ").polyline(pts).close().extrude(x1 - x0).translate((x0, 0, 0))

def gear_arc(j):            # the pinion at CLOCK[j] meets the point that started at CLOCK[j] - joint angle
    lo, hi = TRAVEL[j]
    return CLOCK[j] - hi - 13.0, CLOCK[j] - lo + 13.0

def ring_gear(j):           # a gear sector, not a full ring: it only has to cover the joint's travel
    a0, a1 = gear_arc(j)
    g = gear(Z_RING, GEAR_M, FL_T + 2.6, FL_T + 8.6).union(cyl("x", R_GEAR - 2, 0, FL_T + 8.6, 0, 0))
    return g.intersect(sector(a0, a1))

def fan_duct():
    r0, r1 = SHROUD_ID / 2, SHROUD_ID / 2 + WALL
    shell = revolve([(X_DUCT0, r0 + BELL), (X_DUCT0 + BELL, r0), (0, r0), (0, r1), (X_DUCT0 + BELL + 3, r1), (X_DUCT0, r1 + BELL)])   # 45 degree bellmouth
    hubcup = revolve([(X_MOTOR_FACE, 0), (X_MOTOR_FACE, HUB_R), (X_STATOR1, HUB_R), (X_STATOR1, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, 0)])
    body = shell.union(hubcup)
    for i in range(N_VANES):                                                    # straightening vanes; the widest one carries the wires
        t = 5.0 if i == 0 else 2.4
        v = box(X_MOTOR_FACE + 1, X_STATOR1 - 1, HUB_R - 1, r0 + 1, -t / 2, t / 2)
        body = body.union(rot_x(v, 360.0 * i / N_VANES + 36))
    pad, pcut = paddle(0)
    body = body.union(flange(0, -1)).union(pad)
    cut = pcut.union(cyl("x", r0, X_DUCT0 + BELL, 1, 0, 0).cut(cyl("x", HUB_R, X_MOTOR_FACE, X_STATOR1, 0, 0)).cut(cyl("x", r0 + 5, X_MOTOR_FACE + 1, X_STATOR1 - 1, 0, 0)))
    cut = cut.union(B.motor_holes("x", X_MOTOR_FACE - 1, X_MOTOR_FACE + 5, 0, 0))
    cut = cut.union(rot_x(box(X_MOTOR_FACE + 5, X_STATOR1 - 5, 8, r1 + 3, -1.6, 1.6), 36))      # wire slot through the wide vane
    return body.cut(cut)

def tail_cone():
    c = revolve([(X_STATOR1 - 6, HUB_R - 2.5), (X_STATOR1, HUB_R - 2.5), (X_STATOR1, HUB_R), (X_STATOR1 + 16, 11), (X_STATOR1 + 28, 3), (X_STATOR1 + 30, 1.2), (X_STATOR1 + 30, 0), (X_STATOR1 - 6, 0)])
    return c.cut(revolve([(X_STATOR1 - 7, 0), (X_STATOR1 - 7, HUB_R - 4.3), (X_STATOR1 + 12, 9), (X_STATOR1 + 22, 1.2), (X_STATOR1 + 22, 0)]))

def segment(k):
    """nozzle segment k (0, 1, 2): downstream half of bearing k, upstream half of bearing k + 1 (or the exit)"""
    xa, ta, da = JOINTS[k]
    if k < 2: xb, tb, db = JOINTS[k + 1]
    else: xb, tb, db = L1 + L2 + L3, 0.0, 74.0                                  # slightly convergent exit
    ends = [(xa, ta, da / 2), (xb, tb, db / 2)]
    body = tube(ends, NW).union(place(flange(k, 1), k)).union(place(ring_gear(k), k))
    cut = tube(ends, 0.0)
    if k < 2:
        pad, pcut = paddle(k + 1)
        body = body.union(place(flange(k + 1, -1), k + 1)).union(place(pad, k + 1)); cut = cut.union(place(pcut, k + 1))
    return body.cut(cut)

def collar_half():          # two halves clamp the pair of flanges at each bearing; zip ties sit in the groove
    r = DJ / 2 + FL_W
    prof = [(-FL_T - 2.2, r - 4.5), (-FL_T - 2.2, r + 2.6), (FL_T + 2.2, r + 2.6), (FL_T + 2.2, r - 4.5), (FL_T + 0.25, r - 4.5), (FL_T + 0.25, r + 0.35), (-FL_T - 0.25, r + 0.35), (-FL_T - 0.25, r - 4.5)]
    c = revolve(prof).cut(revolve([(-2.2, r + 1.4), (-2.2, r + 3), (2.2, r + 3), (2.2, r + 1.4)]))
    return c.intersect(box(-20, 20, 0.15, 200, -200, 200))

def collar_half_j1():       # bearing 1 is on the round duct, so its collar is a little smaller
    r = SHROUD_ID / 2 + FL_W
    prof = [(-FL_T - 2.2, r - 4.5), (-FL_T - 2.2, r + 2.6), (FL_T + 2.2, r + 2.6), (FL_T + 2.2, r - 4.5), (FL_T + 0.25, r - 4.5), (FL_T + 0.25, r + 0.35), (-FL_T - 0.25, r + 0.35), (-FL_T - 0.25, r - 4.5)]
    c = revolve(prof).cut(revolve([(-2.2, r + 1.4), (-2.2, r + 3), (2.2, r + 3), (2.2, r + 1.4)]))
    return c.intersect(box(-20, 20, 0.15, 200, -200, 200))

def pinion():               # canonical frame: axis along X through (y = SERVO_R, z = 0). A full gear: it turns twice the joint angle
    g = gear(Z_PINION, GEAR_M, FL_T + 2.9, FL_T + 8.3, phase=math.pi + math.pi / Z_PINION).translate((0, 0, SERVO_R))
    g = g.cut(cyl("x", R_PIN - 5.5, FL_T + 5.3, FL_T + 9, SERVO_R, 0).cut(cyl("x", 7.5, FL_T + 5, FL_T + 9, SERVO_R, 0)))     # lightening recess
    cut = cyl("x", B.HORN_HUB / 2, FL_T + 2, FL_T + 4.9, SERVO_R, 0).union(box(FL_T + 2, FL_T + 4.9, SERVO_R - B.HORN_LEN, SERVO_R, -B.HORN_W / 2, B.HORN_W / 2))
    return g.cut(cut.union(cyl("x", 1.6, FL_T - 1, FL_T + 9, SERVO_R, 0)))

UP, DOWN = [((0, 1, 0), -90)], [((0, 1, 0), 90)]      # stand on the upstream / downstream end
PARTS = {
    "lift_fan_rotor": (lift_rotor, "liftRotor", DOWN, "lift", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Mirror image of the main fan: it turns the other way. Balance it before running."),
    "lift_fan_ring": (lift_ring, "liftRing", DOWN, "lift", "Flared lip on the bed. 2 walls. Press it into the fan bay from the top."),
    "edf_impeller": (impeller, "impeller", DOWN, "base", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Balance it before running."),
    "edf_duct": (fan_duct, "duct", DOWN, "base", "Rear flange on the bed. The motor plate bridges 34 mm."),
    "edf_tail_cone": (tail_cone, "tailCone", UP, "base", "Open end on the bed. Push fit; take it off to reach the motor screws."),
    "nozzle_segment_1": (lambda: segment(0), "seg1", UP, "j1", "Gear end on the bed."),
    "nozzle_segment_2": (lambda: segment(1), "seg2", [((0, 0, 1), 0)], "j2", "Lay the gear-end bearing face on the bed: rotate 50 degrees in the slicer."),
    "nozzle_segment_3": (lambda: segment(2), "seg3", DOWN, "j3", "Exit on the bed, supports under the gear."),
    "bearing_collar_half": (collar_half, "collar", None, "base", "Flat. Print 4 (bearings 2 and 3)."),
    "bearing_collar_half_j1": (collar_half_j1, "collarJ1", None, "base", "Flat. Print 2 (bearing 1)."),
    "servo_pinion": (pinion, "pinion", [((0, 1, 0), -90)], "base", "Flat, horn recess down. Print 3. The stock servo horn presses into the recess; the horn screw goes through the centre."),
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
    geo = {"alpha": ALPHA, "joints": [j[0] for j in JOINTS], "clock": CLOCK, "servoR": SERVO_R, "gearRatio": Z_RING / Z_PINION, "bore": BORE, "exitX": L1 + L2 + L3, "travel": TRAVEL, "rotorX": (X_WEB0 + X_WEB1) / 2}
    json.dump({"geometry": geo, "parts": {v["id"]: {k: v[k] for k in ("frame", "note", "bed", "mass", "matrix")} | {"file": n} for n, v in report.items()}}, open(os.path.join(out, "kit.json"), "w"))
    json.dump(report, open(os.path.join(here, "kit-report.json"), "w"), indent=1)
    names, clashes = list(solids), []
    skip = {("bearing_collar_half", "bearing_collar_half_j1")}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if "collar" in a or "collar" in b or "pinion" in a or "pinion" in b or "lift" in a or "lift" in b: continue     # modelled once, placed several times by the viewer
            inter = solids[a].intersect(solids[b]); v = sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
            if v > 1.0: clashes.append((a, b, round(v, 1)))
    motor = cyl("x", 14.6, X_MOTOR_FACE - 19.5, X_MOTOR_FACE, 0, 0).union(cyl("x", 2.5, X_MOTOR_FACE - 33, X_MOTOR_FACE - 19, 0, 0))
    for n in ("edf_duct", "edf_tail_cone"):
        inter = solids[n].intersect(motor); v = sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
        if v > 1.0: clashes.append((n, "motor", round(v, 1)))
    print("clashes with the nozzle straight (mm^3):", clashes or "none")
    print("total printed mass ~%.0f g (1 impeller, duct, cone, 3 segments, 6 collar halves, 3 pinions)" % (sum(v["mass"] for k, v in report.items() if "collar" not in k and "pinion" not in k and "lift" not in k) + 4 * report["bearing_collar_half"]["mass"] + 2 * report["bearing_collar_half_j1"]["mass"] + 3 * report["servo_pinion"]["mass"]))
    installed_check(solids)

def installed_check(solids):
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
    def servo_and_pinion(j):
        body = box(-34.0, -11.0, SERVO_R - 6.2, SERVO_R + 6.2, -B.SV_SHAFT_OFF - 11.5, -B.SV_SHAFT_OFF + 11.5).union(cyl("x", R_PIN + GEAR_M, FL_T + 2.9, FL_T + 8.3, SERVO_R, 0))
        return place(rot_x(body, CLOCK[j]), j)
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
            g3 = solids["nozzle_segment_3"].rotate(j3, j3 + n3, c)
            g2 = solids["nozzle_segment_2"].union(servo_and_pinion(2)).union(g3).rotate(j2, j2 + n2, b)
            g1 = solids["nozzle_segment_1"].union(servo_and_pinion(1)).union(g2).rotate((0, 0, 0), (1, 0, 0), a)
            moving = to_aircraft(g1.union(servo_and_pinion(0)))
            bb = moving.val().BoundingBox()
            for name, t in tail.items():
                inter = moving.intersect(t); v = sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
                if v > 5: worst[name] = max(worst.get(name, (0,))[0:1] + (v,)), d, yaw
            worst["_lowest"] = min(worst.get("_lowest", 1e9), bb.zmin); worst["_widest"] = max(worst.get("_widest", 0), max(abs(bb.ymin), abs(bb.ymax)))
    print("installed nozzle, 15 poses: lowest point y = %.0f mm (ground at %.0f), widest half-width %.0f mm (booms start at %.0f)" % (worst.pop("_lowest"), B.GROUND_Y, worst.pop("_widest"), B.NOTCH_W))
    print("installed clashes (mm^3, at deflection, yaw):", {k: (round(v[0]), v[1], v[2]) for k, v in worst.items()} or "none")

if __name__ == "__main__":
    main()
