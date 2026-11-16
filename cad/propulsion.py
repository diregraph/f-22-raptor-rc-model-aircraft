"""Printed 80 mm ducted fan for the EMAX 2306 motor and a three-bearing swivel nozzle that sits flush with the body.
Gear drive, as on proven 3BSM models: each bearing collar is a ring gear, and a micro gearmotor with an encoder on the part
upstream of it turns it through a pinion. The motors home against a lug on each collar (see docs/ducted-propulsion.md).
Run: python3 cad/propulsion.py

Kit frame: +X is the flow direction (aft), +Y up, +Z right. x = 0 is the first nozzle bearing.
Everything here is a first design to be printed, run on the thrust stand and corrected.
The joint maths lives in site/js/nozzle.js; ALPHA and the gear tooth counts must match it.
"""
import json, math, os, shutil, sys, time
import cadquery as cq
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B
from build import box, cyl, W_, naca

# ------------------------------------------------------------------ parameters
BORE = 80.0                 # fan diameter
TIP_GAP = 0.6               # blade tip to shroud
SHROUD_ID, WALL = BORE + 2 * TIP_GAP, 1.6
HUB_R = 17.0                # rotor hub radius (covers the 28.6 mm motor bell)
BELL_R = 15.3               # clearance bore over the bell
N_BLADES, N_VANES = 7, 7      # vanes: one straight wide one that carries the motor wires, six cambered ones that take the swirl out
RPM, V_AXIAL = 18000.0, 37.6    # design point: about 0.7 kg static thrust
X_ROTOR0, X_WEB0, X_WEB1, X_SKIRT1 = -97.0, -76.0, -68.0, -46.0
X_MOTOR_FACE, X_STATOR1, X_DUCT0 = -44.0, -14.0, -100.0
ALPHA = 40.0                # cant of bearings 2 and 3  (site/js/nozzle.js NOZZLE.alpha)
DJ = BORE / math.sqrt(math.cos(math.radians(ALPHA)))   # bore at a canted bearing: same flow area as the round duct
NW = 1.0                    # nozzle wall
FL_W, FL_T, LEG = 6.0, 3.0, 3.5  # bearing flange width and thickness; how far the collar legs reach down the flange faces
L1, L2, L3 = 58.0, 104.0, 56.0     # long enough that the canted bearings and their collars clear each other on the short side of each wedge
JOINTS = [(0.0, 0.0, BORE + 2 * TIP_GAP), (L1, ALPHA, DJ), (L1 + L2, -ALPHA, DJ)]   # x, tilt about Z, bore
BELL = 6.0                  # bellmouth flare
NECK_UP, NECK_DN = 6.0, 6.0      # straight length of tube each side of a canted bearing, so collars sit on a true cylinder. Only as long as the
                                 # collar (5.2 mm + play): a longer tilted neck makes a step inside the bore (it was 10 mm, an 11 mm ramp in the wall)
SWIRL_K = 12.5                   # swirl leaving the rotor, as Vtheta * r / Vaxial in mm (free vortex, from analysis/fan_bem.py at full power)
VANE_T = 1.6                     # cambered stator vane thickness
R_J1, R_J = (BORE + 2 * TIP_GAP) / 2 + FL_W, DJ / 2 + FL_W     # flange radius at bearing 1 and at the canted bearings
# Gear drive (docs/ducted-propulsion.md, "Drive"). Each collar carries a ring gear and turns with the part downstream of its
# bearing; the motor sits on the part upstream, so nothing has to reach across a moving joint but a motor lead.
MOD, PA, Z_PIN = 1.0, 20.0, 14           # module, pressure angle, pinion teeth
Z_RING = (100, 110, 110)                 # ring-gear teeth on the collars of bearings 1, 2, 3        (NOZZLE.gear.ring in site/js/nozzle.js)
GEAR_W = 4.6                             # tooth face width: the upstream part of the collar; the zip tie sits in the rest
BACKLASH = 0.15                          # mm taken off every tooth at the pitch circle: printed gears need running play
CD = [(z + Z_PIN) * MOD / 2 + 0.1 for z in Z_RING]   # pinion centre from the bearing axis
MOTOR_CLOCK = (-90.0, 180.0, 0.0)        # where each motor sits round its bearing (bearing frame, nozzle straight): joint 1 beside the duct,
                                         # inside the body; joint 2 under segment 1 and joint 3 on top of segment 2, each on its segment's long side
