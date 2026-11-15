import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { STLLoader } from '../vendor/STLLoader.js';
import { D, PARTS, PART, GROUPS, MATERIALS, STEPS, THRUSTERS, JOINTS, WIRING, CAD, PRINT_PETG, PRINT_LW, massProps, hoverTrim, nozzleExit } from './spec.js';
import { solve as solveNozzle, exitDirection } from './nozzle.js';
import { createSim } from './sim.js';
import { buildModel } from './build.js';

const $ = s => document.querySelector(s);
const rad = d => d * Math.PI / 180;
const state = { sim: false, explode: 0, tilt: 90, tiltTarget: 90, yaw: 0, elev: 0, battX: D.battery.xDefault, cut: 470, spin: false, xray: false, forces: true, mode: 'hover', step: 1, selected: null, hidden: new Set(), hover: null };

// ---------- renderer / scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;
const camera = new THREE.PerspectiveCamera(32, 1, 10, 30000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 150; controls.maxDistance = 6000;
const HOME_TARGET = new THREE.Vector3(-10, -10, 0);
let dirty = 3; controls.addEventListener('change', () => { dirty = Math.max(dirty, 2); });

const sun = new THREE.DirectionalLight(0xfff4e6, 2.4); sun.position.set(420, 1100, 520); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 100, far: 2600 }); sun.shadow.bias = -0.0005; sun.shadow.radius = 6;
scene.add(sun, new THREE.HemisphereLight(0xbcd7ff, 0x1a2230, 0.55));
const rim = new THREE.DirectionalLight(0x6fb6ff, 1.1); rim.position.set(-700, 300, -600); scene.add(rim);

const ground = new THREE.Group(); ground.position.y = D.groundY; scene.add(ground);
{ const sh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42 })); sh.receiveShadow = true; ground.add(sh);
  const g1 = new THREE.GridHelper(3000, 30, 0x3d566e, 0x22313f); g1.material.transparent = true; g1.material.opacity = 0.55; ground.add(g1);
  const g2 = new THREE.GridHelper(3000, 150, 0x1a2633, 0x1a2633); g2.material.transparent = true; g2.material.opacity = 0.35; g2.position.y = -0.2; ground.add(g2); }

let MANIFEST = {};
async function loadCad() {   // every printed part comes from the CAD build; if a file is missing the twin falls back to a stand-in shape
  const out = {}, L = new STLLoader();
  try { MANIFEST = await (await fetch('cad/manifest.json')).json(); } catch { return out; }
  await Promise.all(Object.entries(MANIFEST).map(async ([id, c]) => {
    try {
      const r = await fetch(`cad/${c.file}.stl`); if (!r.ok) return;
      const m = new THREE.Matrix4().fromArray(c.matrix), geo = L.parse(await r.arrayBuffer()).applyMatrix4(m);   // print pose -> assembly pose
      out[id] = { geo, material: c.material, axis: new THREE.Vector3(0, 0, 1).transformDirection(m) };          // layer lines follow the real print direction
    } catch { /* stand-in */ }
  }));
  try {   // fan and nozzle parts live in their own kit frame; build.js places them
    const kit = await (await fetch('cad/kit/kit.json')).json(), idMap = { duct: 'edfDuct' };
    out.__kit = kit.geometry;
    await Promise.all(Object.entries(kit.parts).map(async ([kid, c]) => {
      const r = await fetch(`cad/kit/${c.file}.stl`); if (!r.ok) return;
      const id = idMap[kid] || kid, entry = { geo: L.parse(await r.arrayBuffer()).applyMatrix4(new THREE.Matrix4().fromArray(c.matrix)), material: 'PETG' };
      out[id] = entry;
      const info = { file: 'kit/' + c.file, material: 'PETG', bed: c.bed, mass: c.mass, note: c.note };
      for (const tid of id === 'collar' ? ['collar2', 'collar3'] : id === 'collarJ1' ? ['collar1'] : id === 'pinion' ? ['pinion1', 'pinion2', 'pinion3'] : [id]) MANIFEST[tid] = info;
    }));
  } catch { /* no kit: the fan and nozzle will be missing */ }
  return out;
}
const model = buildModel(await loadCad()); scene.add(model.root);
const { parts, movers, props, fans, joints, shells } = model;
const NZ = joints.nozzle, XAX = new THREE.Vector3(1, 0, 0);
function setNozzle(deflection, yaw) {   // three bearing angles from two commands
  const j = solveNozzle(deflection, yaw);
  NZ.g1.quaternion.setFromAxisAngle(XAX, rad(j.a)); NZ.g2.quaternion.setFromAxisAngle(NZ.n2, rad(j.b)); NZ.g3.quaternion.setFromAxisAngle(NZ.n3, rad(j.c));
  [j.a, j.b, j.c].forEach((t, i) => { NZ.pinions[i].rotation.x = -rad(t) * NZ.ratio; });
  const e = exitDirection(j.a, j.b, j.c);
  return new THREE.Vector3(e[0], -e[1], e[2]);   // thrust direction in aircraft axes (the kit frame faces aft)
}
const partMats = new Map();
parts.forEach((o, id) => { const ms = new Set(); o.traverse(c => { if (c.isMesh && c.material.emissive) ms.add(c.material); }); partMats.set(id, [...ms]); });
const shellMats = shells.flatMap(id => { const a = []; parts.get(id).traverse(c => { if (c.isMesh) a.push(c.material); }); return a; });
shellMats.forEach(m => { m.userData.o = m.opacity; m.userData.t = m.transparent; });

