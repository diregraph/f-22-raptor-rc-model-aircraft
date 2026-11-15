// Headless check of the swivel-nozzle maths: node tools/nozzle-test.mjs
import { NOZZLE, solve, exitDirection, servoAngles, jointCentres } from '../site/js/nozzle.js';
const deg = r => r * 180 / Math.PI; let ok = true;
const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };
console.log('deflection  joint1  joint2=3   exit direction (x aft, y up, z right)   servo 1 / 2 / 3');
let worst = 0, worstServo = 0;
for (let d = 0; d <= NOZZLE.maxDeflection; d += 10) {
  const j = solve(d, 0), e = exitDirection(j.a, j.b, j.c), s = servoAngles(j);
  const got = deg(Math.acos(e[0])), side = Math.abs(e[2]);
  worst = Math.max(worst, Math.abs(got - d), side * 57.3); worstServo = Math.max(worstServo, Math.abs(s.s1), Math.abs(s.s2), Math.abs(s.s3));
  console.log(`${String(d).padStart(6)}   ${j.a.toFixed(1).padStart(7)} ${j.b.toFixed(1).padStart(8)}     ${e.map(v => v.toFixed(3).padStart(7)).join(' ')}        ${[s.s1, s.s2, s.s3].map(v => v.toFixed(0).padStart(5)).join(' ')}`);
}
check('deflection matches the command and stays in the vertical plane (error < 0.1 deg)', worst < 0.1);
const jy = solve(90, 15), ey = exitDirection(jy.a, jy.b, jy.c);
check('at 90 deg, 15 deg of yaw swings the jet 15 deg sideways', Math.abs(deg(Math.atan2(ey[2], -ey[1])) - 15) < 0.2 && Math.abs(ey[0]) < 0.01);
for (const y of [-NOZZLE.maxYaw, NOZZLE.maxYaw]) for (const d of [0.02, NOZZLE.maxDeflection]) { const s = servoAngles(solve(d, y)); worstServo = Math.max(worstServo, Math.abs(s.s1)); }
const c = jointCentres();
console.log(`joint 1 working range ${c.aRange.toFixed(0)} deg, joints 2 and 3 ${c.bRange.toFixed(0)} deg; largest servo swing +/-${worstServo.toFixed(0)} deg of +/-${NOZZLE.servoTravel / 2}`);
check('every servo stays inside its travel', worstServo <= NOZZLE.servoTravel / 2);
process.exit(ok ? 0 : 1);
