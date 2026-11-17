# Workbench reports

Reports filed from the site while it runs on the workbench server (`npm run bench`, see `tools/bench.mjs`).
Each report is one JSON file, plus a JPEG screenshot with an orange pin where the tap was.

```
reports/open/<id>.json     waiting for a fix
reports/open/<id>.jpg      screenshot (about 100 KB, plain git, no LFS)
reports/closed/<id>.*      fixed or declined, with a resolution
```

## Fields

| field | meaning |
|---|---|
| `kind` | `error` (something is wrong), `problem` (works but is bad), `suggestion` (an idea) |
| `title`, `note` | the owner's words |
| `page` | page it was filed from: `index.html` (3D model), `analysis.html`, `nozzle.html`, `story.html` |
| `target` | what was tapped. 3D: `{type:'part', id, name, point:[x,y,z]}` in aircraft axes (mm, +X nose, +Y up, +Z right wing; part ids are the ones in `site/js/spec.js`). Charts: `{type:'chart', section, chart, value}` with the chart's tooltip at the tap. Text: `{type:'text', section, text}`. Tweak panel: `{type:'tweak', changes, knobs, before, after}`. Kept shape: `{type:'shape', changes, before, after, built, needs}`, where `knobs` are the new numbers (battery pack and station, thrust caps, part masses and stations) and `before`/`after` the live scorecard |
| `view` | camera and controls at the time; `viewUrl` reopens the same picture (`index.html#view=...`) |
| `image` | screenshot file name, or null |
| `status`, `resolution`, `commit` | set by Claude when closing |

## Working the reports (for Claude)

The owner says "work the reports". Then:

1. Read every `reports/open/*.json` and look at each screenshot. Group reports that touch the same part or study.
2. Fix them. Geometry lives in `cad/build.py` (rebuild with `python3 cad/build.py <part> ...` for single parts, then
   `python3 tools/sync-mass.py`); numbers in `site/js/spec.js`; studies in `analysis/`.
3. Check every fix before closing it:
   - `npm test` passes;
   - after a CAD change, the full `python3 cad/build.py` reports no clashes and every part fits the bed;
   - render the changed view (open its `viewUrl` in a headless browser) and look at it;
   - the requirement targets in `docs/engineering/00-requirements-and-plan.md` still hold, or the change says which one moves and why;
   - for a tweak: apply `knobs` to `site/js/spec.js` (and `analysis/` inputs), rerun `analysis/as_drawn.py` and check
     `site/analysis/current.json` matches the report's `after` scorecard; a gap means the live scorecard (`site/js/score.js`) needs fixing too;
   - for a kept shape (`target.type: 'shape'`): the CAD files are already rebuilt from `cad/params.json`. Run the full
     `python3 cad/build.py` (clashes between all parts, not only against the tubes and fans), rerun `analysis/baseline_aero.py`
     and `analysis/as_drawn.py`, bring `D.wing` / `D.stab` / `D.fin` in `site/js/spec.js` and `AERO` in `site/js/sim.js` into step
     with `cad/params.json`, and compare the new margin and stall with the live estimate. If the shape fails, say so in the thread
     before undoing anything: the owner chose it.
4. Close each report: move both files to `reports/closed/`, and add `"status": "closed"`, a one-line `"resolution"`
   (what changed, or why it was declined) and the `"commit"` hash.
5. Commit on a branch, open a pull request that lists the reports it closes, and tell the owner.

A report that needs the owner's decision stays open with a `"question"` field added, asked in the thread.
