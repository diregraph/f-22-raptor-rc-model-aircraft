// Skeleton airframe study page: 3D view of the generated tube layout, nodes, bays, skin and FPV camera, plus the weight case.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { STLLoader } from '../vendor/STLLoader.js';

const R = await (await fetch('analysis/skeleton.json')).json();
let NODE = null; try { NODE = await (await fetch('analysis/node.json')).json(); } catch { }
const SK = R.skeleton, S0 = R.today, S1 = R.skeleton_fpv, SN = R.skeleton_no_fpv;
const $ = (id) => document.getElementById(id), fmt = (n) => Math.round(n).toLocaleString('en');

// ---------------------------------------------------------------- tiles
const T = [['Weight', `${fmt(S1.score.mass)} g`, `today ${fmt(S0.mass)} g · limit 2,000 g`, S1.score.mass <= 2000],
  ['Stability margin', `+${S1.score.margin}%`, 'target +5 to +12%', S1.score.margin >= 5 && S1.score.margin <= 12],
  ['Hardest-working hover fan', `${(S1.score.hover_worst * 100).toFixed(1)}%`, `today ${(S0.hover_worst * 100).toFixed(1)}% · limit 60%`, S1.score.hover_worst <= 0.6],
  ['Stall', `${S1.score.stall} m/s`, 'limit 12 m/s', S1.score.stall <= 12], ['Hover time', `${S1.score.hover_min} min`, 'target 3 min', S1.score.hover_min >= 3],
  ['Tubes', `${SK.tubes.length} · ${fmt(SK.tubes.reduce((a, t) => a + t.g, 0))} g`, `from ${SK.candidates} candidates`, true]];
$('tiles').innerHTML = T.map(([h, v, s, ok]) => `<div class="tile"><span>${h}</span><b>${v}</b><span class="st ${ok ? 'good' : 'crit'}"><i>${ok ? '✓' : '✕'}</i>${s}</span></div>`).join('');