GM = dict(w=12.0, h=10.0, box=9.2, can=15.0, enc=4.5, hole=9.0)   # N20 micro gearmotor: 12 x 10 section, gearbox, can, magnetic encoder
PLATE = (-8.6, -6.4)                     # motor face plate, bearing frame x: just upstream of the collar
assert abs(CD[0] - B.NZ["cd"]) < 1e-6, "cad/build.py NZ['cd'] must match the joint-1 centre distance"
STOP_Q = (-62.0, -8.0, 8.0)              # joint angle where a collar lug meets the motor plate: the homing stop, 8 degrees past the travel
SHORT = (0.0, 180.0, 180.0)                # clock angle of the short side of the wedge at each bearing, seen from its downstream part
# Sealing (see docs/ducted-propulsion.md, "Sealing"). Two things stop jet air leaking out of each bearing:
#   a spigot: a short lip on the downstream part that reaches back into a counterbore in the upstream part, so the gap
#             between the flanges is behind a step, out of the jet, and the air must turn twice to get out;
#   a PTFE washer between the flange faces, 0.25 mm sheet, which also lowers the friction the motors fight.
# A second washer between the collar's upstream leg and the upstream flange takes up the play, so the bearing cannot rattle.
SPIG_L, SPIG_T, SPIG_GAP = 2.0, 0.9, 0.4    # spigot length and wall, and its clearance in the counterbore (radial and at the end)
PTFE_T = 0.25                               # PTFE sheet
COLLAR_PLAY = 0.30                          # collar slot clearance each side: two 0.25 washers leave 0.1 mm running play
WASHER = lambda j: (JOINTS[j][2] / 2 + SPIG_T + SPIG_GAP + 0.3, JOINTS[j][2] / 2 + FL_W - 0.3)   # washer inner and outer radius

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

# lift fan: 140 mm. Matched to the motor in analysis/fan_bem.py: about 35 A at 15,000 to 20,000 rpm.
LIFT_BORE, LIFT_BLADES, LIFT_RPM, LIFT_V = 140.0, 7, 17000.0, 27.0     # from analysis/fan_bem.py: larger disc, finer and fewer blades, so the motor reaches its power
LIFT_SKIRT = -52.0
def lift_rotor():
    return rotor(LIFT_BORE, LIFT_BLADES, LIFT_RPM, LIFT_V, 13.2, 18.0, LIFT_SKIRT, hand=-1)

LIFT_RING_ID, LIFT_RING_WALL = LIFT_BORE + 2 * TIP_GAP, 1.6
def lift_ring():            # hard, round shroud pressed into the soft body: sets the blade tip gap
    r0, r1 = LIFT_RING_ID / 2, LIFT_RING_ID / 2 + LIFT_RING_WALL
    return revolve([(X_ROTOR0 - 1, r0 + 5), (X_ROTOR0 + 4, r0), (-56, r0), (-56, r1), (X_ROTOR0 + 5, r1), (X_ROTOR0 - 1, r1 + 5)])

def flange(j, side):        # bearing flange ring in the canonical frame: side -1 upstream, +1 downstream
    r = JOINTS[j][2] / 2
    x0, x1 = (-FL_T, 0.0) if side < 0 else (0.0, FL_T)
    return cyl("x", r + FL_W, x0, x1, 0, 0)

def spigot(j):              # lip on the downstream part, reaching back into the upstream part's counterbore
    r = JOINTS[j][2] / 2
    return annulus(-SPIG_L, 0.0, r, r + SPIG_T)

def counterbore(j):         # pocket in the upstream part's flange that the spigot turns in
    r = JOINTS[j][2] / 2
    return annulus(-SPIG_L - SPIG_GAP, 0.01, r - 0.5, r + SPIG_T + SPIG_GAP)

def key(j):                 # rib behind the downstream flange: it fills a notch in the collar, so the collar turns with the downstream part
    r = JOINTS[j][2] / 2
    return rot_x(box(FL_T - 0.1, FL_T + 2.3, r - 1.0, r + FL_W - 0.6, -3.0, 3.0), SHORT[j])

def annulus(x0, x1, r0, r1): return revolve([(x0, r0), (x0, r1), (x1, r1), (x1, r0)])

