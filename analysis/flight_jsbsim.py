"""Forward-flight pitch dynamics in JSBSim, for today's layout and the sized one. Run: python3 analysis/flight_jsbsim.py
Aerodynamic coefficients come from the vortex-lattice model (baseline_aero.py); JSBSim integrates the full rigid-body equations.
Three runs each: hands-off after a 2 degree nose-up kick; the same with a gyro-driven pitch damper; a 5 degree pitch command.
Linear aerodynamics (no stall), symmetric flight only. Writes site/analysis/flight.json."""
import json, os, shutil, tempfile, numpy as np, jsbsim, aerosandbox as asb
import baseline_aero as B
here = os.path.dirname(os.path.abspath(__file__)); V = 18.0; C = 0.24
XML = """<?xml version="1.0"?>
<fdm_config name="f35b" version="2.0" release="BETA">
 <metrics>
  <wingarea unit="M2">{S}</wingarea><wingspan unit="M">0.69</wingspan><chord unit="M">{C}</chord>
  <location name="AERORP" unit="M"><x>0</x><y>0</y><z>0</z></location>
  <location name="EYEPOINT" unit="M"><x>0</x><y>0</y><z>0</z></location>
  <location name="VRP" unit="M"><x>0</x><y>0</y><z>0</z></location>
 </metrics>
 <mass_balance>
  <ixx unit="KG*M2">0.0127</ixx><iyy unit="KG*M2">{IYY}</iyy><izz unit="KG*M2">0.0638</izz>
  <emptywt unit="KG">{M}</emptywt>
  <location name="CG" unit="M"><x>0</x><y>0</y><z>0</z></location>
 </mass_balance>
 <ground_reactions/>
 <external_reactions>
  <force name="thrust" frame="BODY"><location unit="M"><x>0</x><y>0</y><z>0</z></location><direction><x>1</x><y>0</y><z>0</z></direction></force>
 </external_reactions>
 <flight_control name="fcs">
  <channel name="pitch"><pure_gain name="fcs/tail-rad"><input>fcs/elevator-cmd-norm</input><gain>0.4363</gain></pure_gain></channel>
 </flight_control>
 <aerodynamics>
  <function name="aero/cl"><sum><value>{CL0}</value><product><value>{CLA}</value><property>aero/alpha-rad</property></product><product><value>{CLDE}</value><property>fcs/tail-rad</property></product></sum></function>
  <axis name="LIFT"><function name="aero/lift"><product><property>aero/qbar-psf</property><property>metrics/Sw-sqft</property><property>aero/cl</property></product></function></axis>
  <axis name="DRAG"><function name="aero/drag"><product><property>aero/qbar-psf</property><property>metrics/Sw-sqft</property>
     <sum><value>{CD0}</value><product><value>{K}</value><property>aero/cl</property><property>aero/cl</property></product></sum></product></function></axis>
  <axis name="PITCH"><function name="aero/pitch"><product><property>aero/qbar-psf</property><property>metrics/Sw-sqft</property><property>metrics/cbarw-ft</property>
     <sum><value>{CM0}</value><product><value>{CMA}</value><property>aero/alpha-rad</property></product>
          <product><value>{CMQ}</value><property>aero/ci2vel</property><property>velocities/q-aero-rad_sec</property></product>
          <product><value>{CMDE}</value><property>fcs/tail-rad</property></product></sum></product></function></axis>
 </aerodynamics>
</fdm_config>"""

def coefficients(cg_x, wing_dx, foil):
    kw = dict(cg_x=cg_x, wing_dx=wing_dx, wing_af=foil)
    def run(alpha=0.0, q=0.0, de=0.0):
        ap = B.airplane(tail_deflect=de, **kw)
        return asb.VortexLatticeMethod(ap, asb.OperatingPoint(velocity=V, alpha=alpha, q=q), spanwise_resolution=6, chordwise_resolution=6).run(), ap
    r0, ap = run(); ra, _ = run(alpha=4.0); rq, _ = run(q=1.0); rd, _ = run(de=4.0); d = np.radians(4.0)
    return dict(S=ap.s_ref, C=C, CL0=float(r0["CL"]), CLA=float((ra["CL"] - r0["CL"]) / d), CM0=float(r0["Cm"]), CMA=float((ra["Cm"] - r0["Cm"]) / d),
                CMQ=float((rq["Cm"] - r0["Cm"]) / (1.0 * C / (2 * V))), CLDE=float((rd["CL"] - r0["CL"]) / d), CMDE=float((rd["Cm"] - r0["Cm"]) / d), CD0=0.035, K=1 / (np.pi * 0.75 * 3.0))

