// Procedural geometry for every part. Returns handles the viewer animates.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { D, PART } from './spec.js';
import { makeDrive } from './cords.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = d => d * Math.PI / 180;
const AX = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };

// ---------- materials (fresh instance per call so parts highlight independently)
const std = (o) => { const m = new THREE.MeshStandardMaterial(o); m.side = THREE.DoubleSide; return m; };
// FDM look: fine layer lines along the print axis, fading out with distance so they never shimmer
function printed(m, axis = 'y', pitch = 0.7, depth = 1) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uAxis = { value: AX[axis] || axis }; sh.uniforms.uPitch = { value: pitch }; sh.uniforms.uDepth = { value: depth };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uAxis; varying float vLayer; varying vec3 vAxisV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = dot(position, uAxis); vAxisV = normalize(normalMatrix * uAxis);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPitch; uniform float uDepth; varying float vLayer; varying vec3 vAxisV;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        float lf = vLayer / uPitch; float lamp = clamp(1.0 - fwidth(lf) * 1.5, 0.0, 1.0) * uDepth;
        normal = normalize(normal + vAxisV * (fract(lf) - 0.5) * 0.55 * lamp);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lf2 = vLayer / uPitch; float lamp2 = clamp(1.0 - fwidth(lf2) * 1.5, 0.0, 1.0) * uDepth;
        diffuseColor.rgb *= 1.0 - 0.16 * lamp2 * smoothstep(0.30, 0.5, abs(fract(lf2) - 0.5));`);
  };
  m.customProgramCacheKey = () => 'printed'; m.userData.printed = true;
  return m;
}
const MAT = {
  lw: (axis = 'y') => printed(std({ color: 0x7e8891, roughness: 0.9, metalness: 0 }), axis, 0.75, 1),
  petg: (axis = 'y') => printed(std({ color: 0xf47216, roughness: 0.32, metalness: 0 }), axis, 0.6, 0.8),
  alu: () => std({ color: 0xcdd2d6, roughness: 0.34, metalness: 1 }),
  steel: () => std({ color: 0x9a9da1, roughness: 0.3, metalness: 1 }),
  dark: () => std({ color: 0x16181b, roughness: 0.5, metalness: 0.2 }),
  gun: () => std({ color: 0x2b2e33, roughness: 0.33, metalness: 0.85 }),
  copper: () => std({ color: 0xc67a3c, roughness: 0.45, metalness: 0.85 }),
  mag: () => std({ color: 0x8d9094, roughness: 0.35, metalness: 0.9 }),
  prop: () => std({ color: 0x18c7b3, roughness: 0.28, metalness: 0, transparent: true, opacity: 0.9 }),
  disc: () => new THREE.MeshBasicMaterial({ color: 0x1fd1bd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  canopy: () => { const m = new THREE.MeshPhysicalMaterial({ color: 0xa8843a, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.4, clearcoat: 1 }); m.side = THREE.DoubleSide; return m; },
  wrap: () => std({ color: 0x0e0f11, roughness: 0.38 }),
  shrink: (c = 0x15171a) => std({ color: c, roughness: 0.35 }),
  yellow: () => std({ color: 0xf0c020, roughness: 0.5 }),
  pcbK: () => std({ color: 0x15191c, roughness: 0.45 }),
  pcbB: () => std({ color: 0x1a45b8, roughness: 0.45 }),
  tin: () => std({ color: 0xc9cdd1, roughness: 0.28, metalness: 0.95 }),
  gold: () => std({ color: 0xd4af37, roughness: 0.3, metalness: 1 }),
  mg: () => std({ color: 0x3b2a22, roughness: 0.25, transparent: true, opacity: 0.93 }),
  sg: () => std({ color: 0x2456c8, roughness: 0.25, transparent: true, opacity: 0.9 }),
  white: () => std({ color: 0xeef0f2, roughness: 0.5 }),
  velcro: () => std({ color: 0x0b0b0c, roughness: 1 }),
  wire: c => std({ color: c, roughness: 0.55 }),
};

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
function fRing(x, w, top, bot, yc, n = 2.5, N = 48) {
  const r = [];
  for (let i = 0; i < N; i++) {
    const t = 2 * Math.PI * i / N, c = Math.cos(t), s = Math.sin(t), e = 2 / n;
    r.push(V(x, yc + (s >= 0 ? top : bot) * Math.sign(s) * Math.abs(s) ** e, w * Math.sign(c) * Math.abs(c) ** e));
  }
  return r;
}
const naca = (xc, t) => 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
function aRing(xLE, chord, z, y, t, M = 18) {
  const up = [], lo = [];
  for (let i = 0; i <= M; i++) {
    const xc = (1 - Math.cos(Math.PI * i / M)) / 2, yt = naca(xc, t) * chord;
    up.push(V(xLE - chord * xc, y + yt, z));
    if (i > 0 && i < M) lo.unshift(V(xLE - chord * xc, y - yt, z));
  }
  return [...up, ...lo];
}
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
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 64 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0);
  return g;
}
const rect = (x0, x1, z0, z1) => [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
const box = (sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
// box with rounded edges, long axis X
function rbox(sx, sy, sz, r, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape(), w = sz / 2, h = sy / 2, b = r * 0.6;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth: sx - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -sx / 2 + b); g.rotateY(Math.PI / 2); g.translate(x, y, z); return g;
}
const cylY = (r, h, x = 0, y = 0, z = 0, seg = 36) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const cylX = (r, h, x = 0, y = 0, z = 0, seg = 24) => new THREE.CylinderGeometry(r, r, h, seg).rotateZ(Math.PI / 2).translate(x, y, z);
const cylZ = (r, h, x = 0, y = 0, z = 0, seg = 24) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2).translate(x, y, z);
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };
function grp(...children) { const g = new THREE.Group(); children.flat(3).forEach(c => c && g.add(c)); return g; }
function tubeAl(len, axis, x, y, z) { // hollow 8 mm x 1 mm tube
  const m = MAT.alu(), inner = MAT.dark(), R = D.tubeR, g = grp();
  const mk = (r) => { const c = new THREE.CylinderGeometry(r, r, len, 28, 1, true); axis === 'x' ? c.rotateZ(Math.PI / 2) : c.rotateX(Math.PI / 2); return c.translate(x, y, z); };
  g.add(mesh(mk(R), m), mesh(mk(R - 1), inner));
  for (const s of [-1, 1]) { const r = new THREE.RingGeometry(R - 1, R, 28); axis === 'x' ? r.rotateY(Math.PI / 2).translate(x + s * len / 2, y, z) : r.translate(x, y, z + s * len / 2); g.add(mesh(r, m)); }
  return g;
}
function clip(x, z, len = 16, m) { // C-clip that grips an 8 mm tube
  const g = new THREE.TorusGeometry(6.1, 2.1, 10, 30, Math.PI * 1.5);
  g.rotateY(Math.PI / 2); g.rotateX(-Math.PI * 0.25 - Math.PI / 2);
  return grp([-len / 2 + 2.1, 0, len / 2 - 2.1].map(dx => mesh(g.clone().translate(x + dx, 0, z), m)), mesh(box(len, 4, 10, x, -7.2, z), m));
}
function tube(pts, r, color, off = [0, 0, 0]) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => V(p[0] + off[0], p[1] + off[1], p[2] + off[2])), false, 'catmullrom', 0.35);
  return mesh(new THREE.TubeGeometry(c, pts.length * 10, r, 7), MAT.wire(color));
}
function label(lines, w, h, bg, fg, x, y, z) { // flat sticker facing +Y, text reads along +X
  const k = 14, c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.textBaseline = 'middle';
  lines.forEach(([txt, size, wt = 700], i) => { g.font = `${wt} ${size * k}px Arial, Helvetica, sans-serif`; g.fillText(txt, 0.06 * c.width, c.height * (i + 0.5) / lines.length); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const o = mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).translate(x, y, z), std({ map: t, roughness: 0.42 })); o.castShadow = false; return o;
}
const screws = (r, y, n = 4) => Array.from({ length: n }, (_, i) => { const a = Math.PI / 4 + i * 2 * Math.PI / n; return mesh(cylY(2.75, 3, r * Math.cos(a), y, r * Math.sin(a), 12), MAT.steel()); });

// Collapse the many small non-printed meshes of a part (pins, screws, wires) into one mesh per finish.
function optimise(obj) {
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), buckets = new Map();
  obj.traverse(o => {
    const m = o.material;
    if (!o.isMesh || o.userData.noPick || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.map || m.userData.printed) return;
    const k = [m.color.getHex(), m.roughness, m.metalness, m.opacity].join('|');
    (buckets.get(k) || buckets.set(k, []).get(k)).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const gs = list.map(o => { const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); if (!g.attributes.normal) g.computeVertexNormals(); return g; });
    list.forEach(o => o.parent.remove(o));
    obj.add(mesh(mergeGeometries(gs), list[0].material));
  }
  return obj;
}

// ---------- bought components, modelled to catalogue dimensions
function motor() { // EMAX ECO II 2306: axis +Y, mounting face on y=0
  const g = grp(), gun = MAT.gun();
  g.add(mesh(cylY(9, 3, 0, 1.5), gun));
  for (let i = 0; i < 4; i++) { const b = mesh(box(16, 2.6, 7.5, 5.5, 1.3, 0), gun); b.rotation.y = Math.PI / 4 + i * Math.PI / 2; g.add(b); }
  g.add(mesh(cylY(5.2, 9, 0, 7.5), MAT.dark()));
  const cu = MAT.copper();
  for (let i = 0; i < 12; i++) { const c = mesh(rbox(5.4, 6.6, 4.6, 1.6, 8.6, 7.6, 0), cu); c.rotation.y = i * Math.PI / 6; g.add(c); }
  g.add(mesh(new THREE.CylinderGeometry(14.3, 14.3, 8.5, 48, 1, true).translate(0, 8.2, 0), gun));
  g.add(mesh(new THREE.CylinderGeometry(13.3, 13.3, 7.5, 48, 1, true).translate(0, 8.2, 0), MAT.mag()));
  g.add(mesh(new THREE.TorusGeometry(13.2, 1.15, 8, 48).rotateX(Math.PI / 2).translate(0, 12.6, 0), gun));
  for (let i = 0; i < 5; i++) { const s = mesh(box(11, 1.8, 3.4, 8.4, 13.1, 0), gun); s.rotation.y = i * 2 * Math.PI / 5; g.add(s); }
  g.add(mesh(new THREE.CylinderGeometry(4.2, 5.4, 4, 24).translate(0, 14.4, 0), gun));
  g.add(mesh(cylY(2.5, 13, 0, 22, 0, 16), MAT.steel()));
  g.add(...screws(8, -4.5));
  return g;
}
function prop(diam, blades, dir = 1) { // twisted aerofoil blades, axis +Y, hub centred on y=0
  const R = diam / 2, pitch = diam * 0.62, g = grp(), pm = MAT.prop(), N = 12, rings = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, r = 5 + (R - 5) * u, c = Math.max(1.2, R * 0.30 * Math.sin(Math.PI * (0.16 + 0.80 * u)) ** 0.8 * (u > 0.94 ? 1 - ((u - 0.94) / 0.06) ** 2 * 0.72 : 1));
    const beta = Math.atan2(pitch, 2 * Math.PI * Math.max(r, R * 0.22)), cb = Math.cos(beta), sb = Math.sin(beta), ring = [], M = 8, t = 0.11 - 0.05 * u;
    const pt = (xc, yt) => { const a = (xc - 0.4) * c, th = yt * c + 0.07 * c * Math.sin(Math.PI * xc); return V(r, a * sb + th * cb, dir * (a * cb - th * sb)); };
    for (let k = 0; k <= M; k++) { const xc = (1 - Math.cos(Math.PI * k / M)) / 2; ring.push(pt(xc, naca(xc, t))); }
    for (let k = M - 1; k > 0; k--) { const xc = (1 - Math.cos(Math.PI * k / M)) / 2; ring.push(pt(xc, -naca(xc, t))); }
    rings.push(ring);
  }
  const bg = loft(rings);
  for (let i = 0; i < blades; i++) { const b = mesh(bg, pm); b.rotation.y = i * 2 * Math.PI / blades; g.add(b); }
  g.add(mesh(cylY(6.6, 6.4, 0, 0, 0, 28), pm));
  g.add(mesh(cylY(4.6, 4.6, 0, 5.2, 0, 6), MAT.steel()), mesh(cylY(3.4, 1.2, 0, 8, 0, 16), MAT.white()));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 56).rotateX(-Math.PI / 2), MAT.disc());
  disc.userData.noPick = true; g.add(disc);
  g.userData.disc = disc; g.userData.dir = dir;
  return g;
}
function servo(metal) { // MG90S / SG90: 22.8 x 12.2 x 22.7 body; output shaft along +Y at local x=+5.9
  const b = metal ? MAT.mg() : MAT.sg(), g = grp();
  g.add(mesh(rbox(22.8, 22.7, 12.2, 1.2, 0, -0.4, 0), b));
  const ear = new THREE.Shape(); ear.moveTo(-16.2, -6.1); ear.lineTo(16.2, -6.1); ear.lineTo(16.2, 6.1); ear.lineTo(-16.2, 6.1); ear.closePath();
  for (const ex of [-13.9, 13.9]) { const h = new THREE.Path(); h.absarc(ex, 0, 1.1, 0, Math.PI * 2, true); ear.holes.push(h); }
  g.add(mesh(new THREE.ExtrudeGeometry(ear, { depth: 2.4, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 5.2, 0), b));
  g.add(mesh(cylY(5.9, 4.4, 5.9, 13.1), b), mesh(cylY(2.8, 4.4, -0.6, 13.1, 0, 20), b));
  g.add(mesh(cylY(2.35, 3.2, 5.9, 16.6, 0, 20), metal ? MAT.gold() : MAT.white()));
  const horn = new THREE.Shape(); horn.absarc(0, 0, 3.4, Math.PI * 0.5, Math.PI * 1.5, false); horn.lineTo(15, -2); horn.absarc(15, 0, 2, -Math.PI / 2, Math.PI / 2, false); horn.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(horn, { depth: 1.6, bevelEnabled: false }).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(5.9, 18.2, 0), MAT.white()));
  g.add(mesh(cylY(1.5, 1.2, 5.9, 20.2, 0, 12), MAT.steel()));
  [0x7a3b12, 0xc81e1e, 0xf08a1c].forEach((c, i) => g.add(mesh(cylX(0.55, 9, -15.4, -9, (i - 1) * 1.25, 8), MAT.wire(c))));
  return g;
}
function esc() { // 30-40 A speed controller in heat-shrink; +X = motor end
  const g = grp(mesh(rbox(46, 7.5, 25, 2.2), MAT.shrink()), label([['30A BLHeli', 3.2], ['2-4S  LiPo', 2.6, 400]], 26, 12, '#d8dbe0', '#111', -4, 3.9, 0));
  g.add(mesh(cylZ(4.1, 16, -19, 7.2, 0, 20), MAT.shrink(0x23262b)), mesh(cylZ(4.15, 4, -19, 7.2, 5, 20), MAT.tin()));
  [-6, 0, 6].forEach(z => g.add(mesh(cylX(1.55, 9, 27, 0, z, 10), MAT.wire(0x101010)), mesh(cylX(1.9, 5, 33, 0, z, 10), MAT.gold())));
  g.add(mesh(cylX(1.9, 8, -27, 0, 4.2, 10), MAT.wire(0xc81e1e)), mesh(cylX(1.9, 8, -27, 0, -4.2, 10), MAT.wire(0x101010)));
  return g;
}
function battery() { // 4S 3300 mAh: 135 x 43 x 30, centred on x
  const g = grp(mesh(rbox(135, 30, 43, 5, 0, -3, 0), MAT.wrap()));
  g.add(label([['TERANTY', 6.2], ['3300mAh  14.8V', 4.6], ['4S1P   60C', 4.6, 400]], 84, 30, '#0d3b8f', '#ffffff', -10, 12.15, 0));
  g.add(mesh(box(86, 0.3, 4, -10, 12.1, 18.5), MAT.yellow()), mesh(box(86, 0.3, 4, -10, 12.1, -18.5), MAT.yellow()));
  g.add(mesh(box(24, 1.3, 45, 46, 12.4, 0), MAT.velcro()), mesh(box(24, 31.6, 1.3, 46, -3, 22.2), MAT.velcro()), mesh(box(24, 31.6, 1.3, 46, -3, -22.2), MAT.velcro()));
  g.add(tube([[-67, 2, 6], [-72, 0, 14], [-70, -5, 27], [-62, -8, 31]], 2.1, 0xc81e1e), tube([[-67, 2, -6], [-73, -1, 6], [-72, -6, 24], [-62, -8, 35]], 2.1, 0x101010));
  g.add(mesh(rbox(16, 8.2, 16, 1.5, -54, -8, 33), MAT.yellow()));
  [0xc81e1e, 0x101010, 0x1b59c0, 0xf0c020, 0xeeeeee].forEach((c, i) => g.add(tube([[-67, -8, 14], [-76, -9, 15], [-84, -10, 15]], 0.5, c, [0, i * 1.05 - 2, 0])));
  g.add(mesh(box(7, 6.5, 4, -87, -10, 15), MAT.white()));
  return g;
}

// ---------- assembly
export function buildModel(cad = {}) {
  const root = new THREE.Group();
  const parts = new Map(), movers = [];
  const add = (id, obj, ex = [0, 0, 0], parent = root) => {
    if (cad[id]) {   // real CAD replaces the stand-in shape
      const c = cad[id], pos = obj.position.clone(), m = c.material === 'LW-PLA' ? MAT.lw(c.axis) : c.material === 'PETG' ? MAT.petg(c.axis) : MAT.canopy();
      obj = mesh(c.geo, m); obj.position.copy(pos); obj.userData.cad = true;
    }
    optimise(obj); obj.userData.partId = id; obj.userData.home = obj.position.clone(); obj.userData.ex = V(...ex);
    obj.traverse(o => { if (o.isMesh) o.userData.partId = id; });
    if (!PART[id]) console.warn('no spec for', id);
    parts.set(id, obj); movers.push(obj); parent.add(obj); return obj;
  };
  const carrier = (pos, ex, parent = root) => { const g = new THREE.Group(); g.position.copy(pos); g.userData.home = pos.clone(); g.userData.ex = V(...ex); movers.push(g); parent.add(g); return g; };
  const mirrorZ = o => { const g = new THREE.Group(); g.add(o); g.scale.z = -1; return g; };
  const { halfW: W, yT: T, longZ: LZ } = D;

  // --- backbone
  for (const [id, s] of [['longeronL', -1], ['longeronR', 1]]) add(id, tubeAl(D.tubeFront - D.tubeRear, 'x', (D.tubeFront + D.tubeRear) / 2, 0, s * LZ));
  add('spar', tubeAl(2 * D.sparHalf, 'z', D.sparX, D.sparY, 0), [0, -70, 0]);
  { const m = MAT.petg();
    add('sparCarrier', grp(mesh(box(26, 7, 2 * LZ + 20, D.sparX, -18.5, 0), m), [-60, 60].map(z => mesh(box(26, 13, 16, D.sparX, -9.5, z), m)),
      [-LZ, LZ].map(z => mesh(box(26, 13, 9, D.sparX, -11, z), m)), clip(D.sparX, -LZ, 24, m), clip(D.sparX, LZ, 24, m)), [0, -150, 0]); }

  // --- nose (narrower than the body so the fan-bay corners read as intakes), ring, canopy
  const NW = 80;
  { const rings = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, x = D.xNoseJoin + (D.xNose - D.xNoseJoin) * t;
      const w = Math.max(1.5, NW * (1 - t ** 1.75));
      const top = Math.max(1.5, (T + 15 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - t ** 3));
      const bot = Math.max(1.5, (T + 7 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * (1 - t ** 2.4));
      rings.push(fRing(x, w, top, bot, 0, 4.6 - 2.3 * t));
    }
    const tub = []; for (let i = 0; i <= 8; i++) { const s = i / 8, k = Math.sin(Math.PI * s ** 0.85); tub.push(fRing(244 + 134 * s, Math.max(1, 31 * k ** 0.55), Math.max(1, 9 * k ** 0.7), 1, 27 + 6 * k ** 0.5 - 4 * s, 2.1, 24)); }
    add('noseCone', mesh(loft([fRing(380, 56, 28, 34, 0, 3), fRing(500, 8, 3, 8, -4, 2.4)]), MAT.lw('x')), [400, 0, 0]);
    add('nose', grp(mesh(loft(rings), MAT.lw('x')), mesh(loft(tub), MAT.dark()), mesh(box(10, 14, 16, 300, 38, 0), MAT.dark()), mesh(box(3, 20, 18, 292, 40, 0), MAT.dark())), [260, 0, 0]);
    const pm = MAT.petg('x');
    add('noseRing', grp(mesh(loft([fRing(D.xNoseJoin - 6, NW - 8, T - 6, T - 6, 0, 4.6), fRing(D.xNoseJoin + 6, NW - 8, T - 6, T - 6, 0, 4.6)]), pm),
      [-1, 1].map(s => [mesh(box(8, 5, 26, D.xNoseJoin - 9, -5, s * (NW + 4)), pm), clip(D.xNoseJoin - 9, s * LZ, 10, pm)])), [110, 0, 0]);
    const cr = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14, x = 236 + 150 * s, k = Math.sin(Math.PI * s ** 0.85);
      cr.push(fRing(x, Math.max(1, 37 * k ** 0.55), Math.max(1, 27 * k ** 0.7), 2, 24 + 9 * k ** 0.5 - 4 * s, 2.1, 32));
    }
    add('canopy', mesh(loft(cr), MAT.canopy()), [200, 190, 0]);
  }
  // --- fan bay
  { const m = MAT.lw('y');
    const lip = mesh(new THREE.TorusGeometry(D.fanR + 0.6, 2.2, 12, 72).rotateX(Math.PI / 2).translate(D.fanX, T - 0.5, 0), m);
    const intakes = [-1, 1].map(s => mesh(box(1.2, 26, 19, D.xNoseJoin + 0.4, 0, s * 93), MAT.dark()));
    add('fanbay', grp(mesh(plan(rect(D.xFanAft, D.xNoseJoin, -W, W), -T, T, [{ x: D.fanX, z: 0, r: D.fanR }], 7), m), lip, intakes), [80, 0, 0]);
  }
  // --- centre tray + hatch
  { const m = MAT.lw('y');
    const wall = plan(rect(D.xTrayAft, D.xFanAft, -W, W), -T, T, [{ pts: rect(D.xTrayAft + 6, D.xFanAft - 6, -W + 8, W - 8) }], 7);
    const floor = plan(rect(D.xTrayAft + 6, D.xFanAft - 6, -W + 8, W - 8), -T, -T + 3);
    const belly = []; for (let i = 0; i <= 8; i++) { const s = i / 8; belly.push(fRing(D.xFanAft - 10 - (D.xFanAft - D.xTrayAft - 20) * s, 78 - 10 * s, 1, 4 + 13 * Math.sin(Math.PI * s) ** 0.6, -T + 1, 3, 32)); }
    const rails = [-27, 27].map(z => mesh(box(170, 4, 2.4, -70, -T + 5, z), m));
    const t = grp(mesh(wall, m), mesh(floor, m), mesh(loft(belly), m), rails);
    for (const x of [-140, 0]) for (const s of [-1, 1]) t.add(clip(x, s * LZ, 14, m));
    add('tray', t, [0, -170, 0]);
    const hm = MAT.lw('y'), rings = [];
    for (let i = 0; i <= 10; i++) { const s = i / 10, x = D.xFanAft - 8 - (D.xFanAft - D.xTrayAft - 16) * s, e = Math.min(1, Math.sin(Math.PI * Math.min(0.5, s * 2.5)) ** 0.6, Math.sin(Math.PI * Math.min(0.5, (1 - s) * 2.5)) ** 0.6); rings.push(fRing(x, 64 - 16 * s, 3 + (29 - 16 * s) * e, 0, T - 2, 2.6, 32)); }
    const pm = MAT.petg();
    add('hatch', grp(mesh(plan(rect(D.xTrayAft + 6.5, D.xFanAft - 6.5, -W + 8.5, W - 8.5), T - 4, T), hm), mesh(loft(rings), hm),
      mesh(box(12, 3, 34, D.xFanAft - 4, T - 6, 0), pm), mesh(box(10, 3, 30, D.xTrayAft + 8, T - 5, 0), pm), mesh(box(3, 9, 30, D.xTrayAft + 4.5, T - 8, 0), pm)), [0, 190, 0]);
  }
  // --- aft bridge + booms
  { const a = D.xTrayAft, b = D.xBridgeAft, n = D.xNotch, wi = 84;
    add('aftBridge', mesh(plan([[a, -W], [a, W], [b, W], [b, wi], [n, wi], [n, -wi], [b, -wi], [b, -W]], -T, T, [], 7), MAT.lw('y')), [0, 130, 0]);
    const boom = () => mesh(plan([[b, wi], [b, W], [-405, W], [D.xBoomAft, W - 7], [D.xBoomAft, wi + 6], [-420, wi]], -T, T, [], 6), MAT.lw('y'));
    add('boomR', boom(), [-150, 0, 50]); add('boomL', mirrorZ(boom()), [-150, 0, -50]);
  }
  // --- wings
  { const w = D.wing, tanS = Math.tan(rad(w.sweep));
    const le = z => w.rootLE - (z - w.rootZ) * tanS, ch = z => w.rootC + (w.tipC - w.rootC) * (z - w.rootZ) / (w.tipZ - w.rootZ);
    const sec = (z, t) => aRing(le(z), ch(z), z, w.y, t);
    const span = (z0, z1, t0, t1) => loft(Array.from({ length: 5 }, (_, i) => sec(z0 + (z1 - z0) * i / 4, t0 + (t1 - t0) * i / 4)));
    const inner = () => mesh(span(w.rootZ, w.midZ, 0.09, 0.095), MAT.lw('z'));
    const outer = () => mesh(span(w.midZ, w.tipZ, 0.095, 0.11), MAT.lw('z'));
    add('wingInR', inner(), [0, 0, 200]); add('wingInL', mirrorZ(inner()), [0, 0, -200]);
    add('wingOutR', outer(), [0, 0, 360]); add('wingOutL', mirrorZ(outer()), [0, 0, -360]);
    add('hatchLatch', mesh(box(11, 5.6, 30, -158, 17, 0), MAT.petg()), [0, 240, 0]);
  }
  // --- roll motors buried in the wings: mount on the spar, motor below, 4 in propeller at the upper surface
  const props = [];
  for (const [sfx, s, dir] of [['R', 1, -1], ['L', -1, 1]]) {
    const m = MAT.petg('y'), z = s * D.rollZ;
    add('pod' + sfx, grp(mesh(box(22, 4, 16, (D.rollX + D.sparX) / 2, D.rollPadY - 2, z), m), mesh(cylY(16, 4, D.rollX, D.rollPadY - 2, z), m), mesh(box(14, 22, 24, D.sparX, -20, z), m)), [0, -150, 0]);
    const mo = motor(); mo.position.set(D.rollX, D.rollPadY, z); add('motor' + sfx, mo, [0, -90, 0]);
    const pr = prop(102, 3, dir); pr.position.set(D.rollX, D.rollPropY, z); add('prop' + sfx, pr, [0, 150, 0]); props.push(pr);
  }
  // --- lift fan: spider, motor, 120 mm rotor in a shroud ring. Fan parts are modelled in the kit frame (flow along +X).
  const kitGeo = id => cad[id] ? cad[id].geo : null;
  const kitMesh = (id, m) => mesh(kitGeo(id) || new THREE.BoxGeometry(1, 1, 1), m);
  const fans = {};
  { const m = MAT.petg(), sp = grp(), ang = Math.atan2(LZ, 50), len = 2 * Math.hypot(LZ, 50) - 6;
    for (const sgn of [-1, 1]) { const bb = mesh(box(len, 7, 9), m); bb.rotation.y = sgn * ang; bb.position.set(D.fanX, -15.5, 0); sp.add(bb); }
    sp.add(mesh(cylY(16.5, 5, D.fanX, -14.5, 0), m));
    add('fanSpider', sp, [70, -190, 0]);
    const mo = motor(); mo.position.set(D.fanX, -12, 0); add('motorF', mo, [70, -110, 0]);
    const liftRoot = new THREE.Group(); liftRoot.position.set(D.fanX, D.lift.y0, 0); liftRoot.rotation.z = -Math.PI / 2; root.add(liftRoot);   // kit +X (flow) points down
    add('liftRing', kitMesh('liftRing', MAT.petg(new THREE.Vector3(1, 0, 0))), [-150, 0, 0], liftRoot);
    fans.lift = add('liftRotor', kitMesh('liftRotor', MAT.prop()), [-260, 0, 0], liftRoot);
  }
  // --- main fan and three-bearing swivel nozzle. The kit frame is turned to face aft and set on the nacelle axis.
  const kitRoot = new THREE.Group(); kitRoot.position.set(D.nozzle.xJ1, D.nozzle.yAx, 0); kitRoot.rotation.y = Math.PI; root.add(kitRoot);
  const K = cad.__kit || { alpha: 40, joints: [0, 58, 162] };
  const a2 = rad(K.alpha), [kx1, kx2, kx3] = K.joints, ax = new THREE.Vector3(1, 0, 0);
  const sub = (parent, x) => { const g = new THREE.Group(); g.position.set(x, 0, 0); parent.add(g); return g; };
  const g1 = sub(kitRoot, kx1), g2 = sub(g1, kx2 - kx1), g3 = sub(g2, kx3 - kx2);
  const nozzle = { g1, g2, g3, n2: new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0), n3: new THREE.Vector3(Math.cos(a2), -Math.sin(a2), 0) };
  { const px = new THREE.Vector3(1, 0, 0), kp = () => MAT.petg(px);
    add('edfDuct', kitMesh('edfDuct', kp()), [70, 0, 0], kitRoot);
    add('tailCone', kitMesh('tailCone', kp()), [60, -110, 0], kitRoot);
    fans.main = add('impeller', kitMesh('impeller', MAT.prop()), [-140, 0, 0], kitRoot);
    const mo = motor(); mo.rotation.z = Math.PI / 2; mo.position.set(-44, 0, 0); add('motorM', mo, [-70, 0, 0], kitRoot);
    const seg = (id, parent, x, ex) => { const m = kitMesh(id, kp()); m.position.set(-x, 0, 0); return add(id, m, ex, parent); };
    seg('seg1', g1, kx1, [0, 0, 0]); seg('seg2', g2, kx2, [70, 0, 0]); seg('seg3', g3, kx3, [140, 0, 0]);
    const frames = [sub(g1, 0), sub(g2, 0), sub(g3, 0)]; frames[1].rotation.z = a2; frames[2].rotation.z = -a2;   // each collar is keyed to the part downstream of it
    frames.forEach((f, j) => {
      const c = grp(); for (const half of [0, 1]) { const h = kitMesh(j ? 'collar' : 'collarJ1', MAT.dark()); h.rotation.x = half * Math.PI; c.add(h); }
      add('collar' + (j + 1), c, [0, 110, 0], f);
    });
    nozzle.ring = sub(kitRoot, 0); add('driveRing', kitMesh('driveRing', MAT.white()), [30, -120, 0], nozzle.ring);
    if (K.drive) {   // two servos buried in the body, a cord drum on each, and the cords to the nozzle
      const tmp = new THREE.Group();
      nozzle.drive = makeDrive(kitRoot, K, {
        drumMesh: i => add('drum' + (i + 1), kitMesh('servoDrum', MAT.white()), [0, -150, 0], tmp),
        servoMesh: (i, side) => { const sv = servo(true); sv.rotation.x = -side * Math.PI / 2; return add('nzServo' + (i + 1), grp(sv), [0, -100, 0], tmp); },
      });
    }
    for (const [id, sd] of [['fairleadR', 1], ['fairleadL', -1]]) add(id, mesh(box(4, 60, 9, -256, -7, sd * 53), MAT.petg()), [-60, 0, 0]);
  }
  // --- tail
  const stabs = [];
  { const st = D.stab, tanS = Math.tan(rad(st.sweep));
    const mk = () => grp(mesh(loft(Array.from({ length: 4 }, (_, i) => { const u = i / 3, z = st.rootZ + (st.tipZ - st.rootZ) * u; return aRing(st.rootLE - st.pivotX - (z - st.rootZ) * tanS, st.rootC + (st.tipC - st.rootC) * u, z, 0, 0.07 + 0.01 * u); })), MAT.lw('z')),
      mesh(cylZ(1.5, 26, 0, 0, st.rootZ - 9, 12), MAT.steel()), mesh(box(3, 30, 2.4, 22, -15, st.rootZ + 1.2), MAT.petg()));
    for (const [id, s] of [['stabR', 1], ['stabL', -1]]) {
      const g = s > 0 ? mk() : mirrorZ(mk()); g.position.set(st.pivotX, st.pivotY, 0);
      add(id, g, [-70, 0, s * 170]); stabs.push(g);
    }
    const f = D.fin, tanF = Math.tan(rad(f.sweep));
    const fin = () => mesh(loft(Array.from({ length: 4 }, (_, i) => { const u = i / 3; return aRing(f.rootLE - f.h * u * tanF, f.rootC + (f.tipC - f.rootC) * u, f.h * u, 0, 0.055 + 0.015 * u); })), MAT.lw('z'));
    for (const [id, s] of [['finR', 1], ['finL', -1]]) {
      const inner = fin(); inner.rotation.x = -rad(90 - f.cant); inner.position.set(0, T - 3, f.z);
      add(id, s > 0 ? grp(inner) : mirrorZ(inner), [-40, 190, s * 70]);
    }
    for (const [id, s] of [['stabServoR', 1], ['stabServoL', -1]]) {
      // dropped in from below: shaft down, horn under the boom, clear of the fin root
      const sv = servo(false); if (s > 0) sv.rotation.x = Math.PI; else sv.rotation.z = Math.PI; sv.position.set(-362 - s * 5.9, -20.1, s * 96);
      const rod = tube([[-362, -39.5, s * 111], [-370, -37.5, s * 111.4], [-378, -35, s * 111.6]], 0.6, 0x9a9da1);
      add(id, grp(sv, rod), [-150, -120, s * 50]);
    }
  }
  // --- electronics
  const battG = carrier(V(D.battery.xDefault, 0, 0), [0, 0, 0]);
  { add('battery', battery(), [0, 300, 0], battG);
    const pt = MAT.petg(), BX = D.battery.xDefault + 52;      // the bay and everything in it moved forward with the battery
    const addB = (id, o, ex, dx, dy, dz) => { o.position.set(dx, dy, dz); return add(id, o, ex); };   // electronics now live in the nose bay, under the canopy
    add('batteryTray', grp(mesh(box(142, 2, 50, 0, -19.6, 0), pt), [-1, 1].map(s => mesh(box(142, 7, 2, 0, -16, s * 24), pt)), mesh(box(3, 9, 50, 70, -15.5, 0), pt)), [0, -90, 0], battG);
    add('fcSled', grp(mesh(box(100, 2, 36, -74, -15, -55), pt), mesh(box(100, 5, 2, -74, -13, -74), pt), mesh(box(100, 5, 2, -74, -13, -36), pt), mesh(box(8, 6, 10, -22, -12, -55), pt)), [0, 60, -40]);
    // ESP32 DevKit v1 (51.5 x 28.3): shielded module, USB, two header rows, buttons
    { const g = grp(mesh(box(51.5, 1.6, 28.3, -52, -8.5, -55), MAT.pcbK()), mesh(box(17.8, 3.1, 15.8, -38, -6.1, -55), MAT.tin()), mesh(box(6.5, 0.9, 17.6, -29.6, -7.3, -55), MAT.pcbK()),
        mesh(box(5.6, 2.6, 7.6, -75, -6.4, -55), MAT.tin()), mesh(box(3.2, 1.8, 4, -66, -6.8, -47), MAT.tin()), mesh(box(3.2, 1.8, 4, -66, -6.8, -63), MAT.tin()),
        mesh(box(5, 1.6, 5, -56, -6.9, -55), MAT.dark()), mesh(box(6, 1.8, 3.5, -64, -6.8, -55), MAT.dark()));
      for (const z of [-67.7, -42.3]) { g.add(mesh(box(38.2, 2.5, 2.5, -52, -10.5, z), MAT.dark())); for (let i = 0; i < 15; i++) g.add(mesh(box(0.64, 9.5, 0.64, -69.8 + i * 2.54, -11.5, z), MAT.gold())); }
      g.add(label([['ESP-WROOM-32', 1.9]], 15, 5, '#c9cdd1', '#222', -38.5, -4.5, -55));
      addB('esp32', g, [0, 130, -40], 407, 8.5, 55); }
    { const g = grp(mesh(box(21, 1.6, 16, -98, -11, -55), MAT.pcbB()), mesh(box(4, 1, 4, -99, -9.7, -55), MAT.dark()), mesh(box(2.5, 2.5, 20.3, -107, -9.2, -55), MAT.dark()));
      for (let i = 0; i < 8; i++) g.add(mesh(box(0.64, 8, 0.64, -107, -9.5, -63.9 + i * 2.54), MAT.gold()));
      addB('imu', g, [0, 200, -40], 496, 9, 55); }
    { const g = grp(mesh(rbox(47, 15, 26, 1.5, -52, -8, 55), MAT.dark()), label([['FlySky', 3.4], ['FS-iA6B  2.4G', 2.4, 400]], 30, 13, '#101214', '#e8e8e8', -57, -0.42, 55), mesh(box(9, 12, 20, -31.5, -8.5, 55), MAT.dark()));
      for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) g.add(mesh(box(5, 0.64, 0.64, -26.5, -12.5 + j * 2.54, 47.4 + i * 2.54), MAT.gold()));
      g.add(tube([[-75, -5, 61], [-95, -2, 68], [-120, 8, 84], [-150, 13, 92]], 0.6, 0x1a1a1a), tube([[-75, -5, 49], [-100, -3, 44], [-128, 2, 60], [-150, 9, 30]], 0.6, 0x1a1a1a));
      g.add(mesh(cylX(1.1, 28, -160, 13, 92, 8), MAT.tin()), mesh(cylZ(1.1, 28, -150, 9.5, 20, 8), MAT.tin()));
      addB('rx', g, [0, 170, 40], 404, 22, -55); }
    addB('ubec', grp(mesh(rbox(36, 9, 17, 2, -95, -13, 58), MAT.shrink(0x1a1c1f)), mesh(cylY(5, 6, -101, -9, 58, 20), MAT.dark()), label([['5V 3A UBEC', 2.4]], 17, 6, '#e3e5e8', '#111', -88, -8.4, 58)), [0, 60, 60], 488, 25, -58);
    // the lift-fan controller stays in the nose; the other three and the power board lie beside the battery
    { const e = esc(); e.rotation.y = Math.PI; e.position.set(360, -10, 0); add('escF', e, [0, 90, 0]); }
    for (const [id, z] of [['escM', 43], ['escR', 65], ['escL', -43]]) {
      const e = esc(); e.rotation.y = Math.PI; e.position.set(D.escBay.x, D.escBay.y, z); add(id, e, [0, 90, Math.sign(z) * 60]);
    }
    add('pdb', grp(mesh(rbox(30, 5, 24, 1.5, D.escBay.x, D.escBay.y, -65), MAT.pcbK()), mesh(rbox(16, 8.2, 16, 1.5, D.escBay.x + 20, D.escBay.y + 2, -65), MAT.yellow())), [0, 90, -60]);
    // wiring loom
    { const h = grp(), R = 0xc81e1e, K2 = 0x101010, sx = D.sparX, RZ = D.rollZ, bx = -52, BX = D.battery.xDefault + 52;
      const sh = pts => pts.map(p => p[0] > -141 ? [p[0] + BX, p[1], p[2]] : p), tube0 = tube; { }
      const pw = (pts) => { h.add(tube0(pts, 1.9, R, [0, 1.6, 2.2]), tube0(pts, 1.9, K2, [0, -1.6, -2.2])); };
      h.add(mesh(rbox(16, 8.2, 16, 1.5, bx + 14 + BX, -8, 33), MAT.yellow()));                                                       // mate of the battery plug, beside the battery
      const three = (pts, axis) => [-2.4, 0, 2.4].forEach(o => h.add(tube0(pts, 1.15, K2, axis === 'z' ? [0, 0, o] : axis === 'x' ? [o, 0, 0] : [0, o, 0])));
      const duct = sd => [[88, -20, sd * 72], [95, -31, sd * 78], [286, -31, sd * 78], [286, -31, sd * 26], [326, -31, sd * 26]];   // bay -> past the lift fan -> under the nose-bay floor
      pw([[bx + 22 + BX, -8, 33], [70, -16, 60], ...duct(1), [332, -18, 20]]);                                                          // battery power to the four speed controllers
      three([[334, -18, 0], [300, -30, 0], [244, -19, -4], [224, -12, -8]], 'y');                                                     // lift-fan motor
      three([[332, -18, -16], ...duct(-1).reverse(), [-20, -22, -78], [-134, -14, -70], [-150, 10, -50], [-166, 24, -30], [-200, 14, -14], [-214, 8, -10]], 'y');   // main fan motor
      for (const sd of [-1, 1]) three([[332, -18, sd * 22], ...duct(sd).reverse(), [-60, -22, sd * 80], [sx + 10, -17.6, sd * 84], [sx, -17.6, sd * 112], [sx, -17.6, sd * (RZ - 30)], [sx - 6, -22, sd * (RZ - 12)], [D.rollX + 8, -29, sd * (RZ - 5)]], 'x');   // roll motors: along the spar
      const lead = (pts) => [0x7a3b12, R, 0xf08a1c].forEach((c, i) => h.add(tube0(pts, 0.55, c, [0, (i - 1) * 1.15, 0])));
      for (const sd of [-1, 1]) {
        lead([[-204, -8, sd * 74], [-190, -14, sd * 74], [-140, -14, sd * 72], ...duct(sd), [334, -8, sd * 8]]);                    // nozzle servos
        lead([[-383, -22, sd * 96], [-340, -14, sd * 92], [-262, -13, sd * 88], [-190, -16, sd * 80], [-140, -17, sd * 76], ...duct(sd), [336, -8, sd * 12]]);   // tail servos
      }
      add('harness', h, [0, 250, 0]); }
  }
  // --- retractable legs. Each leg hangs in a carrier at its hinge, so state.gear can swing it; geometry is drawn about the hinge.
  const gear = [];
  { const g = D.gear, m = MAT.petg('x'), L = (len, lean) => {        // blade in the X-Y plane, hinge at the origin
      const bl = grp(mesh(box(17, len - 12, 6, lean * 0.5, -(len - 12) / 2 - 6, 0), m), mesh(cylZ(9, 6, 0, 0, 0, 16), m),
        mesh(box(22, 9, 20, lean, -len + 4.5, 0), m), mesh(box(10, 9, 3.2, 0, -23.5, 4.6), m));
      return bl; };
    const nose = carrier(V(g.noseX, g.noseY, 0), [0, -260, 0]);
    add('gearNose', L(g.noseY - D.groundY, 0), [0, 0, 0], nose); gear.push({ carrier: nose, axis: 'z', sign: -1, deg: g.retractDeg });
    for (const [id, i, sd] of [['gearMainR', 0, 1], ['gearMainL', 1, -1]]) {
      const y = g.mainY[i], len = Math.hypot(y - D.groundY, g.footZ - g.mainZ), splay = Math.atan2(g.footZ - g.mainZ, y - D.groundY);
      const c = carrier(V(g.mainX[i], y, sd * g.mainZ), [0, -260, 0]);
      const leg = L(len, 0); leg.rotation.y = Math.PI / 2; leg.rotation.z = 0;
      const holder = grp(leg); holder.rotation.x = -sd * splay;
      add(id, holder, [0, 0, 0], c); gear.push({ carrier: c, axis: 'x', sign: sd, deg: g.retractDeg + splay * 180 / Math.PI });
    }
    for (const [id, i, sd] of [['gearBktR', 0, 1], ['gearBktL', 1, -1]]) {
      const x = g.mainX[i], y = g.mainY[i];
      add(id, grp(mesh(box(8, 4, 20, x - 8, y, sd * 86), m), mesh(box(8, Math.abs(y) - 8, 6, x - 8, (y - 6) / 2, sd * 88), m), clip(x - 8, sd * LZ, 8, m)), [0, -150, 0]);
    }
    add('gearMountN', mesh(box(22, 10, 36, g.noseX, g.noseY + 4, 0), m), [0, -150, 0]);
    for (const [id, x, sd] of [['gearServoN', 398, 0], ['gearServoR', -67, 1], ['gearServoL', -105, -1]]) {
      const sv = servo(false); sv.rotation.z = Math.PI / 2; sv.position.set(x, sd === 0 ? -8 : -11, sd * 58);
      add(id, grp(sv), [0, -120, sd * 40]);
    }
  }
  // --- raceway covers, flush in the belly
  { const wc = D.wireCh, m = MAT.lw('x');
    for (const [id, x0, x1, sd] of [['coverRF', 120, wc.x1, 1], ['coverRA', wc.x0, 120, 1], ['coverLF', 120, wc.x1, -1], ['coverLA', wc.x0, 120, -1]])
      add(id, mesh(box(x1 - x0, 4, wc.z1 - wc.z0, (x0 + x1) / 2, -42, sd * (wc.z0 + wc.z1) / 2), m), [0, -120, sd * 40]);
  }

  const shells = ['nose', 'noseCone', 'canopy', 'fanbay', 'tray', 'hatch', 'aftBridge', 'boomL', 'boomR', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'stabL', 'stabR', 'finL', 'finR', 'coverRF', 'coverRA', 'coverLF', 'coverLA'];
  return { root, parts, movers, props, fans, joints: { nozzle, stabs, battG, gear }, shells };   // stabs = [right, left]
}
