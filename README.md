# F-35B VTOL RC model

A 3D-printed, snap-together vertical take-off model in the layout of the F-35B,
sized around parts on hand.

- `site/` — interactive digital twin (three.js, no build step). Explode, inspect
  parts, section cut, assembly steps, balance and thrust overlay, sim JSON export.
  Opens in a scale-paint finish; the "Scale finish" button switches to filament colours.
  `/story.html` is the build journal: how it flies, the four design loops, the
  reference build, and next steps. `/?shot` renders the model without panels (used for
  the stills in `site/img/`).
- `site/js/spec.js` — single source of truth: dimensions, parts, masses,
  thrusters, joints. A later simulator should read this file.
- `site/js/sim.js` — first-pass flight physics and flight-controller model (also runs in Node).
- `cad/build.py` — parametric CAD (CadQuery) for every printed part: the F-35B-shaped
  LW-PLA airframe and all PETG structure. `python3 cad/build.py` writes print-pose STL
  and STEP to `cad/`, copies the STLs plus a manifest to `site/cad/` (the twin loads
  them and offers them for download), and checks every part for clashes against the
  tubes, servos, propeller discs, battery and each other. Then run
  `python3 tools/sync-mass.py` to copy the mass estimates into the spec.
- `cad/propulsion.py` — bench kit: a printed 80 mm ducted fan for the EMAX 2306 and a
  three-bearing swivel nozzle with a ring gear on each bearing, each turned by a small
  gearmotor and homed by its own nozzle board (`firmware/nozzle/`). Interactive model at `/nozzle.html`;
  joint maths in `site/js/nozzle.js`. Read `docs/ducted-propulsion.md` first: it is an
  untested design with a thrust-stand gate before any airframe change.
- Layout history and open problems: `docs/engineering/` (latest: `06-scale-shape.md`;
  proposed next: `05-ardupilot-sitl-plan.md`, flying ArduPilot against this model in simulation;
  requirements v2 in `00-requirements-and-plan.md`).
- `docs/bill-of-materials.md` — what is owned, what is printed, and the roughly $90 still to buy.
- `analysis/` — engineering studies (AeroSandbox, JSBSim, blade-element fan model, topology
  optimisation). Results at `/analysis.html`; summary in `docs/engineering/`.
- `tools/sim-test.mjs`, `tools/nozzle-test.mjs` — headless flight and nozzle checks: `npm test`.
- `docs/build-plan.md` — 14-day build plan. `docs/source-video.md` — reference build.

Run locally: `npm run dev`, open http://localhost:8765.

Workbench (owner's Mac): `npm run bench` serves the same site on http://localhost:8765 and the Mac's Wi-Fi address
(for a phone on the home network), and adds a **Report** button: tap a part of the 3D model or a point on a chart,
write a note, and the report is saved with a pinned screenshot to `reports/open/`. Commit them with the rest of the
repo; Claude fixes them in batches ("work the reports", see `reports/README.md`). On the public site the button never appears.
Live: https://f35b.jitfabit.com

Deploy to Cloudflare with the `cf` CLI: `npx cf deploy site` (assets-only Worker).

Fallback where the asset-upload step is blocked (for example behind a proxy that
rewrites the Authorization header): `npm run deploy:inline`. It inlines `site/`
into one Worker script (`cf-inline/`) and deploys that with `cf deploy`.
