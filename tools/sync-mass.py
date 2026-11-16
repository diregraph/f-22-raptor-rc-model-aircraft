"""Copy estimated masses from cad/report.json into site/js/spec.js. Run after cad/build.py."""
import json, re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mass = {v["twin_id"]: v["mass_est_g"] for v in json.load(open(os.path.join(root, "cad", "report.json"))).values()}
p = os.path.join(root, "site", "js", "spec.js"); out = []
for line in open(p).read().split("\n"):
    m = re.match(r"(  \['(\w+)', '[^']*', '[^']*', '[^']*', '[^']*', )([\d.]+)(, .*)", line)
    if m and m.group(2) in mass: line = m.group(1) + str(max(1, round(mass[m.group(2)]))) + m.group(4)
    out.append(line)
open(p, "w").write("\n".join(out)); print("synced", len(mass), "masses")
