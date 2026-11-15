// The four cords that run from the two servo drums in the body to the nozzle, drawn in the nozzle frame
// (x aft, y up, z right, origin on bearing 1). Each servo has a pair: one cord goes over the top of its pulley, one under.
import * as THREE from 'three';
import { NOZZLE, pulleys, servoAngles, jointCentres } from './nozzle.js';
const rad = d => d * Math.PI / 180, N = 36;
class Poly extends THREE.Curve {   // a cord is a chain of straight pieces
  constructor(p) { super(); this.p = p; }
  getPoint(t, o = new THREE.Vector3()) { const n = this.p.length - 1, f = Math.min(t * n, n - 1e-6), i = Math.floor(f); return o.lerpVectors(this.p[i], this.p[i + 1], f - i); }
}

export function makeDrive(parent, G, { drumMesh, servoMesh, color = 0xffd24a }) {
  const D = G.drive, c = NOZZLE.cord, C = jointCentres(), group = new THREE.Group(); parent.add(group);
  // servo 1 sits on the aircraft's right (nozzle frame -z) and turns the bearing-1 collar; servo 2 on the left turns the drive ring
  const runs = [{ z: -D.drumZ, x: D.bandX, r: c.band1, key: 'band', servo: 's1' }, { z: D.drumZ, x: D.ringX, r: c.ring, key: 'ring', servo: 's2' }];
  const lines = [], drums = [], servos = [];
  for (const run of runs) {
    const side = Math.sign(run.z);
    const holder = new THREE.Group(); holder.position.set(D.drumX, D.drumY, run.z); holder.rotation.y = -side * Math.PI / 2; group.add(holder);
    const i = runs.indexOf(run), spin = new THREE.Group(), seat = new THREE.Group(); seat.position.x = -D.drumT / 2; spin.add(seat); holder.add(spin);
    seat.add(drumMesh(i, side)); drums.push({ spin, run, holder });
    const mount = new THREE.Group(); mount.position.set(D.bodyX, D.drumY, side * D.bodyZ); group.add(mount); mount.add(servoMesh(i, side)); servos.push(mount);
    for (const sg of [1, -1]) {
      const l = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.35 }));
      l.frustumCulled = false; l.userData.noPick = true; group.add(l); lines.push({ run, sg, l, dir: -sg * side });
    }
  }
  function update(j) {
    const p = pulleys(j), s = servoAngles(j, C);
    drums.forEach(d => { d.spin.rotation.x = rad(s[d.run.servo]); });
    for (const { run, sg, l, dir } of lines) {
      const yF = D.drumY + sg * c.drum, phiF = Math.atan2(run.z, yF), dist = Math.hypot(run.z, yF);
      const tT = phiF + dir * Math.acos(run.r / dist);                                    // where the cord meets the pulley
      const wrap = rad(C[run.key + 'Range'] / 2 + 25 + dir * (p[run.key] - C[run.key]));  // it is knotted to the pulley, so the wrap grows and shrinks as the pulley turns
      const pts = [new THREE.Vector3(D.drumX, yF, run.z)];
      for (let k = 1; k <= 6; k++) pts.push(new THREE.Vector3(D.drumX + (D.fairX - D.drumX) * k / 6, yF, run.z));
      for (let k = 0; k <= N; k++) { const t = tT + dir * wrap * k / N; pts.push(new THREE.Vector3(run.x, run.r * Math.cos(t), run.r * Math.sin(t))); }
      l.geometry.dispose(); l.geometry = new THREE.TubeGeometry(new Poly(pts), pts.length * 3, 0.7, 5);   // drawn 1.4 mm thick so it can be seen; the real cord is about 0.5 mm
    }
    return { p, s };
  }
  return { group, update, lines: lines.map(l => l.l) };
}