def stator_vane(x0, x1, r_in, r_out, n=14):
    """Cambered stator vane at clock angle 0. The leading edge meets the swirling flow head-on (angle atan(SWIRL_K / r) from
    the axis, toward -phi: the rotor turns toward -phi) and the camber line turns it back to axial by the trailing edge."""
    c = x1 - x0; secs = []
    for r in [r_in, (r_in + r_out) / 2 - 6, (r_in + r_out) / 2 + 6, r_out]:
        tb = SWIRL_K / max(r, HUB_R)                                   # tan of the swirl angle at this radius
        us = [(1 - math.cos(math.pi * i / n)) / 2 for i in range(n + 1)]
        mid = lambda u: -tb * c * (u - u * u / 2)                       # camber line, tangential offset in mm: slope -tb at the LE, 0 at the TE
        half = lambda u: naca(u, VANE_T / c) * c                        # half-thickness, rounded leading edge
        def pt(u, side):
            t = mid(u) + side * half(u); phi = t / r
            return cq.Vector(x0 + u * c, -r * math.sin(phi), r * math.cos(phi))
        secs.append(cq.Wire.makePolygon([pt(u, 1) for u in us] + [pt(u, -1) for u in us[-2:0:-1]], close=True))
    return W_(cq.Solid.makeLoft(secs, True))

def fan_duct():
    r0, r1 = SHROUD_ID / 2, SHROUD_ID / 2 + WALL
    shell = revolve([(X_DUCT0, r0 + BELL), (X_DUCT0 + BELL, r0), (0, r0), (0, r1), (X_DUCT0 + BELL + 3, r1), (X_DUCT0, r1 + BELL)])   # 45 degree bellmouth
    hubcup = revolve([(X_MOTOR_FACE, 0), (X_MOTOR_FACE, HUB_R), (X_STATOR1, HUB_R), (X_STATOR1, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, HUB_R - 2.2), (X_MOTOR_FACE + 3.5, 0)])
    body = shell.union(hubcup)
    for i in range(N_VANES):                                                    # stator vanes; the first, straight and wide, carries the wires
        if i == 0: v = box(X_MOTOR_FACE + 1, X_STATOR1 - 1, HUB_R - 1, r0 + 1, -2.5, 2.5)
        else: v = stator_vane(X_MOTOR_FACE + 1, X_STATOR1 - 1, HUB_R - 1, r0 + 1)
        body = body.union(rot_x(v, 360.0 * i / N_VANES + 36))
    body = body.union(flange(0, -1))
    m, h = motor_mount(0); body = body.union(m)                                 # joint-1 motor plate: the motor runs forward into the body
    body = body.cut(counterbore(0)).cut(h)
    cut = (cyl("x", r0, X_DUCT0 + BELL, 1, 0, 0).cut(cyl("x", HUB_R, X_MOTOR_FACE, X_STATOR1, 0, 0)).cut(cyl("x", r0 + 5, X_MOTOR_FACE + 1, X_STATOR1 - 1, 0, 0)))
    cut = cut.union(B.motor_holes("x", X_MOTOR_FACE - 1, X_MOTOR_FACE + 5, 0, 0))
    cut = cut.union(rot_x(box(X_MOTOR_FACE + 5, X_STATOR1 - 5, 8, r1 + 3, -1.6, 1.6), 36))      # wire slot through the wide vane
    return body.cut(cut)

TAIL_L = 64.0                 # tail cone length behind the stators: reaches into segment 1, which stays coaxial whatever the nozzle does
def tail_cone():
    """Fairing behind the motor: tapers the 34 mm hub to a point at about 15 degrees, so the flow stays attached
    (the first one closed it in 30 mm, about 30 degrees, and the flow would have broken away). Thin shell, push fit."""
    n = 16; outer = [(X_STATOR1 + TAIL_L * i / n, max(1.0, HUB_R * (1 - (i / n) ** 1.15))) for i in range(n + 1)]
    inner = [(x, r - 0.9) for x, r in outer if r - 0.9 > 1.0]
    c = revolve([(X_STATOR1 - 6, HUB_R - 2.5), (X_STATOR1, HUB_R - 2.5)] + outer + [(outer[-1][0], 0), (X_STATOR1 - 6, 0)])
    return c.cut(revolve([(X_STATOR1 - 7, 0), (X_STATOR1 - 7, HUB_R - 4.3), (X_STATOR1, HUB_R - 4.3)] + inner[1:] + [(inner[-1][0], 0)]))

