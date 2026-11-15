// Procedural geometry for every part. Returns handles the viewer animates.
import * as THREE from 'three';
import { D, PART } from './spec.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = d => d * Math.PI / 180;

// ---------- materials (one fresh instance per call so parts highlight independently)
const MAT = {
  lw: () => new THREE.MeshStandardMaterial({ color: 0x7f8a95, roughness: 0.78, metalness: 0.02 }),
  petg: () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.38, metalness: 0.0 }),
  alu: () => new THREE.MeshStandardMaterial({ color: 0xd4d9de, roughness: 0.28, metalness: 1.0 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.45, metalness: 0.55 }),
  motorRing: () => new THREE.MeshStandardMaterial({ color: 0x7d5cff, roughness: 0.3, metalness: 0.8 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xc8793a, roughness: 0.4, metalness: 0.9 }),
  prop: () => new THREE.MeshStandardMaterial({ color: 0x1fd1bd, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.92 }),
  disc: () => new THREE.MeshBasicMaterial({ color: 0x1fd1bd, transparent: true, opacity: 0.0, depthWrite: false }),
  canopy: () => new THREE.MeshPhysicalMaterial({ color: 0xd0a646, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.5, clearcoat: 1 }),
  batt: () => new THREE.MeshStandardMaterial({ color: 0x1c2f55, roughness: 0.6 }),
  label: () => new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 }),
  pcbBlue: () => new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.55 }),
  chip: () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 }),
  shrink: () => new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 }),
  servo: () => new THREE.MeshStandardMaterial({ color: 0x2f5fd0, roughness: 0.35, transparent: true, opacity: 0.95 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.5 }),
};
for (const k in MAT) { const f = MAT[k]; MAT[k] = () => { const m = f(); m.side = THREE.DoubleSide; return m; }; }

