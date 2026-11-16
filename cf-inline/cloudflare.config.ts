// Single-script fallback: the whole site inlined into one Worker.
// Use only where Cloudflare's asset-upload step is unavailable; normally run `cf deploy site`.
import { defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.js" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "f35b-vtol-twin",
		compatibilityDate: "2026-11-01",
		entrypoint,
	},
});
