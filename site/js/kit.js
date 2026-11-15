// Interactive bench model of the printed ducted fan and three-bearing swivel nozzle.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { STLLoader } from '../vendor/STLLoader.js';
import { NOZZLE, solve, exitDirection, servoAngles, jointCentres } from './nozzle.js';

const $ = s => document.querySelector(s), rad = d => d * Math.PI / 180;
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
const camera = new THREE.PerspectiveCamera(32, 1, 5, 20000);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
controls.target.set(60, -40, 0); camera.position.set(-330, 190, 560);
const sun = new THREE.DirectionalLight(0xfff4e6, 2.3); sun.position.set(200, 600, 350); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 50, far: 1600 }); scene.add(sun, new THREE.HemisphereLight(0xbcd7ff, 0x1a2230, 0.6));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.4 })); floor.position.y = -330; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(2000, 40, 0x3d566e, 0x22313f); grid.position.y = -330; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);

const kit = await (await fetch('cad/kit/kit.json')).json(), G = kit.geometry, loader = new STLLoader(), geo = {};
await Promise.all(Object.entries(kit.parts).map(async ([id, p]) => { geo[id] = loader.parse(await (await fetch(`cad/kit/${p.file}.stl`)).arrayBuffer()).applyMatrix4(new THREE.Matrix4().fromArray(p.matrix)); }));
const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.02, side: THREE.DoubleSide });
const COL = { duct: 0x8a949e, tailCone: 0x8a949e, impeller: 0x18c7b3, seg1: 0xf47216, seg2: 0xf9a03f, seg3: 0xf47216, collar: 0x2b2e33, collarJ1: 0x2b2e33, pinion: 0xe8eef4 };
const mesh = (id, g = geo[id]) => { const m = new THREE.Mesh(g, M(COL[id])); m.castShadow = m.receiveShadow = true; return m; };
const group = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

