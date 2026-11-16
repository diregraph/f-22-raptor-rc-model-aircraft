// Export the twin's single source of truth to JSON for the Python analysis scripts.
// Run: node tools/export-parts.mjs   (writes analysis/parts.json)
import { writeFileSync } from 'node:fs';
import { D, PARTS, THRUSTERS, massProps } from '../site/js/spec.js';

const mp = massProps();
const out = {
  D, parts: PARTS.map(p => ({ id: p.id, name: p.name, group: p.group, material: p.material, process: p.process, mass: p.mass, cg: p.cg })),
  thrusters: THRUSTERS.map(t => ({ id: t.id, pos: t.pos, maxG: t.maxG })),
  mass: mp.mass, cg: mp.cg,
};
writeFileSync(new URL('../analysis/parts.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`parts.json: ${out.parts.length} parts, ${Math.round(out.mass)} g, cg ${out.cg.map(v => v.toFixed(1)).join(', ')}`);