def segment(k):
    """nozzle segment k (0, 1, 2): downstream half of bearing k, upstream half of bearing k + 1 (or the exit).
    Segments 1 and 2 also carry the motor that turns the next bearing."""
    body = seg_tube(k, NW).union(place(flange(k, 1), k)).union(place(key(k), k)).union(place(spigot(k), k))
    cut = seg_tube(k, 0.0)
    if k < 2:
        body = body.union(place(flange(k + 1, -1), k + 1)); cut = cut.union(place(counterbore(k + 1), k + 1))
        m, h = motor_mount(k + 1); body = body.union(place(m, k + 1)); cut = cut.union(place(h, k + 1))
    return body.cut(cut)

# ------------------------------------------------------------------ gear drive
def gear_pts(z, m=MOD):
    """Involute spur gear outline in the CadQuery (Y, Z) plane, tooth gaps at 0 and 180 degrees (the collar split lines)."""
    rp = z * m / 2; rb = rp * math.cos(math.radians(PA)); ra, rf = rp + m, rp - 1.25 * m
    inv = lambda a: math.tan(a) - a
    psi_p = math.pi / (2 * z) - BACKLASH / 2 / rp + inv(math.radians(PA))
    psi = lambda r: psi_p - inv(math.acos(min(1.0, rb / r)))
    r0 = max(rf, rb); rs = [r0 + (ra - r0) * i / 6 for i in range(7)]
    pts = []
    for k in range(z):
        c = 2 * math.pi * (k + 0.5) / z
        side = [(r, c - psi(r)) for r in rs]
        flank = ([(rf, c - psi(r0))] if rf < r0 else []) + side + [(r, 2 * c - t) for r, t in reversed(side)] + ([(rf, c + psi(r0))] if rf < r0 else [])
        pts += [(r * math.cos(t), r * math.sin(t)) for r, t in flank]
    return pts

def gear(z, x0, x1):         # spur gear about X between x0 and x1
    return cq.Workplane("YZ").polyline(gear_pts(z)).close().extrude(x1 - x0).translate((x0, 0, 0))

def motor_mount(j):
    """Face plate for the N20 gearmotor that turns bearing j, with a web back along the upstream part, in the bearing frame.
    The gearbox screws to the plate (two M1.6); the pinion on its shaft meets the collar's ring gear. The plate is also the
    homing stop: a lug on the collar runs into its side (STOP_Q)."""
    r_in = JOINTS[j][2] / 2 + (0.4 if j == 0 else -15.0)          # the duct's stator zone must not be filled; a segment's bore cut trims the rest
    m = box(PLATE[0], PLATE[1], r_in, CD[j] + 7.5, -7.5, 7.5).union(box(PLATE[0] - 9.0, PLATE[1], r_in, CD[j] - GM["h"] / 2 - 0.4, -1.2, 1.2))
    h = cyl("x", 2.4, PLATE[0] - 1, PLATE[1] + 1, CD[j], 0)                           # gearbox boss and shaft
    for sg in (-1, 1): h = h.union(cyl("x", 0.85, PLATE[0] - 1, PLATE[1] + 1, CD[j], sg * GM["hole"] / 2))   # M1.6 screws
    return rot_x(m, MOTOR_CLOCK[j]), rot_x(h, MOTOR_CLOCK[j])

def motor_env(j, pinion=True):  # the gearmotor itself (bought), bearing frame: for the clash checks and the viewer
    x1 = PLATE[0]; x0 = x1 - GM["box"] - GM["can"] - GM["enc"]
    e = box(x0, x1, CD[j] - GM["h"] / 2, CD[j] + GM["h"] / 2, -GM["w"] / 2, GM["w"] / 2)
    if pinion: e = e.union(cyl("x", (Z_PIN + 2) * MOD / 2, -GEAR_W - 1.0, -0.4, CD[j], 0))
    return rot_x(e, MOTOR_CLOCK[j])

def lug_clock(j):
    """Clock angle (bearing frame, nozzle straight) of the collar lug that meets the motor plate at STOP_Q[j]."""
    r = JOINTS[j][2] / 2 + FL_W                                       # the lug's outer edge sits near the flange rim
    hp, hl = math.degrees(math.asin(7.5 / r)), math.degrees(math.asin(2.0 / r))
    s = 1 if STOP_Q[j] > 0 or j == 0 else -1                           # the stop is past the top of the travel for joints 1 and 3
    return MOTOR_CLOCK[j] - s * (hp + hl) - STOP_Q[j]

