import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { D, PARTS, PART, GROUPS, MATERIALS, STEPS, THRUSTERS, JOINTS, massProps, hoverTrim } from './spec.js';
import { buildModel } from './build.js';

const $ = s => document.querySelector(s);
const rad = d => d * Math.PI / 180;
const state = { explode: 0, tilt: 90, tiltTarget: 90, yaw: 0, elev: 0, battX: D.battery.xDefault, cut: 470, spin: false, xray: false, forces: true, mode: 'hover', step: 1, selected: null, hidden: new Set(), hover: null };

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
const HOME_TARGET = new THREE.Vector3(-40, -10, 0);
let dirty = 3; controls.addEventListener('change', () => { dirty = Math.max(dirty, 2); });

const sun = new THREE.DirectionalLight(0xfff4e6, 2.4); sun.position.set(420, 1100, 520); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 100, far: 2600 }); sun.shadow.bias = -0.0005; sun.shadow.radius = 6;
scene.add(sun, new THREE.HemisphereLight(0xbcd7ff, 0x1a2230, 0.55));
const rim = new THREE.DirectionalLight(0x6fb6ff, 1.1); rim.position.set(-700, 300, -600); scene.add(rim);

const ground = new THREE.Group(); ground.position.y = D.groundY; scene.add(ground);
{ const sh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42 })); sh.receiveShadow = true; ground.add(sh);
  const g1 = new THREE.GridHelper(3000, 30, 0x3d566e, 0x22313f); g1.material.transparent = true; g1.material.opacity = 0.55; ground.add(g1);
  const g2 = new THREE.GridHelper(3000, 150, 0x1a2633, 0x1a2633); g2.material.transparent = true; g2.material.opacity = 0.35; g2.position.y = -0.2; ground.add(g2); }

const model = buildModel(); scene.add(model.root);
const { parts, movers, props, joints, shells } = model;
const partMats = new Map();
parts.forEach((o, id) => { const ms = new Set(); o.traverse(c => { if (c.isMesh && c.material.emissive) ms.add(c.material); }); partMats.set(id, [...ms]); });
const shellMats = shells.flatMap(id => { const a = []; parts.get(id).traverse(c => { if (c.isMesh) a.push(c.material); }); return a; });
shellMats.forEach(m => { m.userData.o = m.opacity; m.userData.t = m.transparent; });

// ---------- balance & thrust overlay
const overlay = new THREE.Group(); scene.add(overlay);
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
  joints.tiltG.rotation.z = rad(state.tilt); joints.yawG.rotation.y = rad(state.yaw);
  joints.stabs.forEach(s => s.rotation.z = rad(state.elev));
  parts.forEach((o, id) => {
    o.visible = partVisible(id);
    const sel = id === state.selected, hov = id === state.hover, cur = asm && PART[id].step === state.step;
    for (const m of partMats.get(id)) { m.emissive.setHex(sel ? 0x1e6fd6 : cur ? 0xb84a00 : hov ? 0x2a3a4d : 0x000000); m.emissiveIntensity = sel ? 0.75 : cur ? 0.45 : hov ? 0.6 : 0; }
  });
  shellMats.forEach(m => { m.transparent = state.xray || m.userData.t; m.opacity = state.xray ? 0.13 : m.userData.o; m.depthWrite = !state.xray; });
  const cutOn = state.cut < 468; clipPlane.constant = state.cut; renderer.clippingPlanes = cutOn ? [clipPlane] : [];
  ground.visible = state.explode < 0.03;
  // balance
  mp = massProps(state.battX); trim = hoverTrim(mp, Math.max(state.tilt, 45));
  const hov = state.tilt >= 45, show = state.forces && state.explode < 0.03 && !asm;
  overlay.visible = show;
  if (show) {
    const cg = new THREE.Vector3(...mp.cg); cgBall.position.copy(cg); cgRing.position.set(cg.x, D.groundY + 0.6, cg.z);
    const up = new THREE.Vector3(0, 1, 0), k = 0.26;
    const mDir = new THREE.Vector3(1, 0, 0).applyQuaternion(joints.yawG.getWorldQuaternion(new THREE.Quaternion()));
    joints.tiltG.updateWorldMatrix(true, true);
    arrows.F.set(new THREE.Vector3(D.fanX, 30, 0), up, hov ? trim.F * k : 0);
    arrows.L.set(new THREE.Vector3(D.sparX, 44, -D.rollZ), up, hov ? trim.L * k + 20 : 0);
    arrows.R.set(new THREE.Vector3(D.sparX, 44, D.rollZ), up, hov ? trim.R * k + 20 : 0);
    arrows.M.set(new THREE.Vector3(D.pivotX, 0, 0).addScaledVector(mDir, 30), mDir, (hov ? trim.M : mp.mass * 0.35) * k);
    arrows.W.set(cg.clone(), new THREE.Vector3(0, -1, 0), 60);
  }
  hud(); syncUI(); dirty = Math.max(dirty, 2);
}