// ---------------------------------------------------------------- 3D
const view = $('view'), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); view.appendChild(renderer.domElement);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, 1, 10, 20000); camera.position.set(720, 480, 900);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, -10, 0); controls.enableDamping = true;
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(400, 900, 600); scene.add(sun);
const groups = {}; const grp = (k) => (groups[k] ||= (scene.add(new THREE.Group()), scene.children.at(-1)));
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: o.metal ?? 0.1, roughness: o.rough ?? 0.55, transparent: o.op != null, opacity: o.op ?? 1, depthWrite: o.op == null, side: o.side ?? THREE.FrontSide });
const AL = mat(0xc9d3dd, { metal: 0.85, rough: 0.3 }), PETG = mat(0xe8742c, { rough: 0.45 }), BAY = mat(0x3fbf8a, { op: 0.55 }), TPU = mat(0x1f6e4f), CRASH = mat(0xd03b3b, { op: 0.45 }),
  FPV = mat(0xb07ad6), SKIN = mat(0x5b7da8, { op: 0.13, side: THREE.DoubleSide }), WING = mat(0x6f8fb4, { rough: 0.7 }), PROP = mat(0x8899aa, { op: 0.35, side: THREE.DoubleSide });
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
function rod(p, q, r, m, g) {
  const a = V(p), b = V(q), L = a.distanceTo(b), mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 20), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(mesh); return mesh;
}
function box(c, s, m, g) { const b = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), m); b.position.set(c[0], c[1], c[2]); g.add(b); return b; }
const DIA = { '6 x 1 round': 6, '8 x 1 round': 8, '10 x 1 round': 10, '12 x 1 round': 12 };
for (const t of SK.tubes) rod(t.p, t.q, DIA[t.tube] / 2, AL, grp('tubes'));
const L = new STLLoader();
async function stl(url) { const r = await fetch(url); if (!r.ok) return null; return L.parse(await r.arrayBuffer()); }
const nodeGeo = await stl('cad/node_spar_left.stl');
for (const [n, socks] of Object.entries(SK.joints)) {
  const p = SK.J[n];
  if (nodeGeo && (n === 'spar_CL' || n === 'spar_CR')) {
    const m = new THREE.Mesh(nodeGeo, PETG); m.position.set(p[0], 0, p[2]); if (n === 'spar_CR') m.scale.set(1, 1, -1); grp('nodes').add(m); continue;
  }
  const s = 9 + 2.2 * socks.length, m = new THREE.Mesh(new THREE.SphereGeometry(s * 0.62, 20, 14), PETG); m.position.set(p[0], p[1], p[2]); grp('nodes').add(m);
}
// avionics bays: PETG trays floating on TPU isolators
const bays = [[[-18, -3, 0], [142, 36, 46], 'battery'], [[367, 2, 0], [56, 20, 40], 'flight controller and receiver'], [[65, -18, 54], [36, 8, 26], 'speed controllers'], [[65, -18, -54], [36, 8, 26], 'speed controllers']];
for (const [c, s] of bays) { box(c, s, BAY, grp('bays')); for (const dx of [-1, 1]) for (const dz of [-1, 1]) rod([c[0] + dx * s[0] * 0.4, c[1] - s[1] / 2 - 4, c[2] + dz * s[2] * 0.4], [c[0] + dx * s[0] * 0.4, c[1] - s[1] / 2, c[2] + dz * s[2] * 0.4], 3, TPU, grp('bays')); }
// FPV: camera on a pan/tilt yoke under the canopy, video transmitter behind
{ const g = grp('fpv'); box([455, 24, 0], [19, 19, 19], FPV, g); rod([455, 24, -1], [470, 24, 0], 6, FPV, g); box([440, 10, 0], [22, 12, 12], FPV, g); box([440, 17, 0], [12, 4, 26], FPV, g); box([330, 5, 0], [30, 6, 26], FPV, g); }
// crash zones: nose cone and belly strip
{ const g = grp('crash'); const geo = await stl('cad/nose_cone.stl'); const M = await (await fetch('cad/manifest.json')).json();
  if (geo) g.add(new THREE.Mesh(geo.applyMatrix4(new THREE.Matrix4().fromArray(M.noseCone.matrix)), CRASH));
  box([110, -48, 0], [380, 5, 60], CRASH, g);
  // skin: today's fuselage shells as a ghost of the outer surface; wings and tail stay as they are
  for (const id of ['nose', 'fanbay', 'tray', 'hatch', 'aftBridge', 'boomL', 'boomR', 'canopy']) { const c = M[id]; if (!c) continue; const gg = await stl(`cad/${c.file}.stl`); if (gg) grp('skin').add(new THREE.Mesh(gg.applyMatrix4(new THREE.Matrix4().fromArray(c.matrix)), SKIN)); }
  for (const id of ['wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'stabL', 'stabR', 'finL', 'finR']) { const c = M[id]; if (!c) continue; const gg = await stl(`cad/${c.file}.stl`); if (gg) grp('wings').add(new THREE.Mesh(gg.applyMatrix4(new THREE.Matrix4().fromArray(c.matrix)), WING)); } }
// propulsion stand-ins
{ const g = grp('props'); const ring = new THREE.Mesh(new THREE.TorusGeometry(81, 4, 10, 48), mat(0x8899aa)); ring.rotation.x = Math.PI / 2; ring.position.set(210, 12, 0); g.add(ring);
  for (const z of [-193, 193]) { const d = new THREE.Mesh(new THREE.CircleGeometry(64, 32), PROP); d.rotation.x = -Math.PI / 2; d.position.set(-139, 4, z); g.add(d); }
  rod([-175, 2, 0], [-262, 2, 0], 44, mat(0x8899aa, { op: 0.5 }), g); rod([-262, 2, 0], [-470, 2, 0], 36, mat(0x8899aa, { op: 0.35 }), g); }
const show = { tubes: true, nodes: true, bays: true, fpv: true, crash: true, skin: true, wings: true, props: true };
const labels = { skin: 'Skin', wings: 'Wings and tail', props: 'Fans', bays: 'Bays', fpv: 'FPV camera', crash: 'Crash zones' };
$('toggles').innerHTML = Object.entries(labels).map(([k, l]) => `<button class="btn on" data-k="${k}">${l}</button>`).join('');
$('toggles').onclick = (e) => { const k = e.target.dataset.k; if (!k) return; show[k] = !show[k]; e.target.classList.toggle('on', show[k]); groups[k].visible = show[k]; };
const qs = new URLSearchParams(location.search); for (const k of (qs.get('hide') || '').split(',')) if (groups[k]) { groups[k].visible = false; show[k] = false; document.querySelector(`[data-k="${k}"]`)?.classList.remove('on'); }
if (qs.get('cam') === 'side') camera.position.set(0, 120, 1500); if (qs.get('cam') === 'top') camera.position.set(1, 1500, 0); if (qs.get('cam') === 'node') { controls.target.set(-160, -5, -92); camera.position.set(-60, 60, -260); }
function size() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
(function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
document.body.dataset.ready = '1';

// ---------------------------------------------------------------- weight case
const add = S1.added, rem = S1.removed, remG = rem.reduce((a, r) => a + r.mass, 0);
const steps = [['Today', S0.mass, 'base'], ['Shells, tubes and clips out', -remG, 'neg'], ...add.map(a => [a.name, a.mass, 'pos']), ['Skeleton with FPV', S1.score.mass, 'base']];
function waterfall() {
  const W = 900, rowH = 30, H = steps.length * rowH + 30, x0 = 300, max = 2100, sx = (v) => x0 + (v / max) * (W - x0 - 60);
  let run = 0, s = '';
  steps.forEach(([n, v, k], i) => {
    const y = 10 + i * rowH; let a, b;
    if (k === 'base') { a = 0; b = v; run = v; } else { a = run; b = run + v; run = b; }
    const c = k === 'base' ? '#3987e5' : k === 'neg' ? '#199e70' : '#d95926';
    s += `<text x="${x0 - 8}" y="${y + 19}" text-anchor="end" fill="#e8eef4" font-size="13">${n}</text><rect x="${sx(Math.min(a, b))}" y="${y + 5}" width="${Math.max(2, Math.abs(sx(b) - sx(a)))}" height="${rowH - 10}" rx="3" fill="${c}"/>
      <text x="${sx(Math.max(a, b)) + 6}" y="${y + 19}" fill="#94a3b3" font-size="12.5">${k === 'base' ? fmt(v) + ' g' : (v > 0 ? '+' : '−') + fmt(Math.abs(v)) + ' g'}</text>`;
  });
  s += `<line x1="${sx(2000)}" x2="${sx(2000)}" y1="0" y2="${H - 20}" stroke="#d03b3b" stroke-dasharray="4 4"/><text x="${sx(2000)}" y="${H - 6}" text-anchor="middle" fill="#d03b3b" font-size="12">2,000 g limit</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight waterfall from today's aircraft to the skeleton version">${s}</svg>`;
}
function logChart() {
  const lg = SK.log, W = 440, H = 200, p = 36, mx = Math.max(...lg.map(l => l.g)), sx = (i) => p + i / (lg.length - 1) * (W - 2 * p), sy = (g) => H - p + 10 - g / mx * (H - 2 * p);
  const d = lg.map((l, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(l.g).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Skeleton mass as tubes are removed"><path d="${d}" fill="none" stroke="#3987e5" stroke-width="2.5"/>
  <text x="${p}" y="16" fill="#94a3b3" font-size="12">tubes + nodes, g</text><text x="${sx(0)}" y="${sy(lg[0].g) - 6}" fill="#e8eef4" font-size="12">${lg[0].tubes} tubes, ${fmt(lg[0].g)} g</text>
  <text x="${sx(lg.length - 1)}" y="${sy(lg.at(-1).g) - 8}" text-anchor="end" fill="#e8eef4" font-size="12">${lg.at(-1).tubes} tubes, ${fmt(lg.at(-1).g)} g</text>
  <line x1="${p}" x2="${W - p}" y1="${H - p + 10}" y2="${H - p + 10}" stroke="rgba(160,190,220,.16)"/><text x="${W / 2}" y="${H - 4}" text-anchor="middle" fill="#94a3b3" font-size="12">removal step (each keeps every load case safe)</text></svg>`;
}
const G = (ids) => rem.filter(r => ids.includes(r.id)).reduce((a, r) => a + r.mass, 0), A = (id) => add.filter(a => a.id === id || (Array.isArray(id) && id.includes(a.id))).reduce((s, a) => s + a.mass, 0);
const NET = [['Tubes: aluminium in place of carbon, more of them', G(['longeronL', 'longeronR', 'spar']), A('alSkeleton')],
  ['Structural shells become a thin skin with ribs and crash zones', G(['nose', 'noseCone', 'fanbay', 'tray', 'hatch', 'aftBridge', 'boomL', 'boomR', 'coverRF', 'coverRA', 'coverLF', 'coverLA']), A('skin')],
  ['PETG nodes and isolated bays in place of carrier, brackets, trays and nose ring', G(['sparCarrier', 'noseRing', 'hatchLatch', 'batteryTray', 'fcSled', 'gearBktR', 'gearBktL', 'gearMountN']), A(['petgNodes', 'bays'])],
  ['FPV camera, pan/tilt and transmitter (new)', 0, A(['fpvCam', 'fpvPanTilt', 'fpvVtx'])]];
const row = (c) => `<tr>${c.map((x, i) => `<td${i ? ' class="n"' : ''}>${x}</td>`).join('')}</tr>`;
const ok = (b) => `<span class="st ${b ? 'good' : 'crit'}"><i>${b ? '✓' : '✕'}</i>${b ? 'Met' : 'Not met'}</span>`;
const sc = (s, m) => [fmt(s.mass) + ' g', '+' + s.margin + '%', (s.hover_worst * 100).toFixed(1) + '%', s.stall + ' m/s', (s.hover_min ?? 3.4) + ' min'];
$('app').classList.remove('mute');
$('app').innerHTML = `
<h2>The answer so far</h2>
<p>The generated skeleton comes out <b>${fmt(SN.score.mass - S0.mass)} to ${fmt(S1.score.mass - S0.mass)} g heavier than today</b>: ${fmt(SN.score.mass)} g without the FPV (first-person view) camera, ${fmt(S1.score.mass)} g with it, against ${fmt(S0.mass)} g today.
Without the camera it meets every target; the camera puts it just over the 2,000 g and 60% limits, and a micro receiver alone does not quite buy that back. A fixed camera (−11 g) or thinner-walled longerons would.
The uncertainty is mostly in the skin: how many stiffening ribs a 0.55 mm foamed skin needs over a 150 mm span is a print test, not a calculation.</p>
<div class="card scroll"><table><tr><th></th><th class="n">Weight</th><th class="n">Margin</th><th class="n">Worst hover fan</th><th class="n">Stall</th><th class="n">Hover</th></tr>
${row(['Today (tubes + structural shells)', ...sc(S0)])}${row(['Skeleton, no FPV', ...sc(SN.score)])}${row(['Skeleton + FPV head tracking', ...sc(S1.score)])}${R.skeleton_fpv_micro_rx ? row(['Skeleton + FPV + micro receiver (−13 g)', ...sc(R.skeleton_fpv_micro_rx.score)]) : ''}${row(['Target', '≤ 2,000 g', '+5 to +12%', '≤ 60%', '≤ 12 m/s', '≥ 3 min'])}</table></div>
<h2>Where the weight goes</h2>
<div class="card chart">${waterfall()}</div>
<div class="card scroll"><table><tr><th>Change</th><th class="n">Out</th><th class="n">In</th><th class="n">Net</th></tr>
${NET.map(([n, o, i]) => `<tr><td>${n}</td><td class="n">−${fmt(o)} g</td><td class="n">+${fmt(i)} g</td><td class="n" style="color:${i - o > 0 ? '#e8742c' : '#3fbf8a'}">${i - o > 0 ? '+' : '−'}${fmt(Math.abs(i - o))} g</td></tr>`).join('')}</table></div>
<p class="mute">Lesson from the generator: at this size the joints, not the tubes, decide the weight. Its first layout had ${SK.log[0].tubes} tubes and weighed ${fmt(SK.log[0].g)} g; removing every tube that the loads did not need took it to ${SK.tubes.length} tubes and ${fmt(SK.log.at(-1).g)} g.</p>
<h2>Generative layout</h2>
<div class="grid2"><div class="card chart">${logChart()}</div>
<div class="card"><p><b>How it was generated.</b> ${SK.candidates} candidate tubes: every tube between neighbouring stations that does not cross the lift fan, battery, main fan, nozzle swing or nose bay. A 3D frame model (6 degrees of freedom per joint) carries six load cases with inertia relief. Topology optimisation picks the useful tubes, then each one gets the lightest tube from the shop list, and tubes are removed one at a time while strength (safety factor 1.5 on 6063 yield), buckling (factor 2) and fan-to-nozzle twist (≤ ${1.5}°) still hold.</p>
<p>Worst safety factor ${SK.stiffness.worst_sf}. Fan-to-nozzle twist ${SK.stiffness.fan_to_nozzle_twist_deg}°. The same model with only today's three tubes, without the shells, fails (safety factor ${SK.today.worst_sf}), which shows that today's shells do carry load.</p></div></div>
<div class="card scroll"><table><tr><th>Load case</th></tr>${SK.case_names.map(c => `<tr><td>${c}</td></tr>`).join('')}</table></div>
<div class="card scroll"><table><tr><th>Tube</th><th>From</th><th>To</th><th class="n">Length</th><th class="n">Mass</th><th class="n">Safety factor</th></tr>
${SK.tubes.map(t => `<tr><td>${t.tube}</td><td>${t.a}</td><td>${t.b}</td><td class="n">${t.L} mm</td><td class="n">${t.g} g</td><td class="n">${t.sf}</td></tr>`).join('')}</table></div>
<h2>Generative node</h2>
<div class="card"><p>The busiest joint, where the left longeron meets the wing spar, was grown by 3D topology optimisation under the end forces of all six load cases. The spar runs straight through it. The tube bores carry the wires between nodes; inside the node a 6 mm channel climbs over the spar and exits through a connector port on top.
${NODE ? `Result: <b>${NODE.mass_g} g</b> of PETG in a ${NODE.box_mm.map(v => v.toFixed(0)).join(' × ')} mm box, on a ${NODE.cell_mm} mm grid.` : 'Node result not generated yet.'}</p>
${NODE && NODE.sweep ? `<table><tr><th>Material allowed</th><th class="n">Mass</th><th class="n">Peak stress (99th percentile)</th><th class="n">Flexibility vs stiffest</th><th></th></tr>${NODE.sweep.map(r => `<tr><td>${(r.volfrac * 100).toFixed(1)}% of the free space</td><td class="n">${r.mass_g} g</td><td class="n">${r.stress_p99} MPa</td><td class="n">${(r.compliance / NODE.sweep[0].compliance).toFixed(1)}×</td><td>${r.chosen ? '<b>chosen</b>' : ''}</td></tr>`).join('')}</table>
<p class="mute">Every version is far below the ${NODE.allowable_mpa} MPa allowed for PETG across its layers, so stiffness decides: the chosen node is the lightest one no more than three times as flexible as the stiffest. About 11 g of any node is fixed: the sockets, the grip on the spar and the walls of the wire channel.</p>` : ''}
<p><a class="btn" href="?cam=node&hide=skin,wings,props,bays,crash">Zoom to this node</a></p></div>
<h2>Open questions</h2>
<div class="card"><table>
<tr><td>Which aluminium tube sizes are in the shops</td><td>The study assumes round 6063 tube, 6, 8, 10 and 12 mm with 1 mm walls. Thinner walls would save weight on the long longerons</td></tr>
<tr><td>How stiff a printed socket is</td><td>The frame model treats every node as rigid. A PETG socket that lets the tube rock will twist the frame more; a bench test on one printed node settles it</td></tr>
<tr><td>Skin ribs</td><td>25% extra for stiffening is an estimate; one printed panel tells us whether it oil-cans</td></tr>
<tr><td>CFD</td><td>Nothing in the repository runs CFD yet. Proposed: OpenFOAM on the Mac for the fan intakes and the canopy with the camera dome</td></tr></table></div>`;
