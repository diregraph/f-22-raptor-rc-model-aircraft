// Procedural geometry for every part. Returns handles the viewer animates.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { D, PART } from './spec.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = d => d * Math.PI / 180;
const AX = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };

// ---------- materials (fresh instance per call so parts highlight independently)
const std = (o) => { const m = new THREE.MeshStandardMaterial(o); m.side = THREE.DoubleSide; return m; };
// FDM look: fine layer lines along the print axis, fading out with distance so they never shimmer
function printed(m, axis = 'y', pitch = 0.7, depth = 1) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uAxis = { value: AX[axis] }; sh.uniforms.uPitch = { value: pitch }; sh.uniforms.uDepth = { value: depth };
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
  g.add(tube([[-67, 2, 6], [-78, 3, 5], [-88, 2, 3.4]], 2.1, 0xc81e1e), tube([[-67, 2, -6], [-78, 3, -5], [-88, 2, -3.4]], 2.1, 0x101010));
  g.add(mesh(rbox(16, 8.2, 16, 1.5, -95, 2, 0), MAT.yellow()));
  [0xc81e1e, 0x101010, 0x1b59c0, 0xf0c020, 0xeeeeee].forEach((c, i) => g.add(tube([[-67, -8, 14], [-76, -9, 15], [-84, -10, 15]], 0.5, c, [0, i * 1.05 - 2, 0])));
  g.add(mesh(box(7, 6.5, 4, -87, -10, 15), MAT.white()));
  return g;
}