// ---------- HUD
function hud() {
  const lift = THRUSTERS[0].maxG + THRUSTERS[1].maxG, all = lift + THRUSTERS[2].maxG + THRUSTERS[3].maxG;
  const tw = lift / mp.mass, thr = Math.max(trim.F / THRUSTERS[0].maxG, trim.M / THRUSTERS[1].maxG);
  const cls = v => v >= 1.5 ? 'ok' : v >= 1.3 ? 'warn' : 'bad';
  $('#hud').innerHTML = [
    ['Weight', `${Math.round(mp.mass)} g`, ''],
    ['Balance point', `${Math.round(mp.cg[0])} mm`, ''],
    ['Front / main lift', `${Math.round(trim.split * 100)} / ${Math.round((1 - trim.split) * 100)}%`, ''],
    ['Thrust-to-weight', `${tw.toFixed(2)} (est.)`, cls(tw)],
    state.tilt >= 45 ? ['Hover throttle', `${Math.round(thr * 100)}% (est.)`, thr < 0.7 ? 'ok' : thr < 0.8 ? 'warn' : 'bad'] : ['Mode', 'wing-borne', ''],
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
function inspector() {
  const p = PART[state.selected], el = $('#inspector');
  if (!p) {
    const printed = PARTS.filter(q => q.process === 'Print'), sum = m => Math.round(PARTS.filter(q => q.material === m).reduce((a, q) => a + q.mass, 0));
    el.innerHTML = `<h2 style="margin-bottom:8px">Overview</h2><h3>Snap-together F-35B</h3>
      <p style="color:#cfd9e3;font-size:13px">Two aluminium tubes form the backbone. Every other part snaps, slides or twists onto them. Tap any part to see what it is, what it is made of and how it locks on.</p>
      <div class="legend">${Object.entries(MATERIALS).map(([k, v]) => `<div><i style="background:${v.color}"></i><span><b>${k}</b> · ${sum(k)} g<br>${v.blurb}</span></div>`).join('')}</div>
      <div class="blk"><h4>Fasteners</h4><p>12 x M3 screws hold the four motors. Everything else is a C-clip, slide rail, bayonet or snap latch, so a crashed part swaps in under a minute.</p></div>
      <div class="blk"><h4>Printing</h4><p>${printed.length} printed parts, all within a 220 x 220 x 250 mm bed. LW-PLA ${sum('LW-PLA')} g, PETG ${sum('PETG')} g.</p></div>
      <div class="blk"><h4>Estimates</h4><p>Weights and thrust are design estimates. Replace them with scale readings as parts are made.</p></div>`;
    return;
  }
  const hidden = state.hidden.has(p.id), st = STEPS[p.step - 1];
  el.innerHTML = `<h2 style="margin-bottom:8px">${p.group}</h2><h3>${p.name}</h3>
    <div class="tags"><span class="tag"><i style="background:${MATERIALS[p.material].color}"></i>${p.material}</span><span class="tag">${p.process}</span><span class="tag">Step ${p.step} · ${st.title}</span></div>
    <dl class="kv"><dt>Mass</dt><dd>${p.mass} g (${(100 * p.mass / mp.mass).toFixed(1)}%)</dd><dt>Station</dt><dd>x ${p.cg[0]}  y ${p.cg[1]}  z ${p.cg[2]} mm</dd><dt>Part id</dt><dd>${p.id}</dd></dl>
    <div class="blk"><h4>How it locks</h4><p>${p.lock}</p></div>
    <div class="blk"><h4>Notes</h4><p>${p.note}</p></div>
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
  const portrait = innerWidth / innerHeight < 0.9, dist = portrait ? 3400 : 2050;
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
  $('#tSpin').setAttribute('aria-pressed', state.spin); $('#tXray').setAttribute('aria-pressed', state.xray); $('#tForces').setAttribute('aria-pressed', state.forces);
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
  const desk = w > 900; camera.setViewOffset(w, h, desk ? 8 : 0, desk ? 80 : 60, w, h); camera.updateProjectionMatrix(); dirty = 3; }
addEventListener('resize', resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (Math.abs(state.tilt - state.tiltTarget) > 0.2) { state.tilt += (state.tiltTarget - state.tilt) * Math.min(1, dt * 4); if (Math.abs(state.tilt - state.tiltTarget) <= 0.2) state.tilt = state.tiltTarget; apply(); }
  if (camAnim) { const k = Math.min(1, (now - camAnim.t0) / camAnim.ms), e = k * k * (3 - 2 * k); controls.target.lerpVectors(camAnim.a, camAnim.b, e); camera.position.lerpVectors(camAnim.pa, camAnim.pb, e); if (k >= 1) camAnim = null; }
  const hov = state.tilt >= 45;
  props.forEach(p => { const on = state.spin && (hov || p === parts.get('propM')), d = p.userData.disc.material, tgt = on ? 0.16 : 0; if (on) { p.rotateY(p.userData.dir * dt * 38); dirty = Math.max(dirty, 1); } if (Math.abs(d.opacity - tgt) > 0.004) { d.opacity += (tgt - d.opacity) * 0.15; dirty = Math.max(dirty, 1); } else d.opacity = tgt; });
  if (camAnim) dirty = Math.max(dirty, 1);
  controls.update();
  if (dirty > 0) { renderer.render(scene, camera); dirty--; }
  requestAnimationFrame(frame);
}

resize(); homeView(false); buildTree(); inspector(); apply(); showTab(innerWidth <= 900 ? null : 'controls');
requestAnimationFrame(frame);
window.__twin = { state, apply, select, focus, setMode, homeView, camera, controls, parts, massProps: () => mp, trim: () => trim };