// ---------- balance & thrust overlay
const overlay = new THREE.Group(); model.root.add(overlay);   // body frame, so it follows the aircraft in the simulator
function mkArrow(color) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
  const g = new THREE.Group(), shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1, 12).translate(0, 0.5, 0), m), head = new THREE.Mesh(new THREE.ConeGeometry(9, 24, 16).translate(0, 12, 0), m);
  shaft.renderOrder = head.renderOrder = 10; g.add(shaft, head); overlay.add(g);
  return { g, set(o, dir, len) { g.visible = len > 4; g.position.copy(o); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); shaft.scale.y = Math.max(1, len - 24); head.position.y = Math.max(1, len - 24); } };
}
const arrows = { F: mkArrow(0x1fd1bd), M: mkArrow(0x1fd1bd), L: mkArrow(0x1fd1bd), R: mkArrow(0x1fd1bd), W: mkArrow(0xffc928) };
const cgBall = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffc928, depthTest: false })); cgBall.renderOrder = 11; overlay.add(cgBall);
const cgRing = new THREE.Mesh(new THREE.RingGeometry(14, 17, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); overlay.add(cgRing);

// ---------- apply state
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 470);
let mp = massProps(state.battX), trim = hoverTrim(mp, 90);

function partVisible(id) { return !state.hidden.has(id) && (state.mode !== 'asm' || PART[id].step <= state.step); }
function apply() {
  const asm = state.mode === 'asm';
  joints.battG.userData.home.x = state.battX;
  for (const o of movers) {
    const id = o.userData.partId, t = state.explode + (asm && id && PART[id].step === state.step ? 0.42 : 0);
    o.position.copy(o.userData.home).addScaledVector(o.userData.ex, t);
  }
  let mDir = null;
  if (!state.sim) { mDir = setNozzle(state.tilt, state.yaw); joints.stabs.forEach(s => s.rotation.z = rad(state.elev)); }
  parts.forEach((o, id) => {
    o.visible = partVisible(id);
    const sel = id === state.selected, hov = id === state.hover, cur = asm && PART[id].step === state.step;
    for (const m of partMats.get(id)) { m.emissive.setHex(sel ? 0x1e6fd6 : cur ? 0xb84a00 : hov ? 0x2a3a4d : 0x000000); m.emissiveIntensity = sel ? 0.75 : cur ? 0.45 : hov ? 0.6 : 0; }
  });
  shellMats.forEach(m => { m.transparent = state.xray || m.userData.t; m.opacity = state.xray ? 0.13 : m.userData.o; m.depthWrite = !state.xray; });
  const cutOn = state.cut < 468; clipPlane.constant = state.cut; renderer.clippingPlanes = cutOn ? [clipPlane] : [];
  ground.visible = state.explode < 0.03 || state.sim;
  // balance
  mp = massProps(state.battX); trim = hoverTrim(mp, state.tilt);
  const hov = state.tilt >= 45, show = state.forces && state.explode < 0.03 && !asm;
  overlay.visible = show;
  cgRing.visible = !state.sim;
  if (show && !state.sim) {
    const cg = new THREE.Vector3(...mp.cg); cgBall.position.copy(cg); cgRing.position.set(cg.x, D.groundY + 0.6, cg.z);
    const up = new THREE.Vector3(0, 1, 0), k = 0.22, ex = nozzleExit(state.tilt);
    arrows.F.set(new THREE.Vector3(D.fanX, 40, 0), up, hov ? trim.F * k : 0);
    arrows.L.set(new THREE.Vector3(D.rollX, 14, -D.rollZ), up, hov ? trim.L * k : 0);
    arrows.R.set(new THREE.Vector3(D.rollX, 14, D.rollZ), up, hov ? trim.R * k : 0);
    arrows.M.set(new THREE.Vector3(...ex.pos), mDir || up, (hov ? trim.M * ex.eff : mp.mass * 0.3) * k);
    arrows.W.set(cg.clone(), new THREE.Vector3(0, -1, 0), 60);
  }
  hud(); syncUI(); dirty = Math.max(dirty, 2);
}