// ---------- assembly
export function buildModel() {
  const root = new THREE.Group();
  const parts = new Map(), movers = [];
  const add = (id, obj, ex = [0, 0, 0], parent = root) => {
    optimise(obj); obj.userData.partId = id; obj.userData.home = obj.position.clone(); obj.userData.ex = V(...ex);
    obj.traverse(o => { if (o.isMesh) o.userData.partId = id; });
    if (!PART[id]) console.warn('no spec for', id);
    parts.set(id, obj); movers.push(obj); parent.add(obj); return obj;
  };
  const carrier = (pos, ex, parent = root) => { const g = new THREE.Group(); g.position.copy(pos); g.userData.home = pos.clone(); g.userData.ex = V(...ex); movers.push(g); parent.add(g); return g; };
  const mirrorZ = o => { const g = new THREE.Group(); g.add(o); g.scale.z = -1; return g; };
  const { halfW: W, yT: T, longZ: LZ } = D;

  // --- backbone
  for (const [id, s] of [['longeronL', -1], ['longeronR', 1]]) add(id, tubeAl(650, 'x', -100, 0, s * LZ));
  add('spar', tubeAl(910, 'z', D.sparX, D.sparY, 0), [0, -70, 0]);
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
    add('nose', grp(mesh(loft(rings), MAT.lw('x')), mesh(loft(tub), MAT.dark()), mesh(box(10, 14, 16, 300, 38, 0), MAT.dark()), mesh(box(3, 20, 18, 292, 40, 0), MAT.dark())), [260, 0, 0]);
    const pm = MAT.petg('x');
    add('noseRing', grp(mesh(loft([fRing(D.xNoseJoin - 6, NW - 8, T - 6, T - 6, 0, 4.6), fRing(D.xNoseJoin + 6, NW - 8, T - 6, T - 6, 0, 4.6)]), pm),
      [-1, 1].map(s => [mesh(box(8, 5, 26, D.xNoseJoin - 9, -5, s * (NW + 4)), pm), clip(D.xNoseJoin - 9, s * LZ, 10, pm)])), [110, 0, 0]);
    const cr = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14, x = 236 + 150 * s, k = Math.sin(Math.PI * s ** 0.85);
      cr.push(fRing(x, Math.max(1, 37 * k ** 0.55), Math.max(1, 27 * k ** 0.7), 2, 24 + 9 * k ** 0.5 - 4 * s, 2.1, 32));
    }
    add('canopy', mesh(loft(cr), MAT.canopy()), [260, 150, 0]);
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
    const latch = () => { const m = MAT.petg(); return grp(mesh(box(34, 2.4, 6, -120, w.y + 13.4, w.rootZ - 1), m), mesh(box(6, 6, 8, -105, w.y + 11, w.rootZ - 2), m), mesh(box(8, 4, 8, -135, w.y + 12.6, w.rootZ + 1), m)); };
    add('latchR', latch(), [0, 70, 130]); add('latchL', mirrorZ(latch()), [0, 70, -130]);
  }
  // --- roll pods, motors, props
  const props = [];
  for (const [sfx, s, dir] of [['R', 1, -1], ['L', -1, 1]]) {
    const m = MAT.petg('z'), z = s * D.rollZ;
    add('pod' + sfx, grp(mesh(cylZ(6.6, 62, D.sparX, D.sparY, s * 429, 28), m), mesh(box(15, 14, 22, D.sparX, -1, z), m), mesh(cylY(15, 4.5, D.sparX, 7.7, z), m),
      mesh(new THREE.SphereGeometry(6.6, 24, 14).scale(1, 1, 1.5).translate(D.sparX, D.sparY, s * 460), m), mesh(cylY(2.2, 3, D.sparX, D.sparY - 6.5, s * 412, 14), m)), [0, 0, s * 520]);
    const mo = motor(); mo.position.set(D.sparX, 10, z); add('motor' + sfx, mo, [0, 80, s * 520]);
    const pr = prop(127, 3, dir); pr.position.set(D.sparX, 31, z); add('prop' + sfx, pr, [0, 170, s * 520]); props.push(pr);
  }
  // --- lift fan: spider, motor, prop
  { const m = MAT.petg(), sp = grp(), ang = Math.atan2(LZ, 50), len = 2 * Math.hypot(LZ, 50) - 6;
    for (const sgn of [-1, 1]) { const b = mesh(box(len, 7, 9), m); b.rotation.y = sgn * ang; b.position.set(D.fanX, -15.5, 0); sp.add(b); }
    sp.add(mesh(cylY(16.5, 5, D.fanX, -14.5, 0), m));
    for (const dx of [-50, 50]) for (const s of [-1, 1]) sp.add(clip(D.fanX + dx, s * LZ, 14, m), mesh(box(12, 12, 8, D.fanX + dx, -11, s * (LZ - 2)), m));
    add('fanSpider', sp, [70, -190, 0]);
    const mo = motor(); mo.position.set(D.fanX, -12, 0); add('motorF', mo, [70, -110, 0]);
    const pr = prop(152, 3, 1); pr.position.set(D.fanX, 9, 0); add('propF', pr, [70, 230, 0]); props.push(pr);
  }
  // --- vectoring mount
  const tiltG = carrier(V(D.pivotX, 0, 0), [-250, 0, 0]);
  const yawG = new THREE.Group(); tiltG.add(yawG);
  { for (const [id, s] of [['bearingL', -1], ['bearingR', 1]]) {
      const m = MAT.petg();
      add(id, grp(mesh(box(28, 24, 12, D.pivotX, 0, s * (LZ - 6)), m), clip(D.pivotX, s * LZ, 28, m), s > 0 ? mesh(cylZ(7, 6, D.pivotX, 0, LZ - 14, 24), m) : null), [-120, 0, s * 90]);
    }
    const ts = servo(true); ts.rotation.x = Math.PI / 2; ts.position.set(D.pivotX - 5.9, 0, -74.5); add('tiltServo', ts, [-120, 0, -150]);
    const ym = MAT.petg('z');
    add('yoke', grp(mesh(box(13, 13, 38, 0, 0, -35.5), ym), mesh(box(13, 13, 60, 0, 0, 44), ym), mesh(box(32, 3.2, 17, -5.5, -14.4, 0), ym), mesh(box(3.2, 30, 17, 9, 0, 0), ym),
      [-15.5, 15.5].map(z => mesh(box(13, 30, 3.2, 0, 0, z), ym)), mesh(cylZ(3.9, 14, 0, 0, 79, 20), ym), mesh(cylZ(5.2, 5, 0, 0, -53, 20), ym)), [0, 0, 0], tiltG);
    const ys = servo(true); ys.position.set(-5.9, -1.5, 0); add('yawServo', ys, [0, 90, 0], tiltG);
    const cm = MAT.petg('x');
    add('cradle', grp(mesh(box(36, 2.6, 18, -14, 21.6, 0), cm), mesh(box(36, 2.6, 18, -14, -18.6, 0), cm), mesh(cylX(15.5, 3.2, -31.4, 1.5, 0, 36), cm), mesh(box(3.2, 41, 12, -31.4, 1.5, 0), cm), mesh(cylY(2.2, 4, 0, -16, 0, 14), cm)), [-60, 0, 0], yawG);
    const mo = motor(); mo.rotation.z = Math.PI / 2; mo.position.set(-33, 1.5, 0); add('motorM', mo, [-120, 0, 0], yawG);
    const pr = prop(152, 3, -1); pr.rotation.z = Math.PI / 2; pr.position.set(-D.propOffset + 3, 1.5, 0); add('propM', pr, [-200, 0, 0], yawG); props.push(pr);
  }
  // --- tail
  const stabs = [];
  { const st = D.stab, tanS = Math.tan(rad(st.sweep));
    const mk = () => grp(mesh(loft(Array.from({ length: 4 }, (_, i) => { const u = i / 3, z = st.rootZ + (st.tipZ - st.rootZ) * u; return aRing(st.rootLE - st.pivotX - (z - st.rootZ) * tanS, st.rootC + (st.tipC - st.rootC) * u, z, 0, 0.07 + 0.01 * u); })), MAT.lw('z')),
      mesh(cylZ(1.5, 26, 0, 0, st.rootZ - 9, 12), MAT.steel()), mesh(box(3, 30, 2.4, 22, -15, st.rootZ + 1.2), MAT.petg()));
    for (const [id, s] of [['stabR', 1], ['stabL', -1]]) {
      const g = s > 0 ? mk() : mirrorZ(mk()); g.position.set(st.pivotX, 0, 0);
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
      const sv = servo(false); if (s > 0) sv.rotation.x = Math.PI; else sv.rotation.z = Math.PI; sv.position.set(-362 - s * 5.9, -16.8, s * 96);
      const rod = tube([[-362, -36, s * 111], [-370, -33, s * 111.2], [-378, -29, s * 111.2]], 0.6, 0x9a9da1);
      add(id, grp(sv, rod), [-150, -120, s * 50]);
    }
  }
  // --- electronics
  const battG = carrier(V(D.battery.xDefault, 0, 0), [0, 0, 0]);
  { add('battery', battery(), [0, 300, 0], battG);
    const pt = MAT.petg();
    add('batteryTray', grp(mesh(box(142, 2, 50, 0, -19.6, 0), pt), [-1, 1].map(s => mesh(box(142, 7, 2, 0, -16, s * 24), pt)), mesh(box(3, 9, 50, 70, -15.5, 0), pt)), [0, -90, 0], battG);
    add('fcSled', grp(mesh(box(100, 2, 36, -74, -15, -55), pt), mesh(box(100, 5, 2, -74, -13, -74), pt), mesh(box(100, 5, 2, -74, -13, -36), pt), mesh(box(8, 6, 10, -22, -12, -55), pt)), [0, 60, -40]);
    // ESP32 DevKit v1 (51.5 x 28.3): shielded module, USB, two header rows, buttons
    { const g = grp(mesh(box(51.5, 1.6, 28.3, -52, -8.5, -55), MAT.pcbK()), mesh(box(17.8, 3.1, 15.8, -38, -6.1, -55), MAT.tin()), mesh(box(6.5, 0.9, 17.6, -29.6, -7.3, -55), MAT.pcbK()),
        mesh(box(5.6, 2.6, 7.6, -75, -6.4, -55), MAT.tin()), mesh(box(3.2, 1.8, 4, -66, -6.8, -47), MAT.tin()), mesh(box(3.2, 1.8, 4, -66, -6.8, -63), MAT.tin()),
        mesh(box(5, 1.6, 5, -56, -6.9, -55), MAT.dark()), mesh(box(6, 1.8, 3.5, -64, -6.8, -55), MAT.dark()));
      for (const z of [-67.7, -42.3]) { g.add(mesh(box(38.2, 2.5, 2.5, -52, -10.5, z), MAT.dark())); for (let i = 0; i < 15; i++) g.add(mesh(box(0.64, 9.5, 0.64, -69.8 + i * 2.54, -11.5, z), MAT.gold())); }
      g.add(label([['ESP-WROOM-32', 1.9]], 15, 5, '#c9cdd1', '#222', -38.5, -4.5, -55));
      add('esp32', g, [0, 130, -40]); }
    { const g = grp(mesh(box(21, 1.6, 16, -98, -11, -55), MAT.pcbB()), mesh(box(4, 1, 4, -99, -9.7, -55), MAT.dark()), mesh(box(2.5, 2.5, 20.3, -107, -9.2, -55), MAT.dark()));
      for (let i = 0; i < 8; i++) g.add(mesh(box(0.64, 8, 0.64, -107, -9.5, -63.9 + i * 2.54), MAT.gold()));
      add('imu', g, [0, 200, -40]); }
    { const g = grp(mesh(rbox(47, 15, 26, 1.5, -52, -8, 55), MAT.dark()), label([['FlySky', 3.4], ['FS-iA6B  2.4G', 2.4, 400]], 30, 13, '#101214', '#e8e8e8', -57, -0.42, 55), mesh(box(9, 12, 20, -31.5, -8.5, 55), MAT.dark()));
      for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) g.add(mesh(box(5, 0.64, 0.64, -26.5, -12.5 + j * 2.54, 47.4 + i * 2.54), MAT.gold()));
      g.add(tube([[-75, -5, 61], [-95, -2, 68], [-120, 8, 84], [-150, 13, 92]], 0.6, 0x1a1a1a), tube([[-75, -5, 49], [-100, -3, 44], [-128, 2, 60], [-150, 9, 30]], 0.6, 0x1a1a1a));
      g.add(mesh(cylX(1.1, 28, -160, 13, 92, 8), MAT.tin()), mesh(cylZ(1.1, 28, -150, 9.5, 20, 8), MAT.tin()));
      add('rx', g, [0, 130, 40]); }
    add('ubec', grp(mesh(rbox(36, 9, 17, 2, -98, -13, 80), MAT.shrink(0x1a1c1f)), mesh(cylY(5, 6, -104, -9, 80, 20), MAT.dark()), label([['5V 3A UBEC', 2.4]], 17, 6, '#e3e5e8', '#111', -91, -8.4, 80)), [0, 60, 60]);
    for (const [id, x, s, flip] of [['escF', 2, -1, 0], ['escM', 2, 1, 1], ['escL', -140, -1, 1], ['escR', -140, 1, 1]]) {
      const e = esc(); e.rotation.y = flip ? Math.PI : 0; e.position.set(x, -14.5, s * 55); add(id, e, [0, 95, s * 40]);
    }
    // wiring loom
    { const h = grp(), R = 0xc81e1e, K = 0x101010, bus = [-121, -15, 0];
      const pw = (pts) => { h.add(tube(pts, 1.9, R, [0, 0, 2.6]), tube(pts, 1.9, K, [0, 0, -2.6])); };
      pw([[-135, 2, 0], [-128, -8, 0], bus]); h.add(mesh(rbox(16, 8.2, 16, 1.5, -139, 2, 0), MAT.yellow()));
      for (const s of [-1, 1]) { pw([bus, [-100, -17, s * 30], [-55, -17.5, s * 31], [-33, -15, s * 50], [-29, -14.5, s * 55]]); pw([bus, [-118, -17, s * 30], [-112, -15.5, s * 50], [-109, -14.5, s * 55]]); }
      const three = (pts, axis) => [-2.4, 0, 2.4].forEach(o => h.add(tube(pts, 1.15, K, axis === 'z' ? [0, 0, o] : axis === 'x' ? [o, 0, 0] : [0, o, 0])));
      three([[37, -14.5, -55], [60, -16, -58], [92, -17, -40], [118, -15, -14], [126, -11, -9]], 'z');
      three([[-37, -14.5, 55], [-80, -16, 74], [-150, -14, 80], [-225, -8, 76], [-272, -4, 62], [-292, -3, 30]], 'y');
      for (const s of [-1, 1]) three([[-175, -14.5, s * 55], [-190, -13, s * 72], [-193, -3, s * 104], [-193, -3, s * 250], [-194, -2, s * 400], [-197, 3, s * 428], [-199, 8, s * 436]], 'x');
      const lead = (pts) => [0x7a3b12, R, 0xf08a1c].forEach((c, i) => h.add(tube(pts, 0.55, c, [0, (i - 1) * 1.15, 0])));
      lead([[-308, -9, -76], [-285, -8, -84], [-200, -2, -84], [-120, -6, -80], [-78, -9, -70]]);
      lead([[-321, -11, 0], [-300, -14, -30], [-268, -8, -70], [-200, 2, -82], [-120, -3, -79], [-70, -9, -69]]);
      for (const s of [-1, 1]) lead([[-383, -7, s * 92], [-340, -3, s * 85], [-262, 3, s * 85], [-180, 3, s * 82], [-120, 0, s * 80], [-90, -2, s * 60 - 14], [-62, -6, -62 + (s > 0 ? 4 : 0)]]);
      const sig = (pts, c = 0xeeeeee) => h.add(tube(pts, 0.6, c));
      sig([[-21, -12, -55], [-24, -9, -62], [-34, -9, -68]]); sig([[-21, -12, 55], [-24, 13, 30], [-30, 14, -30], [-36, -8, -67]]);
      sig([[-163, -12, -55], [-150, -8, -68], [-76, -8, -68]]); sig([[-163, -12, 55], [-150, 14, 30], [-120, 15, -30], [-72, -8, -67]]);
      sig([[-27, -9, 55], [-25, 14, 28], [-36, 15, -28], [-44, -8, -43]], 0xf0c020);
      sig([[-114, -13, 80], [-118, -15, 40], [-120, -15, 6]], R); sig([[-80, -13, 80], [-70, 14, 40], [-64, 15, -20], [-60, -8, -43]], R);
      sig([[-107, -8, -57], [-96, -5, -50], [-70, -7, -43]], 0x2e9e4f);
      add('harness', h, [0, 250, 0]); }
  }
  // --- skids: sprung bows clipped to both longerons
  for (const [id, x] of [['skidF', 10], ['skidR', -150]]) {
    const m = MAT.petg('x'), g = grp(), gy = D.groundY;
    for (const s of [-1, 1]) {
      const z = s * (W + 5), sh = new THREE.Shape();
      sh.moveTo(-5, 6); sh.lineTo(5, 6); sh.lineTo(5, -T); sh.quadraticCurveTo(6, gy + 22, 22, gy + 4); sh.lineTo(40, gy + 4); sh.lineTo(40, gy); sh.lineTo(-40, gy); sh.lineTo(-40, gy + 4); sh.lineTo(-22, gy + 4); sh.quadraticCurveTo(-6, gy + 22, -5, -T); sh.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false, curveSegments: 12 }).translate(x, 0, z - 2.5), m));
      g.add(mesh(box(12, 4, 20, x, 5, s * (W - 5)), m), mesh(box(12, 4, 8, x, -7.2, s * LZ), m));
    }
    g.add(mesh(box(8, 3.2, 2 * W + 12, x, -T - 2.4, 0), m));
    add(id, g, [0, -260, 0]);
  }

  const shells = ['nose', 'canopy', 'fanbay', 'tray', 'hatch', 'aftBridge', 'boomL', 'boomR', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'stabL', 'stabR', 'finL', 'finR'];
  return { root, parts, movers, props, joints: { tiltG, yawG, stabs, battG }, shells };
}