def simulate(co, mass, mode, t_end=6.0, kq=0.0, kth=0.0, servo_rate=np.radians(400)):
    root = tempfile.mkdtemp(); os.makedirs(os.path.join(root, "aircraft", "f35b"))
    open(os.path.join(root, "aircraft", "f35b", "f35b.xml"), "w").write(XML.format(M=mass, IYY=0.0524, **co))
    fdm = jsbsim.FGFDMExec(root, None); fdm.set_debug_level(0); fdm.set_aircraft_path(os.path.join(root, "aircraft")); fdm.load_model("f35b"); fdm.set_dt(1 / 400)
    q = 0.5 * 1.225 * V * V; cl_need = mass * 9.81 / (q * co["S"])
    # trim: two equations (lift = weight, pitching moment = 0) in two unknowns (incidence, tail angle)
    A = np.array([[co["CLA"], co["CLDE"]], [co["CMA"], co["CMDE"]]]); a_t, de_t = np.linalg.solve(A, [cl_need - co["CL0"], -co["CM0"]])
    drag = q * co["S"] * (co["CD0"] + co["K"] * cl_need ** 2)
    fdm["ic/h-sl-ft"] = 300; fdm["ic/vc-kts"] = V * 1.94384; fdm["ic/alpha-rad"] = a_t; fdm["ic/theta-rad"] = a_t; fdm["ic/gamma-deg"] = 0
    fdm["fcs/elevator-cmd-norm"] = de_t / 0.4363; fdm["external_reactions/thrust/magnitude"] = drag / 4.44822; fdm.run_ic()
    de = de_t; th0 = a_t; out = dict(t=[], pitch=[], alpha=[], tail=[], g=[]); n = 0
    while fdm.get_sim_time() < t_end:
        t = fdm.get_sim_time(); th = fdm["attitude/theta-rad"]; qq = fdm["velocities/q-rad_sec"]
        cmd = de_t
        if mode == "kick" and 0.5 <= t < 0.7: cmd = de_t - np.radians(2.0)                    # brief nose-up tail input
        target = th0 + (np.radians(5.0) if (mode == "step" and t >= 0.5) else 0.0)
        cmd += kq * qq + kth * (th - target)                                                 # controller: pitch-rate damping + attitude hold (positive tail angle = nose down)
        cmd = float(np.clip(cmd, -0.4363, 0.4363)); de += float(np.clip(cmd - de, -servo_rate / 400, servo_rate / 400))    # the servo can only move so fast
        fdm["fcs/elevator-cmd-norm"] = de / 0.4363
        if not fdm.run(): break
        if n % 8 == 0:
            out["t"].append(round(t, 3)); out["pitch"].append(round(float(np.degrees(th - th0)), 2)); out["alpha"].append(round(float(np.degrees(fdm["aero/alpha-rad"])), 2))
            out["tail"].append(round(float(np.degrees(de)), 2)); out["g"].append(round(float(-fdm["accelerations/n-pilot-z-norm"]), 2))
        n += 1
        if abs(th - th0) > np.radians(60): break                                             # departed controlled flight
    shutil.rmtree(root, ignore_errors=True)
    out["departed"] = bool(abs(th - th0) > np.radians(60)); out["trim"] = dict(alpha_deg=round(float(np.degrees(a_t)), 1), tail_deg=round(float(np.degrees(de_t)), 1), drag_N=round(float(drag), 2))
    return out

if __name__ == "__main__":
    sz = json.load(open(os.path.join(here, "..", "site", "analysis", "sizing.json"))); res = {}
    for key, d, foil in (("today", sz["base"], "naca2408"), ("sized", sz["best"], "naca4412")):   # naca4412 stands in for the SD7062 in the lattice model (same camber)
        co = coefficients(-d["cg"] / 1000, d["wing_dx"] / 1000, foil); m = d["mass"] / 1000
        wn2 = -co["CMA"] * 0.5 * 1.225 * V * V * co["S"] * C / 0.0524                        # pitch 'spring': positive = stable
        r = dict(coefficients={k: round(v, 4) for k, v in co.items()}, static_margin_pct=d["margin"],
                 mode="oscillates at %.1f Hz" % (np.sqrt(wn2) / 2 / np.pi) if wn2 > 0 else "diverges: doubles every %.2f s" % (np.log(2) / np.sqrt(-wn2)),
                 free=simulate(co, m, "kick"), damped=simulate(co, m, "kick", kq=0.12, kth=1.2), step=simulate(co, m, "step", kq=0.12, kth=1.2))
        res[key] = r; print(key, r["mode"], "| free departed:", r["free"]["departed"], "| with controller departed:", r["damped"]["departed"], "| trim", r["free"]["trim"], "| max tail in step %.1f deg" % max(abs(v) for v in r["step"]["tail"]), flush=True)
    json.dump(res, open(os.path.join(here, "..", "site", "analysis", "flight.json"), "w"))