// ---------- HUD
function hud() {
  const usable = THRUSTERS[0].maxG + THRUSTERS[1].maxG * nozzleExit(90).eff + THRUSTERS[2].maxG + THRUSTERS[3].maxG;
  const tw = usable / mp.mass, thr = Math.max(trim.f, trim.fLift);
  const cls = v => v >= 1.8 ? 'ok' : v >= 1.5 ? 'warn' : 'bad';
  $('#hud').innerHTML = [
    ['Weight', `${Math.round(mp.mass)} g`, ''],
    ['Balance point', `${Math.round(mp.cg[0])} mm`, ''],
    ['Lift share: lift fan / nozzle / roll pair', `${Math.round(100 * trim.F / mp.mass)} / ${Math.round(100 * trim.Mv / mp.mass)} / ${Math.round(200 * trim.L / mp.mass)}%`, ''],
    ['Thrust-to-weight', `${tw.toFixed(2)} (est.)`, cls(tw)],
    state.tilt >= 45 ? ['Hover throttle', `${Math.round(thr * 100)}% (est.)`, thr < 0.65 ? 'ok' : thr < 0.75 ? 'warn' : 'bad'] : ['Mode', 'wing-borne', ''],
  ].map(([k, v, c]) => `<span class="chip ${c}">${k}<b>${v}</b></span>`).join('');
}

// ---------- parts tree
const dot = p => `<span class="dot" style="background:${MATERIALS[p.material].color}"></span>`;
function buildTree(filter = '') {
  const f = filter.trim().toLowerCase();
  $('#tree').innerHTML = GROUPS.map(g => {
    const ps = PARTS.filter(p => p.group === g && (!f || (p.name + p.material + p.id).toLowerCase().includes(f)));
    if (!ps.length) return '';
    return `<div class="g-head"><span>${g}</span><button data-g="${g}">hide / show</button></div>` +
      ps.map(p => `<div class="p-row" data-id="${p.id}">${dot(p)}<span class="nm">${p.name}</span><span class="ms">${p.mass} g</span></div>`).join('');
  }).join('');
  $('#partCount').textContent = `${PARTS.length} parts`;
  syncUI();
}
$('#tree').addEventListener('click', e => {
  const r = e.target.closest('.p-row'), g = e.target.closest('button[data-g]');
  if (g) { const ids = PARTS.filter(p => p.group === g.dataset.g).map(p => p.id), anyOn = ids.some(i => !state.hidden.has(i)); ids.forEach(i => anyOn ? state.hidden.add(i) : state.hidden.delete(i)); apply(); }
  else if (r) select(r.dataset.id, true);
});
$('#search').addEventListener('input', e => buildTree(e.target.value));