// ---------- geometry helpers
function loft(rings, cap = true) {
  const n = rings[0].length, pos = [], idx = [];
  rings.forEach(r => r.forEach(p => pos.push(p.x, p.y, p.z)));
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  if (cap) for (const k of [0, rings.length - 1]) {
    const r = rings[k], base = pos.length / 3, cen = V(0, 0, 0);
    r.forEach(p => cen.add(p)); cen.multiplyScalar(1 / n);
    pos.push(cen.x, cen.y, cen.z); r.forEach(p => pos.push(p.x, p.y, p.z));
    for (let j = 0; j < n; j++) idx.push(base, base + 1 + j, base + 1 + (j + 1) % n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// fuselage cross-section (superellipse, separate top/bottom heights)
function fRing(x, w, top, bot, yc, n = 2.5, N = 44) {
  const r = [];
  for (let i = 0; i < N; i++) {
    const t = 2 * Math.PI * i / N, c = Math.cos(t), s = Math.sin(t), e = 2 / n;
    r.push(V(x, yc + (s >= 0 ? top : bot) * Math.sign(s) * Math.abs(s) ** e, w * Math.sign(c) * Math.abs(c) ** e));
  }
  return r;
}
// symmetric aerofoil section at span station z
function aRing(xLE, chord, z, y, t, M = 16) {
  const up = [], lo = [];
  for (let i = 0; i <= M; i++) {
    const xc = (1 - Math.cos(Math.PI * i / M)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4) * chord;
    up.push(V(xLE - chord * xc, y + yt, z));
    if (i > 0 && i < M) lo.unshift(V(xLE - chord * xc, y - yt, z));
  }
  return [...up, ...lo];
}
// extruded top-view outline: pts [[x,z],...], from y0 to y1
function plan(pts, y0, y1, holes = [], bevel = 0) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z));
  sh.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    if (h.r) p.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true);
    else { h.pts.forEach(([x, z], i) => i ? p.lineTo(x, -z) : p.moveTo(x, -z)); p.closePath(); }
    sh.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: y1 - y0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelOffset: -bevel, bevelSegments: 3, curveSegments: 56,
  });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0);
  return g;
}
const rect = (x0, x1, z0, z1) => [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
const box = (sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const cylY = (r, h, x = 0, y = 0, z = 0, seg = 32) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const cylX = (r, h, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(r, r, h, 24).rotateZ(Math.PI / 2).translate(x, y, z);
const cylZ = (r, h, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(r, r, h, 24).rotateX(Math.PI / 2).translate(x, y, z);
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };
function grp(...children) { const g = new THREE.Group(); children.forEach(c => g.add(c)); return g; }
// C-clip: the snap that grips an 8 mm tube
function clip(x, z, len = 16, m) {
  const g = new THREE.TorusGeometry(6, 2.2, 10, 28, Math.PI * 1.55);
  g.rotateY(Math.PI / 2); g.rotateX(-Math.PI * 0.275 - Math.PI / 2);
  const o = grp();
  for (const dx of [-len / 2 + 2, len / 2 - 2]) { const t = mesh(g.clone().translate(x + dx, 0, z), m); o.add(t); }
  o.add(mesh(box(len, 4, 10, x, -7, z), m));
  return o;
}

// ---------- bought components
function motor() { // axis +Y, base on y=0
  return grp(
    mesh(cylY(14.2, 3, 0, 1.5), MAT.dark()),
    mesh(cylY(11, 9, 0, 7.5), MAT.copper()),
    mesh(cylY(14.4, 10, 0, 13), MAT.dark()),
    mesh(cylY(14.6, 2.2, 0, 19), MAT.motorRing()),
    mesh(cylY(2.5, 9, 0, 24), MAT.chip()),
  );
}
function prop(diam, blades, dir = 1) { // axis +Y, hub at y=0
  const R = diam / 2, g = grp(), sh = new THREE.Shape();
  const P = [[5, -4], [R * 0.35, -R * 0.13], [R * 0.75, -R * 0.11], [R, -R * 0.03], [R, R * 0.04], [R * 0.7, R * 0.1], [R * 0.3, R * 0.1], [5, 4]];
  sh.moveTo(P[0][0], P[0][1]);
  sh.splineThru(P.slice(1).map(p => new THREE.Vector2(p[0], p[1])));
  sh.closePath();
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false, curveSegments: 10 });
  bg.rotateX(-Math.PI / 2); bg.rotateX(rad(14 * dir));
  const pm = MAT.prop();
  for (let i = 0; i < blades; i++) { const b = mesh(bg, pm); b.rotation.y = i * 2 * Math.PI / blades; g.add(b); }
  g.add(mesh(cylY(6, 6, 0, 0), MAT.dark()));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2), MAT.disc());
  disc.userData.noPick = true; g.add(disc);
  g.userData.disc = disc; g.userData.dir = dir;
  return g;
}
function servo(metal) { // body centred, output shaft along +Y at local x=+5.9
  const g = grp(mesh(box(22.8, 22, 12.2, 0, 0, 0), metal ? MAT.dark() : MAT.servo()),
    mesh(box(32, 2.4, 12.2, 0, 6, 0), metal ? MAT.dark() : MAT.servo()),
    mesh(cylY(5.6, 5, 5.9, 13), metal ? MAT.dark() : MAT.servo()),
    mesh(cylY(2.4, 4, 5.9, 17), metal ? MAT.copper() : MAT.white()));
  return g;
}
function esc() { return grp(mesh(box(45, 7, 24), MAT.shrink()), mesh(box(18, 7.6, 20, 4, 0, 0), MAT.label()), mesh(box(8, 5, 14, 26, 0, 0), MAT.dark()), mesh(box(8, 5, 14, -26, 0, 0), MAT.dark())); }

