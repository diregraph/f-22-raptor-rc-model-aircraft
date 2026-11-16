// Headless check of the swivel-nozzle maths: node tools/nozzle-test.mjs
import { NOZZLE, solve, exitDirection, travel, countsPerDeg } from '../site/js/nozzle.js';
const deg = r => r * 180 / Math.PI; let ok = true;
const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };
console.log('deflection  joint1  joint2=3   exit direction (x aft, y up, z right)');
let worst = 0;
for (let d = 0; d <= NOZZLE.maxDeflection; d += 10) {
  const j = solve(d, 0), e = exitDirection(j.a, j.b, j.c);
  const got = deg(Math.acos(e[0])), side = Math.abs(e[2]);
  worst = Math.max(worst, Math.abs(got - d), side * 57.3);
  console.log(`${String(d).padStart(6)}   ${j.a.toFixed(1).padStart(7)} ${j.b.toFixed(1).padStart(8)}     ${e.map(v => v.toFixed(3).padStart(7)).join(' ')}`);
}
check('deflection matches the command and stays in the vertical plane (error < 0.1 deg)', worst < 0.1);
const jy = solve(90, 15), ey = exitDirection(jy.a, jy.b, jy.c);
check('at 90 deg, 15 deg of yaw swings the jet 15 deg sideways', Math.abs(deg(Math.atan2(ey[2], -ey[1])) - 15) < 0.2 && Math.abs(ey[0]) < 0.01);
// Homing stops: each collar has two lugs, 180 degrees apart; one must reach the motor plate just past the travel, and the
// other must never reach it. The plate and lug cover about 21 degrees of the circle together (cad/propulsion.py lug_clock).
const T = travel(), g = NOZZLE.gear, BLOCK = 21;
T.forEach(([lo, hi], i) => {
  const s = g.stop[i], past = s > hi ? s - hi : lo - s, span = Math.max(hi, s) - Math.min(lo, s);
  console.log(`joint ${i + 1}: travel ${lo.toFixed(1)} to ${hi.toFixed(1)} deg, stop at ${s} deg; ${(span * g.ring[i] / g.pinion / 360).toFixed(1)} turns of the gearbox shaft, ${countsPerDeg(i).toFixed(1)} counts per degree`);
  check(`joint ${i + 1}: the homing stop is 5-10 deg past the travel, and the other lug stays clear`, past >= 5 && past <= 10 && span + BLOCK < 180);
});
process.exit(ok ? 0 : 1);