// ---------- inspector
function cadBlock(p) {
  const c = MANIFEST[p.id]; if (!c) return '';
  return `<div class="blk"><h4>Printable file</h4><p>${CAD[p.id] || c.note || ''}</p><dl class="kv" style="margin:8px 0 0"><dt>On the bed</dt><dd>${c.bed.map(v => Math.round(v)).join(' x ')} mm</dd></dl>
    <div class="acts"><a class="tog" href="cad/${c.file}.stl" download>Download STL</a></div><p style="margin-top:8px;font-size:12px;color:var(--mute)">${c.material === 'LW-PLA' ? PRINT_LW : c.material === 'PETG' ? PRINT_PETG : 'Clear PETG, vase mode.'} STEP files are in the repository under cad/step.</p></div>`;
}
function wireBlock(p) {
  const rows = WIRING.filter(w => w[0] === p.id || w[1] === p.id); if (!rows.length) return '';
  return `<div class="blk"><h4>Connections</h4><table class="wire">${rows.map(([a, b, what, wire, pin]) => `<tr><td><b>${what}</b><br>${PART[a === p.id ? b : a].name}<br><span class="muted">${wire}</span></td><td>${pin}</td></tr>`).join('')}</table></div>`;
}
function inspector() {
  const p = PART[state.selected], el = $('#inspector');
  if (!p) {
    const printed = PARTS.filter(q => q.process === 'Print'), sum = m => Math.round(PARTS.filter(q => q.material === m).reduce((a, q) => a + q.mass, 0));
    el.innerHTML = `<h2 style="margin-bottom:8px">Overview</h2><h3>Snap-together F-35B</h3>
      <p style="color:#cfd9e3;font-size:13px">Two aluminium tubes form the backbone. Every other part snaps, slides or twists onto them. Tap any part to see what it is, what it is made of and how it locks on.</p>
      <div class="legend">${Object.entries(MATERIALS).map(([k, v]) => `<div><i style="background:${v.color}"></i><span><b>${k}</b> · ${sum(k)} g<br>${v.blurb}</span></div>`).join('')}</div>
      <div class="blk"><h4>Fasteners</h4><p>16 x M3 screws hold the four motors and the servos use their own screws. Everything else slides on the tubes, clips up from below, or is held by a 3 mm skewer pin.</p></div>
      <div class="blk"><h4>Printing</h4><p>${printed.length} printed parts, all within a 220 x 220 x 250 mm bed. LW-PLA ${sum('LW-PLA')} g, PETG ${sum('PETG')} g.</p></div>
      <div class="blk"><h4>Printable now</h4><p>All ${Object.keys(MANIFEST).length} printed parts are real CAD: tap one for its STL and print notes.</p></div>
      <div class="blk"><h4>Estimates</h4><p>Weights and thrust are design estimates. Replace them with scale readings as parts are made.</p></div>`;
    return;
  }
  const hidden = state.hidden.has(p.id), st = STEPS[p.step - 1];
  el.innerHTML = `<h2 style="margin-bottom:8px">${p.group}</h2><h3>${p.name}</h3>
    <div class="tags"><span class="tag"><i style="background:${MATERIALS[p.material].color}"></i>${p.material}</span><span class="tag">${p.process}</span><span class="tag">Step ${p.step} · ${st.title}</span></div>
    <dl class="kv"><dt>Mass</dt><dd>${p.mass} g (${(100 * p.mass / mp.mass).toFixed(1)}%)</dd><dt>Station</dt><dd>x ${p.cg[0]}  y ${p.cg[1]}  z ${p.cg[2]} mm</dd><dt>Part id</dt><dd>${p.id}</dd></dl>
    <div class="blk"><h4>How it locks</h4><p>${p.lock}</p></div>
    <div class="blk"><h4>Notes</h4><p>${p.note}</p></div>
    ${cadBlock(p)}${wireBlock(p)}
    <div class="blk"><h4>${p.material}</h4><p>${MATERIALS[p.material].blurb}</p></div>
    <div class="acts"><button class="tog" id="aFocus">Focus</button><button class="tog" id="aIso">Isolate</button><button class="tog" id="aHide">${hidden ? 'Show' : 'Hide'}</button><button class="tog plain" id="aClear">Close</button></div>`;
  $('#aFocus').onclick = () => focus(p.id);
  $('#aIso').onclick = () => { state.hidden = new Set(PARTS.map(q => q.id).filter(i => i !== p.id)); apply(); focus(p.id); };
  $('#aHide').onclick = () => { hidden ? state.hidden.delete(p.id) : state.hidden.add(p.id); apply(); inspector(); };
  $('#aClear').onclick = () => select(null);
}
function select(id, fromList) {
  state.selected = id; apply(); inspector();
  if (id && innerWidth <= 900) showTab('info');
  if (id && !fromList) document.querySelector(`.p-row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ---------- camera moves
let camAnim = null;
function flyTo(target, pos, ms = 650) { camAnim = { t0: performance.now(), ms, a: controls.target.clone(), b: target, pa: camera.position.clone(), pb: pos }; }
function focus(id) {
  const o = parts.get(id); if (!o) return;
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), r = Math.max(60, b.getSize(new THREE.Vector3()).length() / 2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(c, c.clone().addScaledVector(dir, r / Math.tan(rad(camera.fov / 2)) * 1.25));
}
function homeView(anim = true) {
  const portrait = innerWidth / innerHeight < 0.9, dist = portrait ? 3800 : 2050;
  const pos = HOME_TARGET.clone().add(new THREE.Vector3(0.62, 0.46, 0.64).normalize().multiplyScalar(dist));
  if (anim) flyTo(HOME_TARGET.clone(), pos); else { controls.target.copy(HOME_TARGET); camera.position.copy(pos); }
}

// ---------- picking
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect(); ptr.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  for (const h of ray.intersectObject(model.root, true)) {
    const id = h.object.userData.partId; if (!id || h.object.userData.noPick) continue;
    if (state.cut < 468 && h.point.z > state.cut) continue;
    if (state.xray && shells.includes(id)) continue;
    let o = h.object, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (vis) return id;
  }
  return null;
}
let down = null;
canvas.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
canvas.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) select(pick(e)); down = null; });
canvas.addEventListener('dblclick', e => { const id = pick(e); if (id) focus(id); });
let hoverQueued = false;
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || hoverQueued) return; hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false; const id = e.buttons ? null : pick(e), tip = $('#tip');
    if (id !== state.hover) { state.hover = id; apply(); }
    tip.hidden = !id; if (id) { tip.textContent = PART[id].name; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; }
    canvas.style.cursor = id ? 'pointer' : 'grab';
  });
});

// ---------- controls
const bind = (id, key, fmt, post) => { const el = $('#' + id); el.addEventListener('input', () => { state[key] = +el.value; post?.(); apply(); }); return () => { if (document.activeElement !== el) el.value = state[key]; $('#o' + id[0].toUpperCase() + id.slice(1)).textContent = fmt(state[key]); }; };
let lastEx = 0;
const syncers = [
  bind('explode', 'explode', v => Math.round(v * 100) + '%', () => { const d = camera.position.clone().sub(controls.target), k = (1 + 0.75 * state.explode) / (1 + 0.75 * lastEx); camera.position.copy(controls.target).add(d.multiplyScalar(k)); lastEx = state.explode; }),
  bind('tilt', 'tilt', v => Math.round(v) + '°', () => { state.tiltTarget = state.tilt; }),
  bind('yaw', 'yaw', v => v + '°'),
  bind('elev', 'elev', v => v + '°'),
  bind('batt', 'battX', v => v + ' mm'),
  bind('cut', 'cut', v => v >= 468 ? 'off' : 'z ' + v + ' mm'),
];
function syncUI() {
  syncers.forEach(f => f());
  $('#mHover').classList.toggle('on', state.mode === 'hover'); $('#mFwd').classList.toggle('on', state.mode === 'fwd'); $('#mAsm').classList.toggle('on', state.mode === 'asm');
  $('#tSim').setAttribute('aria-pressed', state.sim); $('#tSpin').setAttribute('aria-pressed', state.spin); $('#tXray').setAttribute('aria-pressed', state.xray); $('#tForces').setAttribute('aria-pressed', state.forces);
  document.querySelectorAll('.p-row').forEach(r => { r.classList.toggle('sel', r.dataset.id === state.selected); r.classList.toggle('off', !partVisible(r.dataset.id)); });
  $('#stepper').hidden = state.mode !== 'asm';
  if (state.mode === 'asm') { const s = STEPS[state.step - 1]; $('#sBody').innerHTML = `<div class="n">STEP ${s.n} / ${STEPS.length}</div><h3>${s.title}</h3><p>${s.text}</p><div class="bar"><i style="width:${100 * s.n / STEPS.length}%"></i></div>`; }
}
function setMode(m) { state.mode = m; if (m === 'hover') state.tiltTarget = 90; if (m === 'fwd') state.tiltTarget = 0; if (m === 'asm') { state.explode = 0; state.selected = null; inspector(); } apply(); }
$('#mHover').onclick = () => setMode('hover'); $('#mFwd').onclick = () => setMode('fwd'); $('#mAsm').onclick = () => setMode(state.mode === 'asm' ? 'hover' : 'asm');
$('#sPrev').onclick = () => { state.step = Math.max(1, state.step - 1); apply(); };
$('#sNext').onclick = () => { state.step = Math.min(STEPS.length, state.step + 1); apply(); };
$('#tSpin').onclick = () => { state.spin = !state.spin; apply(); };
$('#tXray').onclick = () => { state.xray = !state.xray; apply(); };
$('#tForces').onclick = () => { state.forces = !state.forces; apply(); };
$('#bReset').onclick = () => homeView();

// ---------- flight simulator
let sim = null, simHudAt = 0, acc = 0;
const keys = new Set(), SIM_DT = 1 / 400;
// Ground for flying: a shader grid (1 m and 10 m lines) that fades with distance. A plane, not long GL lines, so it renders the same on every GPU.
const simGrid = new THREE.Mesh(new THREE.PlaneGeometry(600000, 600000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW;
    float grid(vec2 c){ vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c); return 1.0 - min(min(g.x, g.y), 1.0); }
    void main(){ vec2 c = vW.xz / 1000.0; float d = length(vW.xz - cameraPosition.xz) / 1000.0;
      float a = (grid(c) * 0.30 * exp(-d / 25.0) + grid(c / 10.0) * 0.55 * exp(-d / 120.0));
      gl_FragColor = vec4(0.42, 0.62, 0.84, a); }`,
}));
simGrid.position.y = D.groundY + 1; simGrid.visible = false; simGrid.renderOrder = -1; scene.add(simGrid);
scene.add(sun.target);
const SUN0 = sun.position.clone();
function makePad(el) {
  const v = { x: 0, y: 0 }, knob = el.querySelector('i'); let id = null;
  const set = e => { const r = el.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = -((e.clientY - r.top) / r.height * 2 - 1); const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; } v.x = x; v.y = y; knob.style.transform = `translate(${x * 43}px,${-y * 43}px)`; };
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); set(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const up = e => { if (e.pointerId === id) { id = null; v.x = v.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return v;
}
const padL = makePad($('#padL')), padR = makePad($('#padR'));
function setSim(on) {
  state.sim = on; document.body.classList.toggle('sim', on);
  $('#simhud').hidden = !on; $('#padL').hidden = $('#padR').hidden = !on; simGrid.visible = on; ground.children[1].visible = ground.children[2].visible = !on;
  camera.near = on ? 30 : 10; camera.far = on ? 260000 : 30000; camera.updateProjectionMatrix(); scene.fog = on ? new THREE.Fog(0x0e1620, 40000, 240000) : null;
  if (on) { state.mode = 'hover'; state.explode = 0; lastEx = 0; state.selected = null; state.hidden.clear(); state.cut = 470; state.xray = false; state.tiltTarget = 90; sim = createSim(state.battX); acc = 0; }
  else { model.root.position.set(0, 0, 0); model.root.quaternion.identity(); ground.position.set(0, D.groundY, 0); sun.position.copy(SUN0); sun.target.position.set(0, 0, 0); state.tilt = state.tiltTarget = 90; state.yaw = 0; props.forEach(p => p.userData.disc.material.opacity = 0); homeView(false); }
  inspector(); apply(); resize();
  if (on) { const p = new THREE.Vector3(0, -20, 0); controls.target.copy(p); camera.position.copy(p).add(new THREE.Vector3(-0.72, 0.36, 0.6).normalize().multiplyScalar(innerWidth < 900 ? 4200 : 2600)); }
}
function simFrame(dt, now) {
  const k = c => keys.has(c) ? 1 : 0;
  if (k('q')) state.tiltTarget = Math.max(0, state.tiltTarget - 45 * dt); if (k('e')) state.tiltTarget = Math.min(100, state.tiltTarget + 45 * dt);
  const inp = { thr: 0.5 + 0.4 * (k('w') - k('s')) + 0.45 * padL.y, yaw: (k('d') - k('a')) * 0.7 + padL.x, pitch: (k('arrowdown') - k('arrowup')) * 0.7 - padR.y, roll: (k('arrowright') - k('arrowleft')) * 0.7 + padR.x, tilt: state.tiltTarget, altHold: true, armed: true };
  for (const key of ['thr']) inp[key] = Math.min(1, Math.max(0, inp[key]));
  for (const key of ['yaw', 'pitch', 'roll']) inp[key] = Math.min(1, Math.max(-1, inp[key]));
  acc = Math.min(acc + dt, 0.05); while (acc >= SIM_DT) { sim.step(SIM_DT, inp); acc -= SIM_DT; }
  const s = sim.s, q = new THREE.Quaternion(s.q[0], s.q[1], s.q[2], s.q[3]);
  const cgW = new THREE.Vector3(s.p[0] * 1000, D.groundY + s.p[1] * 1000, s.p[2] * 1000);
  model.root.quaternion.copy(q); model.root.position.copy(cgW).sub(new THREE.Vector3(...mp.cg).applyQuaternion(q));
  const mDir = setNozzle(s.tilt, s.nozzle); joints.stabs[0].rotation.z = rad(s.tailR); joints.stabs[1].rotation.z = rad(s.tailL);
  state.tilt = s.tilt;
  const sp = i => Math.sqrt(Math.max(0, s.T[i]) / sim.thrusters[i].max);
  fans.lift.rotation.x += dt * 60 * sp(0); fans.main.rotation.x -= dt * 80 * sp(1);
  [['propL', 2], ['propR', 3]].forEach(([id, i]) => { const p = parts.get(id), f = sp(i); p.rotateY(p.userData.dir * dt * 70 * f); p.userData.disc.material.opacity = 0.18 * Math.min(1, f * 1.6); });
  // camera, light and ground follow the aircraft
  const d = cgW.clone().sub(controls.target); controls.target.add(d); camera.position.add(d);
  sun.position.copy(SUN0).add(cgW); sun.target.position.copy(cgW); ground.position.set(cgW.x, D.groundY, cgW.z); simGrid.position.x = cgW.x; simGrid.position.z = cgW.z;
  if (overlay.visible) {
    const up = new THREE.Vector3(0, 1, 0), kL = 22;
    arrows.F.set(new THREE.Vector3(D.fanX, 40, 0), up, s.T[0] * kL); arrows.L.set(new THREE.Vector3(D.rollX, 14, -D.rollZ), up, s.T[2] * kL); arrows.R.set(new THREE.Vector3(D.rollX, 14, D.rollZ), up, s.T[3] * kL);
    arrows.M.set(new THREE.Vector3(...nozzleExit(s.tilt).pos), mDir, s.T[1] * nozzleExit(s.tilt).eff * kL);
    const cgB = new THREE.Vector3(...mp.cg); cgBall.position.copy(cgB); arrows.W.set(cgB, new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert()), 60);
  }
  if (now - simHudAt > 110) {
    simHudAt = now; const h = s.p[1] - sim.rest, hard = (s.impact || 0) > 2.5;
    const mode = s.onGround ? (hard ? 'Hard landing' : 'On the ground') : s.wingW > 0.6 ? 'Wing-borne' : s.wingW > 0.05 ? 'Transition' : 'Hovering';
    $('#simstats').innerHTML = [['Height', h.toFixed(1) + ' m', ''], ['Speed', s.speed.toFixed(1) + ' m/s', ''], ['Climb', s.v[1].toFixed(1) + ' m/s', ''], ['Nozzle', Math.round(s.tilt) + '°', ''], ['State', mode, hard ? 'bad' : '']].map(([a, b, c]) => `<div>${a}<b class="${c}">${b}</b></div>`).join('');
    $('#simbars').innerHTML = ['Front', 'Main', 'Left', 'Right'].map((n, i) => `<div>${n} ${Math.round(100 * s.T[i] / sim.thrusters[i].max)}%<u><i style="width:${100 * s.T[i] / sim.thrusters[i].max}%"></i></u></div>`).join('');
    syncers[1]();
  }
  dirty = 2;
}
$('#tSim').onclick = () => setSim(!state.sim); $('#sExit').onclick = () => setSim(false);
$('#sReset').onclick = () => { sim.reset(); state.tiltTarget = 90; };
$('#sHover').onclick = () => { state.tiltTarget = 90; }; $('#sFwd').onclick = () => { state.tiltTarget = 0; };
addEventListener('keydown', e => { if (!state.sim || e.target.tagName === 'INPUT') return; const c = e.key.toLowerCase(); keys.add(c); if (c === 'r') $('#sReset').click(); if (c.startsWith('arrow') || c === ' ') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
$('#bShowAll').onclick = () => { state.hidden.clear(); state.explode = 0; lastEx = 0; state.cut = 470; state.xray = false; apply(); };
$('#bExport').onclick = () => {
  const data = { name: 'F-35B VTOL digital twin', rev: 'A', units: { length: 'mm', mass: 'g', angle: 'deg' }, axes: '+X nose, +Y up, +Z right wing', note: 'Masses and thrust are estimates until measured.',
    dims: D, mass: mp, hoverTrim: hoverTrim(mp, 90), thrusters: THRUSTERS, joints: JOINTS, parts: PARTS.map(p => ({ ...p, cg: p.id === 'battery' || p.id === 'batteryTray' ? [state.battX, p.cg[1], p.cg[2]] : p.cg })) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'f35b-twin.json'; a.click();
};
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'Escape') select(null); if (state.mode === 'asm' && e.key === 'ArrowRight') $('#sNext').click(); if (state.mode === 'asm' && e.key === 'ArrowLeft') $('#sPrev').click(); });

// ---------- mobile tabs
function showTab(t) { document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.dataset.tab === t)); document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; showTab(b.classList.contains('on') ? null : b.dataset.t); });

