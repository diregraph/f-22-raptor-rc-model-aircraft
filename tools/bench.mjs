// Workbench: the site plus a local report store, for the owner's Mac. No dependencies, no network beyond the home LAN.
//   npm run bench            -> http://localhost:8765 (and the Mac's Wi-Fi address, for the phone)
//   PORT=9000 npm run bench  -> another port
// Reports land in reports/open/<id>.json (+ <id>.jpg). Claude works them in batches: see reports/README.md.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, extname, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site'), REPORTS = process.env.BENCH_REPORTS || join(ROOT, 'reports'), PREVIEW = join(ROOT, '.bench', 'preview');
const CAD_PY = process.env.CAD_PYTHON || join(ROOT, '.venv-cad', 'bin', 'python');
const PORT = +process.env.PORT || 8765, HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 8 << 20;   // 8 MB: one JPEG screenshot plus the note
const KINDS = ['error', 'problem', 'suggestion'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.stl': 'model/stl', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon' };

// Only this machine and the home network may talk to it: loopback, RFC 1918 private ranges, link-local, IPv6 ULA.
export function isLocal(addr = '') {
  const a = addr.replace(/^::ffff:/, '');
  return a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^f[cd]/i.test(a) || /^fe80:/i.test(a);
}

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
export function reportId(title, now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${slug(title)}`;
}

// Validate and normalise what the browser sent. Returns { report, jpeg } or throws with a message for the user.
export function cleanReport(body, now = new Date()) {
  if (!body || typeof body !== 'object') throw new Error('Expected a JSON report.');
  const kind = KINDS.includes(body.kind) ? body.kind : null; if (!kind) throw new Error('Pick Error, Problem or Suggestion.');
  const title = String(body.title || '').trim().slice(0, 140); if (!title) throw new Error('Give the report a title.');
  let jpeg = null;
  if (body.image) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image); if (!m) throw new Error('Screenshot must be a JPEG.');
    jpeg = Buffer.from(m[1], 'base64');
  }
  const id = reportId(title, now);
  const report = {
    id, kind, title, note: String(body.note || '').slice(0, 8000), status: 'open', created: now.toISOString(),
    page: String(body.page || '').slice(0, 200),          // which page: index.html, analysis.html ...
    target: body.target && typeof body.target === 'object' ? body.target : null,   // part id + point, or chart + value
    view: body.view && typeof body.view === 'object' ? body.view : null,           // camera + controls, reopens the same picture
    viewUrl: String(body.viewUrl || '').slice(0, 4000),
    image: jpeg ? `${id}.jpg` : null,
  };
  return { report, jpeg };
}

// ---- live CAD: one long-running Python with CadQuery loaded (cad/live.py), requests answered strictly in turn
let cad = null;
function startCad() {
  if (cad) return cad;
  if (!existsSync(CAD_PY)) return (cad = { error: `No CadQuery Python at ${CAD_PY}. Install it (see README, "Workbench"), or set CAD_PYTHON.` });
  const proc = spawn(CAD_PY, [join(ROOT, 'cad', 'live.py')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = []; let hello;
  const ready = new Promise((ok, no) => { hello = { ok, no }; });
  createInterface({ input: proc.stdout }).on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg.ready) return hello.ok(msg);
    waiting.shift()?.ok(msg);
  });
  proc.on('exit', code => { const e = new Error(`CAD worker stopped (exit ${code})`); hello.no(e); waiting.splice(0).forEach(w => w.no(e)); cad = null; });
  let chain = Promise.resolve();
  const ask = req => (chain = chain.then(() => ready).then(() => new Promise((ok, no) => { waiting.push({ ok, no }); proc.stdin.write(JSON.stringify(req) + '\n'); })));
  return (cad = { ready, ask, proc });
}
let previewN = 0;
async function shapeKeep(body) {
  const c = startCad(); if (c.error) throw new Error(c.error);
  const ans = await c.ask({ op: 'keep', params: body.params }); if (!ans.ok) return ans;
  await new Promise(ok => execFile(CAD_PY, [join(ROOT, 'tools', 'sync-mass.py')], { cwd: ROOT }, () => ok()));   // CAD mass estimates into spec.js
  const lines = [];   // a report so Claude checks the kept shape: full build, clashes, aero rerun, spec.js
  for (const [g, v] of Object.entries(ans.after)) for (const [q, x] of Object.entries(v)) if (ans.before[g][q] !== x) lines.push(`${g}.${q} ${ans.before[g][q]} → ${x}`);
  const { report } = cleanReport({ kind: 'suggestion', title: `Kept shape change: ${lines.join(', ')}`.slice(0, 140), note: body.note || '', page: 'index.html',
    target: { type: 'shape', changes: lines, before: ans.before, after: ans.after, built: ans.built, needs: ['full cad/build.py clash check', 'analysis rerun (baseline_aero, as_drawn)', 'spec.js D.wing/stab/fin and sim AERO in step with cad/params.json'] },
    view: body.view, viewUrl: body.viewUrl, image: body.image });
  const dir = join(REPORTS, 'open'); await mkdir(dir, { recursive: true });
  if (body.image) await writeFile(join(dir, report.image), Buffer.from(body.image.split(',')[1], 'base64'));
  await writeFile(join(dir, `${report.id}.json`), JSON.stringify(report, null, 2) + '\n');
  return { ...ans, report: `reports/open/${report.id}.json` };
}

async function listReports() {
  const out = [];
  for (const status of ['open', 'closed']) {
    let files = []; try { files = await readdir(join(REPORTS, status)); } catch { continue; }
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try { const r = JSON.parse(await readFile(join(REPORTS, status, f), 'utf8')); out.push({ ...r, status, imageUrl: r.image ? `/reports/${status}/${r.image}` : null }); } catch { /* skip a broken file */ }
    }
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw new Error('Report too large (8 MB max).'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
async function serveFile(res, base, rel) {
  const p = normalize(join(base, rel));
  if (p !== base && !p.startsWith(base + sep)) return send(res, 403, { error: 'forbidden' });
  try {
    let f = p; if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    send(res, 200, await readFile(f), TYPES[extname(f).toLowerCase()] || 'application/octet-stream');
  } catch { send(res, 404, 'Not found', 'text/plain'); }
}

export function makeServer() {
  return createServer(async (req, res) => {
    if (!isLocal(req.socket.remoteAddress)) return send(res, 403, { error: 'Workbench only answers this Mac and the home network.' });
    const url = new URL(req.url, 'http://x'), path = decodeURIComponent(url.pathname);
    try {
      if (path === '/api/ping') return send(res, 200, { bench: true, version: 1 });
      if (path === '/api/reports' && req.method === 'GET') return send(res, 200, await listReports());
      if (path === '/api/reports' && req.method === 'POST') {
        let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message.startsWith('Report too') ? e.message : 'Not valid JSON.' }); }
        const { report, jpeg } = cleanReport(body);
        const dir = join(REPORTS, 'open'); await mkdir(dir, { recursive: true });
        if (jpeg) await writeFile(join(dir, report.image), jpeg);
        await writeFile(join(dir, `${report.id}.json`), JSON.stringify(report, null, 2) + '\n');
        console.log(`report saved: reports/open/${report.id}.json  [${report.kind}] ${report.title}`);
        return send(res, 201, { ...report, path: `reports/open/${report.id}.json` });
      }
      if (path === '/api/shape' && req.method === 'GET') {
        const c = startCad(); if (c.error) return send(res, 200, { available: false, error: c.error });
        try { const h = await c.ready; return send(res, 200, { available: true, ...h }); } catch (e) { return send(res, 200, { available: false, error: e.message }); }
      }
      if (path.startsWith('/api/shape/') && req.method === 'POST') {
        const op = path.slice('/api/shape/'.length), c = startCad(); if (c.error) return send(res, 503, { error: c.error });
        let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return send(res, 400, { error: 'Not valid JSON.' }); }
        if (op === 'preview') {
          const n = ++previewN, out = join(PREVIEW, String(n));
          const ans = await c.ask({ op: 'preview', params: body.params, out });
          if (ans.ok) for (const p of Object.values(ans.parts)) p.url = `/preview/${n}/${p.stl}`;
          return send(res, ans.ok ? 200 : 400, ans);
        }
        if (op === 'check') { const ans = await c.ask({ op: 'check' }); return send(res, ans.ok ? 200 : 400, ans); }
        if (op === 'keep') { const ans = await shapeKeep(body); return send(res, ans.ok ? 200 : 400, ans); }
        return send(res, 404, { error: 'unknown shape operation' });
      }
      if (path.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });
      if (path.startsWith('/preview/')) return serveFile(res, PREVIEW, path.slice('/preview/'.length));
      if (path.startsWith('/reports/')) return serveFile(res, REPORTS, path.slice('/reports/'.length));
      return serveFile(res, SITE, path === '/' ? 'index.html' : path.slice(1));
    } catch (e) { send(res, 400, { error: e.message }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  makeServer().listen(PORT, HOST, () => {
    const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
    console.log(`F-35B workbench\n  this Mac:  http://localhost:${PORT}\n${lan.map(u => `  phone:     ${u}`).join('\n')}\n  reports -> ${REPORTS}${sep}open`);
  });
}
