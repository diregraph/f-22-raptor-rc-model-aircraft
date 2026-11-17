// Headless checks for the workbench server (tools/bench.mjs): validation, LAN-only guard, save + list round trip.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';

const dir = await mkdtemp(join(tmpdir(), 'bench-'));
process.env.BENCH_REPORTS = dir;
const { isLocal, cleanReport, reportId, makeServer } = await import('./bench.mjs');

// who may connect
for (const a of ['127.0.0.1', '::1', '::ffff:192.168.1.20', '10.0.0.5', '172.20.1.1', 'fd12::1']) assert.ok(isLocal(a), a);
for (const a of ['8.8.8.8', '172.32.0.1', '::ffff:1.2.3.4', '']) assert.ok(!isLocal(a), a);

// ids and validation
assert.equal(reportId('Wing root: too thin!', new Date(2026, 10, 17, 9, 5, 7)), '20261117-090507-wing-root-too-thin');
assert.throws(() => cleanReport({ kind: 'rant', title: 'x' }), /Pick Error/);
assert.throws(() => cleanReport({ kind: 'error', title: '  ' }), /title/);
assert.throws(() => cleanReport({ kind: 'error', title: 'x', image: 'data:image/png;base64,AAAA' }), /JPEG/);
const { report } = cleanReport({ kind: 'problem', title: 'T', note: 'n'.repeat(9000), target: { type: 'part', id: 'nose' } });
assert.equal(report.note.length, 8000); assert.equal(report.image, null); assert.equal(report.status, 'open');

// round trip through a real server
const srv = makeServer(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
try {
  assert.equal((await (await fetch(base + '/api/ping')).json()).bench, true);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const res = await fetch(base + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'error', title: 'Nose cone clashes', note: 'see pin', page: 'index.html', target: { type: 'part', id: 'noseCone', point: [500, 0, 0] }, image: jpeg }) });
  assert.equal(res.status, 201); const saved = await res.json();
  const files = (await readdir(join(dir, 'open'))).sort();
  assert.deepEqual(files, [`${saved.id}.jpg`, `${saved.id}.json`]);
  assert.equal((await readFile(join(dir, 'open', `${saved.id}.jpg`)))[0], 0xff);
  const list = await (await fetch(base + '/api/reports')).json();
  assert.equal(list.length, 1); assert.equal(list[0].imageUrl, `/reports/open/${saved.id}.jpg`);
  assert.equal((await fetch(base + list[0].imageUrl)).status, 200);
  assert.equal((await fetch(base + '/api/reports', { method: 'POST', body: '{bad' })).status, 400);
  const raw = path => new Promise((ok, no) => get({ host: '127.0.0.1', port: srv.address().port, path }, r => { r.resume(); ok(r.statusCode); }).on('error', no));
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2Fpackage.json', '/reports/..%2F..%2Fpackage.json']) assert.notEqual(await raw(p), 200, p);   // no escaping site/ or reports/
  assert.equal(await raw('/..%2Fpackage.json'), 403);
  assert.equal((await fetch(base + '/index.html')).status, 200);
} finally { srv.close(); await rm(dir, { recursive: true, force: true }); }
console.log('bench: ok');