// ---------- loop
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  const desk = w > 900; camera.setViewOffset(w, h, desk && !state.sim ? 8 : 0, state.sim ? -Math.min(110, h * 0.13) : desk ? 80 : 60, w, h); camera.updateProjectionMatrix(); dirty = 3; }
addEventListener('resize', resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.sim) simFrame(dt, now);
  else if (Math.abs(state.tilt - state.tiltTarget) > 0.2) { state.tilt += (state.tiltTarget - state.tilt) * Math.min(1, dt * 4); if (Math.abs(state.tilt - state.tiltTarget) <= 0.2) state.tilt = state.tiltTarget; apply(); }
  if (camAnim) { const k = Math.min(1, (now - camAnim.t0) / camAnim.ms), e = k * k * (3 - 2 * k); controls.target.lerpVectors(camAnim.a, camAnim.b, e); camera.position.lerpVectors(camAnim.pa, camAnim.pb, e); if (k >= 1) camAnim = null; }
  const hov = state.tilt >= 45;
  if (!state.sim) {
    props.forEach(p => { const on = state.spin && hov, d = p.userData.disc.material, tgt = on ? 0.16 : 0; if (on) { p.rotateY(p.userData.dir * dt * 38); dirty = Math.max(dirty, 1); } if (Math.abs(d.opacity - tgt) > 0.004) { d.opacity += (tgt - d.opacity) * 0.15; dirty = Math.max(dirty, 1); } else d.opacity = tgt; });
    if (state.spin) { if (hov) fans.lift.rotation.x += dt * 30; fans.main.rotation.x -= dt * 40; dirty = Math.max(dirty, 1); }
  }
  if (camAnim) dirty = Math.max(dirty, 1);
  controls.update();
  if (dirty > 0) { renderer.render(scene, camera); dirty--; }
  requestAnimationFrame(frame);
}

resize(); homeView(false); buildTree(); inspector(); apply(); showTab(innerWidth <= 900 ? null : 'controls');
requestAnimationFrame(frame);
window.__twin = { state, apply, select, focus, setMode, setSim, getSim: () => sim, keys, homeView, camera, controls, parts, massProps: () => mp, trim: () => trim };
