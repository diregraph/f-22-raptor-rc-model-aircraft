# F-35B VTOL RC model

A 3D-printed, snap-together vertical take-off model in the layout of the F-35B,
sized around parts on hand.

- `site/` — interactive digital twin (three.js, no build step). Explode, inspect
  parts, section cut, assembly steps, balance and thrust overlay, sim JSON export.
- `site/js/spec.js` — single source of truth: dimensions, parts, masses,
  thrusters, joints. A later simulator should read this file.
- `docs/build-plan.md` — 14-day build plan. `docs/source-video.md` — reference build.

Run locally: `npm run dev`, open http://localhost:8765.
Live: https://f35b.jitfabit.com

Deploy to Cloudflare with the `cf` CLI: `npx cf deploy site` (assets-only Worker).

Fallback where the asset-upload step is blocked (for example behind a proxy that
rewrites the Authorization header): `npm run deploy:inline`. It inlines `site/`
into one Worker script (`cf-inline/`) and deploys that with `cf deploy`.
