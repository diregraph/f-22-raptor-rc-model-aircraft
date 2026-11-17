"""Live CAD worker for the workbench (tools/bench.mjs starts it with the CadQuery venv: .venv-cad/bin/python cad/live.py).

Keeps CadQuery and cad/build.py loaded, so changing a wing, tailplane or fin rebuilds just those parts in about a second.
One JSON request per line on stdin, one JSON answer per line on stdout:

  {"op": "preview", "params": {"WING": {"tip_z": 360}}, "out": "/abs/dir"}
      rebuild the parts whose shape changed (STL only) into out/, answer their twin ids, matrices, beds and masses
  {"op": "check"}     clash check of the last previewed parts against the tubes, fans, propellers, servos and battery
  {"op": "keep", "params": {...}}
      write cad/params.json and rebuild those parts for real (cad/stl, cad/step, site/cad, report and manifest)

Shape limits are in LIMITS; anything else is refused. The full build (python3 cad/build.py) stays the final check.
"""
import json, os, sys, time, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_stdout = sys.stdout; sys.stdout = sys.stderr          # build.py prints progress: keep stdout for answers only
import build as B

LIMITS = dict(
    WING=dict(tip_z=(310, 430), root_c=(240, 360), tip_c=(60, 150), sweep=(20, 50)),
    STAB=dict(tip_z=(200, 290), root_c=(150, 240), tip_c=(50, 120), sweep=(20, 50)),
    FIN=dict(h=(110, 200), root_c=(130, 210), tip_c=(40, 100), sweep=(25, 55), cant=(10, 40)),
)
AFFECTS = dict(WING=["wing_inner_right", "wing_inner_left", "wing_outer_right", "wing_outer_left"],
               STAB=["stabilator_right", "stabilator_left"], FIN=["fin_right", "fin_left"])
KEPT = {k: {q: B.__dict__[k][q] for q in keys} for k, keys in B.SHAPE_KEYS.items()}    # the shape as it stands (file + params.json)
last = {}                                                                             # solids from the last preview, for "check"
envs = None


def clean(params):
    """Validated full shape: kept values, overridden by the request. Raises ValueError with a message for the user."""
    out = {k: dict(v) for k, v in KEPT.items()}
    for k, v in (params or {}).items():
        if k not in LIMITS: raise ValueError(f"{k} is not a shape group")
        for q, x in v.items():
            if q not in LIMITS[k]: raise ValueError(f"{k}.{q} is not a live knob")
            lo, hi = LIMITS[k][q]; x = float(x)
            if not lo <= x <= hi: raise ValueError(f"{k}.{q} = {x} is outside {lo} to {hi}")
            out[k][q] = x
    if out["WING"]["tip_z"] < B.WING["mid_z"] + 30: raise ValueError("The wing tip must stay 30 mm outboard of the panel joint")
    if out["WING"]["tip_c"] > out["WING"]["root_c"] or out["STAB"]["tip_c"] > out["STAB"]["root_c"] or out["FIN"]["tip_c"] > out["FIN"]["root_c"]:
        raise ValueError("A tip chord can't be longer than its root chord")
    return out


def apply(shape):
    for k, v in shape.items(): B.__dict__[k].update(v)
    return B.parts_table()


def changed(shape, ref):
    return [k for k in shape if any(abs(shape[k][q] - ref[k][q]) > 1e-9 for q in shape[k])]


def preview(req):
    shape = clean(req.get("params")); parts = apply(shape)
    groups = req.get("groups") or changed(shape, KEPT) or []
    out = req["out"]; os.makedirs(os.path.join(out, "stl"), exist_ok=True)
    rep, res = {}, {}
    last.clear()
    for g in groups:
        for name in AFFECTS[g]:
            t0 = time.time()
            last[name] = B.export_part(name, rep, out, None, step=False, parts=parts)
            r = rep[name]
            res[r["twin_id"]] = dict(file=name, stl=f"stl/{name}.stl", matrix=r["matrix"], bed=r["bed_mm"], fits=B.fits_bed(r["bed_mm"]), mass=r["mass_est_g"], s=round(time.time() - t0, 2))
    return dict(parts=res, groups=groups, shape=shape)


def check(_req):
    global envs
    if envs is None: envs = B.envelopes()
    clashes = []
    for name, s in last.items():
        for en, e in envs.items():
            v = B.vol(s.intersect(e))
            if v > 1.0: clashes.append([name, en, round(v, 1)])
    return dict(clashes=clashes, checked=list(last))


def keep(req):
    shape = clean(req.get("params")); parts = apply(shape)
    groups = changed(shape, KEPT)
    diff = {k: {q: v for q, v in shape[k].items() if abs(v - B.SHAPE_DEFAULTS[k][q]) > 1e-9} for k in shape}
    diff = {k: v for k, v in diff.items() if v}
    with open(B.PARAMS_PATH, "w") as f: json.dump(diff, f, indent=1); f.write("\n")
    root = os.path.dirname(HERE); site_cad = os.path.join(root, "site", "cad"); rep_path = os.path.join(HERE, "report.json")
    report = json.load(open(rep_path)); built = []
    for g in groups:
        for name in AFFECTS[g]: B.export_part(name, report, HERE, site_cad, parts=parts); built.append(name)
    B.write_reports(report, rep_path, site_cad)
    before = {k: dict(v) for k, v in KEPT.items()}
    for k in shape: KEPT[k].update(shape[k])
    return dict(kept=diff, built=built, before=before, after=shape)


OPS = dict(preview=preview, check=check, keep=keep)


def main():
    print(json.dumps(dict(ready=True, shape=KEPT, defaults=B.SHAPE_DEFAULTS, limits=LIMITS)), file=_stdout, flush=True)
    for line in sys.stdin:
        if not line.strip(): continue
        t0 = time.time()
        try:
            req = json.loads(line); ans = OPS[req["op"]](req); ans["ok"] = True
        except ValueError as e: ans = dict(ok=False, error=str(e))
        except Exception as e: traceback.print_exc(); ans = dict(ok=False, error=f"CAD build failed: {e}")
        ans["ms"] = round((time.time() - t0) * 1000)
        print(json.dumps(ans), file=_stdout, flush=True)


if __name__ == "__main__":
    main()
