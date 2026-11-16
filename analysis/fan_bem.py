"""Blade-element model of the two printed ducted fans, matched to the EMAX 2306 1700KV motor on 4 cells.
Run: python3 analysis/fan_bem.py  (writes site/analysis/fans.json)
Model: each ring of the fan disc is solved for the through-flow speed at which blade lift equals what the ring needs.
For a straight duct at rest the blades supply half the thrust and the duct lip the other half (momentum theory).
Blade sections use a thin-aerofoil lift curve with stall; no tip-gap or stator losses, so treat results as an upper bound."""
import json, os, numpy as np
RHO = 1.20                       # warm, humid air
KV, R_M, I0, V_BATT, R_BATT = 1700.0, 0.070, 1.0, 16.0, 0.030     # motor constant, winding and battery resistance (ohm), no-load amps, pack volts at rest
I_LIMIT = 35.0                   # amps the 2306 can hold for a hover; its burst rating is about 40
KT = 60.0 / (2 * np.pi * KV)     # N m per amp
def section(alpha):
    a = np.degrees(alpha); cl = np.clip(0.35 + 0.105 * a, -0.6, 1.25)        # 4% camber gives lift at zero incidence
    cl = np.where(a > 11, 1.25 - 0.06 * (a - 11), cl); cd = 0.018 + 0.0006 * a ** 2 + np.where(a > 11, 0.02 * (a - 11), 0)
    return cl, cd
def fan(bore, hub_r, blades, c0, c1, rpm_design, v_design, extra_pitch=5.0):
    tip = bore / 2 / 1000; r = np.linspace(hub_r / 1000, tip, 24)[:-1] + (tip - hub_r / 1000) / 46; dr = (tip - hub_r / 1000) / 23
    u = (r - hub_r / 1000) / (tip - hub_r / 1000); chord = (c0 + (c1 - c0) * u) / 1000
    pitch = np.arctan2(v_design, rpm_design * 2 * np.pi / 60 * r) + np.radians(extra_pitch)      # same rule as cad/propulsion.py
    def at(rpm):
        w = rpm * 2 * np.pi / 60; va = np.full_like(r, v_design * rpm / rpm_design)     # start on the unstalled branch: the fan is run up, not dropped in
        for _ in range(200):
            phi = np.arctan2(va, w * r); cl, cd = section(pitch - phi); vr2 = va ** 2 + (w * r) ** 2
            dT = 0.5 * RHO * vr2 * chord * blades * (cl * np.cos(phi) - cd * np.sin(phi)) * dr      # blade thrust on the ring
            va_new = np.sqrt(np.maximum(dT, 0) / (0.5 * RHO * 2 * np.pi * r * dr) )                 # ring needs 1/2 rho va^2 x area from the blades
            va = 0.7 * va + 0.3 * va_new
        dQ = 0.5 * RHO * vr2 * chord * blades * (cl * np.sin(phi) + cd * np.cos(phi)) * r * dr
        thrust = float(np.sum(RHO * 2 * np.pi * r * dr * va ** 2)); q = float(np.sum(dQ))
        return thrust, q, float(np.mean(va)), float(np.degrees(np.mean(pitch - phi)))
    return at
REAL = 0.70                      # share of the ideal thrust a printed fan is expected to deliver (tip gap, stator, hub and surface losses)
def at_limit(at):                # the most the motor may give continuously: full throttle, or less if that would exceed the current limit
    lo, hi = 0.2, 1.0
    for _ in range(22):
        th = (lo + hi) / 2; lo, hi = (th, hi) if match(at, th)["amps"] < I_LIMIT else (lo, th)
    m = match(at, hi if match(at, 1.0)["amps"] < I_LIMIT else th); m["throttle"] = round(1.0 if match(at, 1.0)["amps"] < I_LIMIT else th, 2); m["expected_g"] = round(m["thrust_g"] * REAL); return m
def match(at, throttle=1.0):
    """rpm where motor torque equals fan torque"""
    lo, hi = 2000.0, KV * V_BATT
    for _ in range(40):
        rpm = (lo + hi) / 2; t, q, va, a = at(rpm); i = q / KT + I0
        v = throttle * (V_BATT - i * R_BATT) - i * R_M
        lo, hi = (rpm, hi) if rpm / KV < v else (lo, rpm)
    return dict(rpm=round(rpm), thrust_g=round(t / 9.81 * 1000), amps=round(i, 1), watts=round(i * throttle * (V_BATT - i * R_BATT)), jet_m_s=round(va, 1), blade_incidence_deg=round(a, 1), g_per_W=round(t / 9.81 * 1000 / max(1, i * throttle * (V_BATT - i * R_BATT)), 2))
if __name__ == "__main__":
    fans = {"main": dict(args=(80.0, 17.0, 7, 21.0, 26.0, 18000.0, 37.6), assumed=850, label="Main fan, 80 mm, 7 blades"),
            "lift": dict(args=(140.0, 17.0, 7, 13.2, 18.0, 17000.0, 27.0), assumed=1300, label="Lift fan, 140 mm, 7 blades"),
            "lift_old": dict(args=(120.0, 17.0, 9, 22.0, 30.0, 13500.0, 26.0), assumed=1300, label="Previous lift fan, 120 mm, 9 blades")}
    out = {}
    for k, f in fans.items():
        at = fan(*f["args"]); curve = []
        for rpm in range(4000, 26001, 1000):
            t, q, va, a = at(rpm); curve.append(dict(rpm=rpm, thrust_g=round(t / 9.81 * 1000), shaft_W=round(q * rpm * 2 * np.pi / 60), amps=round(q / KT + I0, 1)))
        full = match(at); pitch = []
        limit = at_limit(at); best = []
        for ep in (-7.5, -5, -2.5, 0, 2.5, 5, 7.5): best.append(dict(extra_pitch=ep, **at_limit(fan(*f["args"], extra_pitch=ep))))
        for ep in (0, 2.5, 5, 7.5, 10): pitch.append(dict(extra_pitch=ep, **match(fan(*f["args"], extra_pitch=ep))))
        out[k] = dict(label=f["label"], assumed_g=f["assumed"], full_throttle=full, at_current_limit=limit, real_factor=REAL, throttle=[dict(throttle=th, **match(at, th)) for th in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)], curve=curve)   # pitch sweeps are computed but not published: the solver is only reliable near the design point
        print(k, "at 35 A:", limit); print("   pitch at limit:", [(b["extra_pitch"], b["expected_g"], b["rpm"]) for b in best]); print(k, "full throttle:", full, "| assumed so far:", f["assumed"], "g"); print("   pitch sweep:", [(p["extra_pitch"], p["thrust_g"], p["amps"]) for p in pitch])
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "analysis"), exist_ok=True)
    json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "analysis", "fans.json"), "w"), indent=1)
