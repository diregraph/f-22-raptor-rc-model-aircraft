"""Copy estimated masses from the CAD reports into site/js/spec.js. Run after cad/build.py and cad/propulsion.py."""
import json, re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mass = {v["twin_id"]: v["mass_est_g"] for v in json.load(open(os.path.join(root, "cad", "report.json"))).values()}
kit = os.path.join(root, "cad", "kit-report.json")
if os.path.exists(kit):
    for v in json.load(open(kit)).values(): mass[v["id"]] = v["mass"]
    mass["collar1"] = mass["collar2"] = mass["collar3"] = round(2 * mass.pop("collar", 0), 1)      # two halves make one collar
    mass["collar1"] = round(2 * mass.pop("collarJ1", mass["collar1"] / 2), 1)
    mass["drum1"] = mass["drum2"] = mass.pop("servoDrum", 10)
    wJ1, w = mass.pop("washerJ1", 0), mass.pop("washer", 0)                                       # two PTFE seal washers ride in each collar
    mass["collar1"] = round(mass["collar1"] + 2 * wJ1, 1); mass["collar2"] = mass["collar3"] = round(mass["collar2"] + 2 * w, 1)
p = os.path.join(root, "site", "js", "spec.js"); out = []
for line in open(p).read().split("\n"):
    m = re.match(r"(  \['(\w+)', '[^']*', '[^']*', '[^']*', '[^']*', )([\d.]+)(, .*)", line)
    if m and m.group(2) in mass: line = m.group(1) + str(max(1, round(mass[m.group(2)]))) + m.group(4)
    out.append(line)
open(p, "w").write("\n".join(out)); print("synced", len(mass), "masses")