// kinematic chain: base -> bearing 1 -> bearing 2 -> bearing 3
const base = group(scene), a2 = rad(G.alpha), [x1, x2, x3] = G.joints;
const g1 = group(base, [x1, 0, 0]), g2 = group(g1, [x2 - x1, 0, 0]), g3 = group(g2, [x3 - x2, 0, 0]);
const n2 = new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0), n3 = new THREE.Vector3(Math.cos(a2), -Math.sin(a2), 0), X = new THREE.Vector3(1, 0, 0);
const explodable = [];
const put = (id, parent, off, ex) => { const m = mesh(id); m.position.set(...off); m.userData.home = m.position.clone(); m.userData.ex = new THREE.Vector3(...ex); parent.add(m); explodable.push(m); return m; };
put('duct', base, [0, 0, 0], [-60, 0, 0]); put('tailCone', base, [0, 0, 0], [-20, -90, 0]);
const rotor = put('impeller', base, [0, 0, 0], [-190, 0, 0]);
put('seg1', g1, [-x1, 0, 0], [0, 0, 0]); put('seg2', g2, [-x2, 0, 0], [60, 0, 0]); put('seg3', g3, [-x3, 0, 0], [120, 0, 0]);
// stand-ins for the bought parts
const motor = new THREE.Mesh(new THREE.CylinderGeometry(14.3, 14.3, 19, 32).rotateZ(Math.PI / 2).translate(-53.5, 0, 0), new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.8, roughness: 0.35 })); base.add(motor);
// bearing frames carry the collars, pinions and servos of each joint; they ride on the upstream part
const frames = [group(base, [x1, 0, 0]), group(g1, [x2 - x1, 0, 0]), group(g2, [x3 - x2, 0, 0])];
frames[1].rotation.z = a2; frames[2].rotation.z = -a2;
const pinions = [];
frames.forEach((f, j) => {
  for (const half of [0, 1]) { const c = mesh(j ? 'collar' : 'collarJ1'); c.rotation.x = half * Math.PI; c.userData.home = c.position.clone(); c.userData.ex = new THREE.Vector3(0, half ? -70 : 70, 0); f.add(c); explodable.push(c); }
  const clock = group(f); clock.rotation.x = rad(G.clock[j]);
  const pv = group(clock, [0, G.servoR, 0]); const p = mesh('pinion'); p.position.set(0, -G.servoR, 0); pv.add(p); pinions.push(pv);
  const sv = new THREE.Mesh(new THREE.BoxGeometry(22.7, 12.2, 22.8).translate(-22, G.servoR, -5.9), new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.3 })); sv.castShadow = true; clock.add(sv);
});
const jet = new THREE.Group(); g3.add(jet); jet.position.set(G.exitX - x3, 0, 0);
const jetMesh = new THREE.Mesh(new THREE.ConeGeometry(34, 1, 32, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); jet.add(jetMesh);

const C = jointCentres(), state = { d: 0, y: 0, f: 40, e: 0 };
let dirty = 3; controls.addEventListener('change', () => dirty = 2);
function apply() {
  const j = solve(state.d, state.y), s = servoAngles(j, C), e = exitDirection(j.a, j.b, j.c);
  g1.quaternion.setFromAxisAngle(X, rad(j.a)); g2.quaternion.setFromAxisAngle(n2, rad(j.b)); g3.quaternion.setFromAxisAngle(n3, rad(j.c));
  [j.a, j.b, j.c].forEach((t, i) => { pinions[i].rotation.x = -rad(t) * G.gearRatio; });
  explodable.forEach(m => m.position.copy(m.userData.home).addScaledVector(m.userData.ex, state.e));
  const us = v => Math.round(1500 + v / 90 * 1000);
  $('#jrows').innerHTML = [['1 · square', j.a, s.s1], ['2 · canted', j.b, s.s2], ['3 · canted', j.c, s.s3]].map(([n, t, v]) => `<tr><td>${n}</td><td>${t.toFixed(1)}°</td><td>${v.toFixed(0)}°</td><td>${us(v)} µs</td></tr>`).join('');
  const down = Math.atan2(-e[1], e[0]) * 180 / Math.PI, side = Math.asin(e[2]) * 180 / Math.PI;
  $('#kexit').textContent = `${down.toFixed(0)}° below straight aft, ${Math.abs(side).toFixed(0)}° to the ${side >= 0 ? 'right' : 'left'}.`;
  const t = 850 * (state.f / 100) ** 2 * (1 - 0.15 * state.d / 90);
  $('#kthrust').textContent = `About ${Math.round(t)} g: 850 g at full speed straight, less roughly 15% when bent 90°. Both figures are guesses until measured.`;
  jetMesh.scale.set(40 + 2.2 * state.f, 1, 1); jetMesh.visible = state.f > 0 && state.e < 0.05;
  $('#oD').textContent = state.d + '°'; $('#oY').textContent = state.y + '°'; $('#oF').textContent = state.f + '%'; $('#oE').textContent = Math.round(state.e * 100) + '%';
  dirty = 2;
}
for (const [id, k] of [['sD', 'd'], ['sY', 'y'], ['sF', 'f'], ['sE', 'e']]) $('#' + id).addEventListener('input', ev => { state[k] = +ev.target.value; apply(); });
const QTY = { collar: 4, collarJ1: 2, pinion: 3 };
$('#klist').innerHTML = Object.entries(kit.parts).map(([id, p]) => `<div class="kp"><b>${p.file.replace(/_/g, ' ')}${QTY[id] ? ' × ' + QTY[id] : ''}</b><span>${p.bed.map(v => Math.round(v)).join(' × ')} mm · about ${Math.round(p.mass)} g · ${p.note}</span><a class="tog" href="cad/kit/${p.file}.stl" download>Download STL</a></div>`).join('');
$('#kcount').textContent = Object.keys(kit.parts).length + ' files';
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.setViewOffset(innerWidth, innerHeight, 0, innerWidth > 900 ? 60 : 40, innerWidth, innerHeight); camera.updateProjectionMatrix(); dirty = 3; }
addEventListener('resize', resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.f > 0) { rotor.rotation.x -= dt * state.f * 0.6; dirty = Math.max(dirty, 1); }
  controls.update(); if (dirty > 0) { renderer.render(scene, camera); dirty--; }
  requestAnimationFrame(frame);
}
resize(); apply(); requestAnimationFrame(frame);
window.__kit = { state, apply, camera, controls, solve };