// ---------- assembly
export function buildModel() {
  const root = new THREE.Group();
  const parts = new Map(), movers = [];
  const add = (id, obj, ex = [0, 0, 0], parent = root) => {
    obj.userData.partId = id; obj.userData.home = obj.position.clone(); obj.userData.ex = V(...ex);
    obj.traverse(o => { if (o.isMesh) o.userData.partId = id; });
    if (!PART[id]) console.warn('no spec for', id);
    parts.set(id, obj); movers.push(obj); parent.add(obj); return obj;
  };
  const carrier = (pos, ex, parent = root) => { const g = new THREE.Group(); g.position.copy(pos); g.userData.home = pos.clone(); g.userData.ex = V(...ex); movers.push(g); parent.add(g); return g; };
  const mirrorZ = o => { const g = new THREE.Group(); g.add(o); g.scale.z = -1; return g; };
  const { halfW: W, yT: T, longZ: LZ } = D;

  // --- backbone
  for (const [id, s] of [['longeronL', -1], ['longeronR', 1]])
    add(id, mesh(cylX(D.tubeR, 650, -100, 0, s * LZ), MAT.alu()), [0, 0, 0]);
  add('spar', mesh(cylZ(D.tubeR, 910, D.sparX, D.sparY, 0), MAT.alu()), [0, -70, 0]);
  { const m = MAT.petg();
    add('sparCarrier', grp(mesh(box(26, 8, 2 * LZ + 20, D.sparX, -19, 0), m), mesh(box(26, 14, 16, D.sparX, -9, -60), m), mesh(box(26, 14, 16, D.sparX, -9, 60), m),
      clip(D.sparX, -LZ, 24, m), clip(D.sparX, LZ, 24, m)), [0, -150, 0]); }

  // --- nose, ring, canopy
  { const rings = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, x = D.xNoseJoin + (D.xNose - D.xNoseJoin) * t;
      const w = Math.max(1.5, W * (1 - t ** 1.9));
      const top = Math.max(1.5, (T + 15 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - t ** 3));
      const bot = Math.max(1.5, (T + 7 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * (1 - t ** 2.4));
      rings.push(fRing(x, w, top, bot, 0, 5.5 - 3.2 * t));
    }
    add('nose', mesh(loft(rings), MAT.lw()), [260, 0, 0]);
    add('noseRing', grp(mesh(loft([fRing(D.xNoseJoin - 5, W - 9, T - 7, T - 7, 0, 5.5), fRing(D.xNoseJoin + 5, W - 9, T - 7, T - 7, 0, 5.5)]), MAT.petg()),
      clip(D.xNoseJoin - 8, -LZ, 10, MAT.petg()), clip(D.xNoseJoin - 8, LZ, 10, MAT.petg())), [110, 0, 0]);
    const cr = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12, x = 236 + 150 * s, k = Math.sin(Math.PI * s ** 0.85);
      cr.push(fRing(x, Math.max(1, 38 * k ** 0.55), Math.max(1, 27 * k ** 0.7), 2, 24 + 9 * k ** 0.5 - 4 * s, 2.1, 28));
    }
    add('canopy', mesh(loft(cr), MAT.canopy()), [260, 150, 0]);
  }
  // --- fan bay
  { const m = MAT.lw();
    const lip = mesh(new THREE.TorusGeometry(D.fanR + 1, 2.5, 12, 64).rotateX(Math.PI / 2).translate(D.fanX, T, 0), MAT.dark());
    add('fanbay', grp(mesh(plan(rect(D.xFanAft, D.xNoseJoin, -W, W), -T, T, [{ x: D.fanX, z: 0, r: D.fanR }], 7), m), lip), [80, 0, 0]);
  }
  // --- centre tray + hatch
  { const m = MAT.lw();
    const wall = plan(rect(D.xTrayAft, D.xFanAft, -W, W), -T, T, [{ pts: rect(D.xTrayAft + 6, D.xFanAft - 6, -W + 8, W - 8) }], 7);
    const floor = plan(rect(D.xTrayAft + 6, D.xFanAft - 6, -W + 8, W - 8), -T, -T + 3);
    const belly = []; for (let i = 0; i <= 8; i++) { const s = i / 8; belly.push(fRing(D.xFanAft - 10 - (D.xFanAft - D.xTrayAft - 20) * s, 78 - 10 * s, 1, 4 + 13 * Math.sin(Math.PI * s) ** 0.6, -T + 1, 3, 28)); }
    const t = grp(mesh(wall, m), mesh(floor, m), mesh(loft(belly), m));
    for (const x of [-140, 0]) for (const s of [-1, 1]) t.add(clip(x, s * LZ, 14, m));
    add('tray', t, [0, -170, 0]);
    const hm = MAT.lw(), rings = [];
    for (let i = 0; i <= 8; i++) { const s = i / 8, x = D.xFanAft - 8 - (D.xFanAft - D.xTrayAft - 16) * s; rings.push(fRing(x, 64 - 16 * s, 32 - 16 * s + (i === 0 || i === 8 ? -14 : 0), 0, T - 2, 2.6, 28)); }
    add('hatch', grp(mesh(plan(rect(D.xTrayAft + 6.5, D.xFanAft - 6.5, -W + 8.5, W - 8.5), T - 4, T), hm), mesh(loft(rings), hm),
      mesh(box(10, 3, 30, D.xTrayAft + 8, T - 5, 0), MAT.petg())), [0, 190, 0]);
  }
  // --- aft bridge + booms
  { const a = D.xTrayAft, b = D.xBridgeAft, n = D.xNotch, wi = 84;
    add('aftBridge', mesh(plan([[a, -W], [a, W], [b, W], [b, wi], [n, wi], [n, -wi], [b, -wi], [b, -W]], -T, T, [], 7), MAT.lw()), [0, 130, 0]);
    const boom = () => mesh(plan([[b, wi], [b, W], [-405, W], [D.xBoomAft, W - 7], [D.xBoomAft, wi + 6], [-420, wi]], -T, T, [], 6), MAT.lw());
    add('boomR', boom(), [-150, 0, 50]); add('boomL', mirrorZ(boom()), [-150, 0, -50]);
  }
  // --- wings
  { const w = D.wing, tanS = Math.tan(rad(w.sweep));
    const le = z => w.rootLE - (z - w.rootZ) * tanS, ch = z => w.rootC + (w.tipC - w.rootC) * (z - w.rootZ) / (w.tipZ - w.rootZ);
    const sec = (z, t) => aRing(le(z), ch(z), z, w.y, t);
    const inner = () => mesh(loft([sec(w.rootZ, 0.09), sec((w.rootZ + w.midZ) / 2, 0.092), sec(w.midZ, 0.095)]), MAT.lw());
    const outer = () => mesh(loft([sec(w.midZ, 0.095), sec((w.midZ + w.tipZ) / 2, 0.1), sec(w.tipZ, 0.11)]), MAT.lw());
    add('wingInR', inner(), [0, 0, 200]); add('wingInL', mirrorZ(inner()), [0, 0, -200]);
    add('wingOutR', outer(), [0, 0, 360]); add('wingOutL', mirrorZ(outer()), [0, 0, -360]);
    const latch = () => grp(mesh(box(34, 3, 5, -120, w.y + 12, w.rootZ - 1), MAT.petg()), mesh(box(6, 6, 7, -106, w.y + 10, w.rootZ - 2), MAT.petg()));
    add('latchR', latch(), [0, 70, 130]); add('latchL', mirrorZ(latch()), [0, 70, -130]);
  }
  // --- roll pods, motors, props
  const props = [];
  for (const [sfx, s, dir] of [['R', 1, -1], ['L', -1, 1]]) {
    const m = MAT.petg(), z = s * D.rollZ;
    add('pod' + sfx, grp(mesh(cylZ(7, 58, D.sparX, D.sparY, s * 428), m), mesh(box(14, 14, 20, D.sparX, 0, z), m), mesh(cylY(16, 4, D.sparX, 8, z), m),
      mesh(new THREE.SphereGeometry(7, 20, 12).scale(1, 1, 1.6).translate(D.sparX, D.sparY, s * 458), m)), [0, 0, s * 520]);
    const mo = motor(); mo.position.set(D.sparX, 10, z); add('motor' + sfx, mo, [0, 80, s * 520]);
    const pr = prop(127, 3, dir); pr.position.set(D.sparX, 36, z); add('prop' + sfx, pr, [0, 170, s * 520]); props.push(pr);
  }
  // --- lift fan: spider, motor, prop
  { const m = MAT.petg(), sp = grp(), ang = Math.atan2(LZ, 50), len = 2 * Math.hypot(LZ, 50);
    for (const sgn of [-1, 1]) { const b = mesh(box(len, 6, 10), m); b.rotation.y = sgn * ang; b.position.set(D.fanX, -15, 0); sp.add(b); }
    sp.add(mesh(cylY(17, 5, D.fanX, -13.5, 0), m));
    for (const dx of [-50, 50]) for (const s of [-1, 1]) sp.add(clip(D.fanX + dx, s * LZ, 14, m));
    add('fanSpider', sp, [70, -190, 0]);
    const mo = motor(); mo.position.set(D.fanX, -11, 0); add('motorF', mo, [70, -110, 0]);
    const pr = prop(152, 3, 1); pr.position.set(D.fanX, 16, 0); add('propF', pr, [70, 230, 0]); props.push(pr);
  }
  // --- vectoring mount
  const tiltG = carrier(V(D.pivotX, 0, 0), [-250, 0, 0]);
  const yawG = new THREE.Group(); tiltG.add(yawG);
  { for (const [id, s] of [['bearingL', -1], ['bearingR', 1]]) {
      const m = MAT.petg();
      add(id, grp(mesh(box(26, 22, 14, D.pivotX, 0, s * (LZ - 3)), m), clip(D.pivotX, s * LZ, 26, m)), [-120, 0, s * 90]);
    }
    const ts = servo(true); ts.rotation.x = Math.PI / 2; ts.position.set(D.pivotX - 5.9, 0, -71); // shaft along +Z
    add('tiltServo', ts, [-120, 0, -150]);
    const ym = MAT.petg();
    add('yoke', grp(mesh(box(14, 14, 52, 0, 0, -30), ym), mesh(box(14, 14, 62, 0, 0, 44), ym), mesh(box(30, 4, 20, -5, -13, 0), ym), mesh(box(4, 26, 20, 8.5, 0, 0), ym),
      mesh(cylZ(4, 16, 0, 0, 80), ym)), [0, 0, 0], tiltG);
    const ys = servo(true); ys.position.set(-5.9, 0, 0); add('yawServo', ys, [0, 90, 0], tiltG);
    const cm = MAT.petg();
    add('cradle', grp(mesh(box(34, 2.5, 18, -15, 20.5, 0), cm), mesh(box(34, 2.5, 18, -15, -18, 0), cm), mesh(box(3, 41, 34, -31, 1.2, 0), cm)), [-60, 0, 0], yawG);
    const mo = motor(); mo.rotation.z = Math.PI / 2; mo.position.set(-32.5, 0, 0); add('motorM', mo, [-120, 0, 0], yawG);
    const pr = prop(152, 3, -1); pr.rotation.z = Math.PI / 2; pr.position.set(-D.propOffset, 0, 0); add('propM', pr, [-200, 0, 0], yawG); props.push(pr);
  }
  // --- tail
  const stabs = [];
  { const st = D.stab, tanS = Math.tan(rad(st.sweep));
    const mk = () => mesh(loft([aRing(st.rootLE - st.pivotX, st.rootC, st.rootZ, 0, 0.07), aRing(st.rootLE - st.pivotX - (st.tipZ - st.rootZ) * tanS, st.tipC, st.tipZ, 0, 0.08)]), MAT.lw());
    for (const [id, s] of [['stabR', 1], ['stabL', -1]]) {
      const g = s > 0 ? grp(mk()) : mirrorZ(mk()); g.position.set(st.pivotX, 0, 0);
      add(id, g, [-70, 0, s * 170]); stabs.push(g);
    }
    const f = D.fin, tanF = Math.tan(rad(f.sweep));
    const fin = () => mesh(loft([aRing(f.rootLE, f.rootC, 0, 0, 0.055), aRing(f.rootLE - f.h * tanF, f.tipC, f.h, 0, 0.07)]), MAT.lw());
    for (const [id, s] of [['finR', 1], ['finL', -1]]) {
      const inner = fin(); inner.rotation.x = -rad(90 - f.cant); inner.position.set(0, T - 3, f.z);
      add(id, s > 0 ? grp(inner) : mirrorZ(inner), [-40, 190, s * 70]);
    }
    for (const [id, s] of [['stabServoR', 1], ['stabServoL', -1]]) {
      const sv = servo(false); sv.rotation.x = s * Math.PI / 2; sv.position.set(-365, 0, s * 97); add(id, sv, [-150, -120, s * 50]);
    }
  }
  // --- electronics
  const battG = carrier(V(D.battery.xDefault, 0, 0), [0, 0, 0]);
  { add('battery', grp(mesh(box(135, 30, 43, 0, -3, 0), MAT.batt()), mesh(box(60, 30.6, 43.6, -10, -3, 0), MAT.label()), mesh(box(14, 8, 16, 74, 2, 0), MAT.label()),
      mesh(box(22, 1.2, 44.4, 30, 12.3, 0), MAT.dark())), [0, 300, 0], battG);
    add('batteryTray', grp(mesh(box(142, 2, 48, 0, -19.5, 0), MAT.petg()), mesh(box(142, 6, 2, 0, -16, 24.5), MAT.petg()), mesh(box(142, 6, 2, 0, -16, -24.5), MAT.petg())), [0, -90, 0], battG);
    add('fcSled', grp(mesh(box(96, 2, 34, -72, -14, -55), MAT.petg()), mesh(box(96, 5, 2, -72, -12, -73), MAT.petg())), [0, 60, -40]);
    add('esp32', grp(mesh(box(51, 1.6, 28, -52, -9, -55), MAT.dark()), mesh(box(18, 3.2, 16, -40, -6.6, -55), MAT.chip()), mesh(box(7, 2.6, 8, -75, -7, -55), MAT.chip()),
      mesh(box(44, 2.5, 2.5, -52, -11, -43), MAT.label()), mesh(box(44, 2.5, 2.5, -52, -11, -67), MAT.label())), [0, 130, -40]);
    add('imu', grp(mesh(box(21, 1.6, 16, -98, -10, -55), MAT.pcbBlue()), mesh(box(4, 1.2, 4, -98, -8.6, -55), MAT.dark())), [0, 200, -40]);
    add('rx', grp(mesh(box(47, 15, 26, -52, -8, 55), MAT.dark()), mesh(box(40, 0.6, 20, -52, -0.3, 55), MAT.label()),
      mesh(cylX(0.7, 60, -105, -3, 62), MAT.white()), mesh(cylX(0.7, 60, -105, -3, 48), MAT.white())), [0, 130, 40]);
    add('ubec', grp(mesh(box(34, 9, 18, -98, -12, 78), MAT.dark()), mesh(box(20, 9.6, 14, -98, -12, 78), MAT.pcb())), [0, 60, 60]);
    for (const [id, x, s] of [['escF', 2, -1], ['escM', 2, 1], ['escL', -140, -1], ['escR', -140, 1]]) {
      const e = esc(); e.position.set(x, -14, s * 55); add(id, e, [0, 95, s * 40]);
    }
  }
  // --- skids
  for (const [id, x] of [['skidF', 10], ['skidR', -150]]) {
    const m = MAT.petg(), g = grp(), gy = D.groundY;
    for (const s of [-1, 1]) {
      const leg = mesh(box(9, -T - gy - 2, 5, x, (-T + gy) / 2 - 1, s * (W + 4)), m); g.add(leg);
      g.add(mesh(box(70, 4, 7, x, gy + 2, s * (W + 4)), m));
      g.add(mesh(box(12, T + 6, 4, x, -T / 2 - 2, s * (W + 3)), m));
      g.add(mesh(box(12, 4, 18, x, 4, s * (W - 5)), m));
    }
    g.add(mesh(box(9, 4, 2 * W + 12, x, -T - 3, 0), m));
    add(id, g, [0, -260, 0]);
  }

  // shells that fade in x-ray mode
  const shells = ['nose', 'canopy', 'fanbay', 'tray', 'hatch', 'aftBridge', 'boomL', 'boomR', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'stabL', 'stabR', 'finL', 'finR'];
  return { root, parts, movers, props, joints: { tiltG, yawG, stabs, battG }, shells };
}