def pinion():
    """Pinion for the N20's 3 mm D shaft. Press on and glue; a brass module-1 14-tooth pinion fits the same."""
    p = gear(Z_PIN, -GEAR_W - 0.8, -0.4).union(cyl("x", 3.6, PLATE[1] + 0.2, -GEAR_W - 0.7, 0, 0))
    bore = cyl("x", 1.55, PLATE[1], 1, 0, 0).intersect(box(PLATE[1] - 1, 2, -2, 1.25, -2, 2))
    return p.cut(bore)

def collar_half(j=1):
    """Half of a bearing collar. Two halves clamp the pair of flanges; a zip tie in the groove holds them together.
    The upstream part of the collar is a ring gear (teeth split on a gap); a notch takes the segment's key, so the collar
    turns with the part downstream of the bearing, and a lug on its upstream face is the homing stop."""
    rf = R_J1 if j == 0 else R_J
    o, t, rr = rf + 2.6, FL_T + 2.2, Z_RING[j] * MOD / 2 - 1.25 * MOD
    c = revolve([(-t, rf - LEG), (-t, rr), (-t + GEAR_W, rr), (-t + GEAR_W, o), (t, o), (t, rf - LEG), (FL_T + COLLAR_PLAY, rf - LEG), (FL_T + COLLAR_PLAY, rf + 0.35),
                 (-FL_T - COLLAR_PLAY, rf + 0.35), (-FL_T - COLLAR_PLAY, rf - LEG)])
    c = c.union(gear(Z_RING[j], -t, -t + GEAR_W).cut(cyl("x", rr - 0.3, -t - 1, 0, 0, 0)))
    l = (lug_clock(j) - SHORT[j] + 90) % 180 - 90                     # lug clock on this half: both halves carry one, 180 degrees apart
    c = c.union(rot_x(box(-t - 2.4, -t + 0.5, rf - LEG + 0.5, rf + 1.8, -2.0, 2.0), l))
    cut = annulus(-t + GEAR_W + 0.9, t - 0.9, o - 1.2, o + 0.3)                                            # zip tie
    cut = cut.union(box(FL_T + 0.2, t + 0.1, rf - LEG - 0.1, rf - 0.3, -3.4, 3.4))                         # notch for the key
    return c.cut(cut).intersect(box(-20, 20, 0.15, 200, -200, 200))

def seal_washer(j=1):       # PTFE sheet washer: one between the flange faces, one behind the upstream flange
    r0, r1 = WASHER(j)
    return annulus(0.0, PTFE_T, r0, r1)

