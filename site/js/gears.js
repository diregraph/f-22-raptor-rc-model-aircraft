// The three joint gearmotors and their pinions, drawn in the nozzle (kit) frame: x aft, y up, z right, origin on bearing 1.
// Each motor sits on the part upstream of its bearing, in that bearing's own frame; its pinion turns the other way,
// ring/pinion times faster than the joint. Placement numbers come from cad/propulsion.py through kit.json (geometry.gear).
import * as THREE from 'three';
import { NOZZLE } from './nozzle.js';
const rad = d => d * Math.PI / 180;
const MATS = { box: 0xb08d57, can: 0xaab2bb, enc: 0x1f7a3a };

// mounts: one per bearing, { parent, x, tilt }: the group the motor rides on (upstream part), where the bearing sits in it
// along x, and its cant (degrees about z). opts.pinionMesh() returns the printed pinion; opts.wrap(i, group) may register it.
export function makeDrive(mounts, G, { pinionMesh, wrap = (i, g) => g }) {
  const g = G.gear, m = g.motor, len = m.box + m.can + m.enc, spins = [];
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: c === MATS.enc ? 0.1 : 0.7 });
  const motors = mounts.map(({ parent, x, tilt }, i) => {
    const frame = new THREE.Group(); frame.position.set(x, 0, 0); frame.rotation.z = rad(tilt); parent.add(frame);
    const clock = new THREE.Group(); clock.rotation.x = rad(g.clock[i]); frame.add(clock);
    const unit = new THREE.Group(), x0 = g.plate[0];
    const part = (l, xc, c) => { const b = new THREE.Mesh(new THREE.BoxGeometry(l, m.h, m.w), mat(c)); b.position.set(xc, g.cd[i], 0); b.castShadow = true; unit.add(b); };
    part(m.box, x0 - m.box / 2, MATS.box); part(m.can, x0 - m.box - m.can / 2, MATS.can); part(m.enc, x0 - len + m.enc / 2, MATS.enc);
    const spin = new THREE.Group(); spin.position.set(0, g.cd[i], 0); spin.add(pinionMesh(i)); unit.add(spin); spins.push(spin);
    clock.add(wrap(i, unit));
    return unit;
  });
  function update(j) {
    [j.a, j.b, j.c].forEach((q, i) => { spins[i].rotation.x = -rad(q) * NOZZLE.gear.ring[i] / NOZZLE.gear.pinion; });
  }
  return { motors, update };
}
