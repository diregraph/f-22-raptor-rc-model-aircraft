// Bundles site/ into a single Worker script (files inlined as base64).
// Fallback for environments where Cloudflare's asset-upload step is unavailable;
// the normal path is `wrangler deploy` with the assets directory in wrangler.jsonc.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = 'site', files = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else { const b = readFileSync(p); files['/' + relative(root, p).split('\\').join('/')] = { t: types[extname(p)] || 'text/plain; charset=utf-8', e: '"' + createHash('sha1').update(b).digest('hex').slice(0, 16) + '"', b: b.toString('base64') }; }
  }
})(root);

const src = `const F = ${JSON.stringify(files)};
const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export default { fetch(req) {
  let p = new URL(req.url).pathname; if (p.endsWith('/')) p += 'index.html';
  const f = F[p]; if (!f) return new Response('Not found', { status: 404 });
  const h = { 'content-type': f.t, etag: f.e, 'cache-control': p.startsWith('/vendor/') ? 'public, max-age=604800' : 'public, max-age=60', 'x-content-type-options': 'nosniff' };
  if (req.headers.get('if-none-match') === f.e) return new Response(null, { status: 304, headers: h });
  return new Response(dec(f.b), { headers: h });
} };`;
mkdirSync('dist', { recursive: true }); writeFileSync('dist/worker.js', src);
console.log(Object.keys(files).length, 'files,', (src.length / 1024).toFixed(0), 'KB');