UP, DOWN = [((0, 1, 0), -90)], [((0, 1, 0), 90)]      # stand on the upstream / downstream end
PARTS = {
    "lift_fan_rotor": (lift_rotor, "liftRotor", DOWN, "lift", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Mirror image of the main fan: it turns the other way. Balance it before running."),
    "lift_fan_ring": (lift_ring, "liftRing", DOWN, "lift", "Flared lip on the bed. 2 walls. Press it into the fan bay from the top."),
    "edf_impeller": (impeller, "impeller", DOWN, "base", "Spinner down, supports under the blade tips only. PETG or PLA+, 0.12 mm layers, 5 walls, 100% infill. Balance it before running."),
    "edf_duct": (fan_duct, "duct", DOWN, "base", "Rear flange on the bed, supports under the gearmotor plate only. The fan motor plate bridges 34 mm."),
    "edf_tail_cone": (tail_cone, "tailCone", UP, "base", "Open end on the bed. Push fit; take it off to reach the motor screws."),
    "nozzle_segment_1": (lambda: segment(0), "seg1", UP, "j1", "Bearing-1 flange on the bed, supports on. Carries the joint-2 motor plate underneath."),
    "nozzle_segment_2": (lambda: segment(1), "seg2", [((0, 0, 1), 0)], "j2", "Lay the upstream bearing face on the bed: rotate 50 degrees in the slicer. Supports on. Carries the joint-3 motor plate on top."),
    "nozzle_segment_3": (lambda: segment(2), "seg3", DOWN, "j3", "Exit on the bed, supports under the flange."),
    "bearing_collar_half_j1": (lambda: collar_half(0), "collarJ1", None, "base", "Flat, gear side down. Print 2 (bearing 1). 0.12 mm layers for clean teeth."),
    "bearing_collar_half_j2": (lambda: collar_half(1), "collar", None, "base", "Flat, gear side down. Print 2 (bearing 2). 0.12 mm layers for clean teeth."),
    "bearing_collar_half_j3": (lambda: collar_half(2), "collarJ3", None, "base", "Flat, gear side down. Print 2 (bearing 3): the lug is in a different place from bearing 2's."),
    "nozzle_pinion": (pinion, "pinion", UP, "base", "Teeth up. Print 3 at 0.08 mm layers, 100% infill, or buy brass module-1 14-tooth pinions for a 3 mm D shaft."),
    "seal_washer": (lambda: seal_washer(1), "washer", None, "base", "Not printed: cut 4 from 0.25 mm PTFE sheet (bearings 2 and 3), using the DXF or this file as a template. Silicone grease both sides."),
    "seal_washer_j1": (lambda: seal_washer(0), "washerJ1", None, "base", "Not printed: cut 2 from 0.25 mm PTFE sheet (bearing 1)."),
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
        if "washer" in name:                            # flat outline for a cutter or a laser
            os.makedirs(os.path.join(here, "dxf"), exist_ok=True)
            cq.exporters.export(cq.Workplane("YZ").add(s.faces("<X").val()), os.path.join(here, "dxf", name + ".dxf"))
        M = cq.Location(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), -90) * T * cq.Location(cq.Vector(-shift[0], -shift[1], -shift[2]))
        m = M.wrapped.Transformation(); a = [m.Value(r, c) for c in (1, 2, 3, 4) for r in (1, 2, 3)]
        mat = a[0:3] + [0] + a[3:6] + [0] + a[6:9] + [0] + a[9:12] + [1]
        v = abs(sum(x.Volume() for x in s.solids().vals())); mass = v * (2.2e-3 if "washer" in name else B.PETG_D * (1.0 if name == "edf_impeller" else 0.75))   # PTFE 2.2 g/cm3
        if not s.val().isValid(): print("  WARNING: invalid solid", name)
        report[name] = {"id": tid, "frame": frame, "note": note, "bed": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "solids": s.solids().size(), "mass": round(mass, 1), "matrix": [round(x, 5) for x in mat]}
        print(f"{name:24s} bed {report[name]['bed']}  solids {report[name]['solids']}  ~{report[name]['mass']} g  ({time.time() - t0:.1f}s)", flush=True)
    geo = {"alpha": ALPHA, "joints": [j[0] for j in JOINTS], "bore": BORE, "exitX": L1 + L2 + L3, "rotorX": (X_WEB0 + X_WEB1) / 2,
           "gear": {"ring": list(Z_RING), "pinion": Z_PIN, "module": MOD, "cd": [round(c, 2) for c in CD], "clock": list(MOTOR_CLOCK), "plate": list(PLATE),
                    "faceW": GEAR_W, "motor": GM, "stop": list(STOP_Q), "lug": [round(lug_clock(j), 2) for j in range(3)]}}
    print("gears: rings %s teeth, pinion %d, module %.1f, centre distances %s mm; lugs at clock %s  (must match NOZZLE.gear in site/js/nozzle.js)" % (Z_RING, Z_PIN, MOD, [round(c, 2) for c in CD], [round(lug_clock(j), 1) for j in range(3)]))
    json.dump({"geometry": geo, "parts": {v["id"]: {k: v[k] for k in ("frame", "note", "bed", "mass", "matrix")} | {"file": n} for n, v in report.items()}}, open(os.path.join(out, "kit.json"), "w"))
    json.dump(report, open(os.path.join(here, "kit-report.json"), "w"), indent=1)
    if "--fast" in sys.argv: return                       # geometry only: skip the clash checks
    rings = assembled_rings(solids)
    names, clashes = [n for n in solids if "collar" not in n and "lift" not in n and "pinion" not in n and "washer" not in n], []
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
    print("total printed mass ~%.0f g (impeller, duct, cone, 3 segments, 6 collar halves, 3 pinions, 6 PTFE washers)" % (sum(v["mass"] for k, v in report.items() if "collar" not in k and "pinion" not in k and "lift" not in k and "washer" not in k) + 4 * report["seal_washer"]["mass"] + 2 * report["seal_washer_j1"]["mass"] + 2 * sum(report["bearing_collar_half_j%d" % j]["mass"] for j in (1, 2, 3)) + 3 * report["nozzle_pinion"]["mass"]))
    installed_check(solids, {"collar %d" % (j + 1): collar_env(j) for j in range(3)})

def collar_env(j):         # whole collar as a smooth ring out to the gear tips, with its lugs: fast stand-in for the swing checks
    rf = R_J1 if j == 0 else R_J
    t, ra = FL_T + 2.2, Z_RING[j] * MOD / 2 + MOD
    c = annulus(-t, -t + GEAR_W, rf + 0.4, ra).union(annulus(-t + GEAR_W, t, rf + 0.4, rf + 2.6))
    for k in (0, 180): c = c.union(rot_x(box(-t - 2.4, -t + 0.5, rf - LEG + 0.5, rf + 1.8, -2.0, 2.0), lug_clock(j) + k))
    return place(c, j)

def assembled_rings(solids):    # the collars as whole rings on their bearings, nozzle straight
    out = {}
    for j in range(3):
        h = solids["bearing_collar_half_j%d" % (j + 1)]
        out["collar %d" % (j + 1)] = place(rot_x(h, SHORT[j]).union(rot_x(h, SHORT[j] + 180)), j)
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
    ovl = lambda p, q: (lambda i: sum(x.Volume() for x in i.solids().vals()) if i.vals() else 0)(p.intersect(q))
    m1, m1b = motor_env(0), motor_env(0, False)                            # fixed to the duct
    m2, m3 = place(motor_env(1), 1), place(motor_env(2), 2)                # ride on segments 1 and 2
    m2b, m3b = place(motor_env(1, False), 1), place(motor_env(2, False), 2)   # without the pinion, which is meant to touch its own collar
    worst, self_hits = {}, {}
    for d in (0, 30, 60, 90, 100):
        for yaw0 in (-20, 0, 20):
            yaw = yaw0 * (20 - max(0, d - 90) * 1.2) / 20      # same taper as yawLimit() in site/js/nozzle.js
            a, b, c = solve(d, yaw)
            def hit(name, v):
                if v > 1 and v > self_hits.get(name, (0,))[0]: self_hits[name] = (round(v), d, round(yaw, 1))
            g3 = solids["nozzle_segment_3"].union(rings["collar 3"]).rotate(j3, j3 + n3, c)       # each collar turns with its downstream part
            hit("joint-3 motor vs segment 3", ovl(m3b, g3))
            g2 = solids["nozzle_segment_2"].union(rings["collar 2"]).union(m3).union(g3).rotate(j2, j2 + n2, b)
            hit("joint-2 motor vs segments 2, 3", ovl(m2b, g2))
            g1 = solids["nozzle_segment_1"].union(rings["collar 1"]).union(m2).union(g2).rotate((0, 0, 0), (1, 0, 0), a)
            hit("joint-1 motor vs nozzle", ovl(m1b, g1))
            moving = to_aircraft(g1)
            bb = moving.val().BoundingBox()
            for name, t in tail.items():
                inter = moving.intersect(t); v = sum(x.Volume() for x in inter.solids().vals()) if inter.vals() else 0
                if v > 5: worst[name] = max(worst.get(name, (0,))[0:1] + (v,)), d, yaw
            worst["_lowest"] = min(worst.get("_lowest", 1e9), bb.zmin); worst["_widest"] = max(worst.get("_widest", 0), max(abs(bb.ymin), abs(bb.ymax)))
    print("installed nozzle, 15 poses: lowest point y = %.0f mm (ground at %.0f), widest half-width %.0f mm (booms start at %.0f)" % (worst.pop("_lowest"), B.GROUND_Y, worst.pop("_widest"), B.NOTCH_W))
    print("installed clashes (mm^3, at deflection, yaw):", {k: (round(v[0]), v[1], v[2]) for k, v in worst.items()} or "none")
    print("motors against the nozzle as it moves (mm^3, at deflection, yaw):", self_hits or "none")
    print("joint-1 motor, aircraft frame: x %.0f to %.0f, half-width %.1f to %.1f" % (lambda b: (b.xmin, b.xmax, min(abs(b.ymin), abs(b.ymax)), max(abs(b.ymin), abs(b.ymax))))(to_aircraft(m1).val().BoundingBox()))

if __name__ == "__main__":
    main()
