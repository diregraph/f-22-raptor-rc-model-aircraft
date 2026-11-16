// Can the three joint gearmotors hold and move the swivel nozzle? node tools/nozzle-loads.mjs
// Prints the torque each motor needs, checks the simulated transition against the motor budget, and checks that the
// rates the controller asks for are inside what the motors can turn under load. Model: site/js/nozzle-loads.js.
import { LOADS, FRICTION, MOTORS, motorTorque, worstMotor, thrustEnvelope, jointLoads, jointSpeed, kgcm } from '../site/js/nozzle-loads.js';
import { NOZZLE, solve, yawLimit } from '../site/js/nozzle.js';
import { createSim, AERO } from '../site/js/sim.js';
import { hoverTrim, massProps } from '../site/js/spec.js';

let ok = true; const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };
const motor = MOTORS.n20_100, budget = motor.stall * motor.budget;

console.log('Loads at 90 deg, full thrust (958 g): joint torques a/b/c (N m) and bearing axial / radial / tilting (N, N, N m)');
const L90 = jointLoads(90, 0, LOADS.thrustMax);
console.log('  ', L90.Q.map(v => v.toFixed(3)).join(' / '), ' |  ', L90.bearings.map(b => `${b.Fa.toFixed(1)}/${b.Fr.toFixed(1)}/${b.Mt.toFixed(2)}`).join('   '));

console.log(`\nTorque at the worst motor's gearbox shaft, kg cm (worst of yaw left / centre / right). ${motor.label} stalls at ${motor.stall}; budget ${budget.toFixed(2)}`);
const DS = [0, 15, 30, 45, 60, 75, 90, 100];
console.log('deflection      ' + DS.map(d => String(d).padStart(6)).join(''));
for (const [T, tl] of [[LOADS.thrustMax, 'full'], [Math.round(hoverTrim(massProps()).M), 'hover']]) for (const [fk, f] of Object.entries(FRICTION))
  console.log(`${tl.padEnd(5)} ${fk.padEnd(6)}    ` + DS.map(d => kgcm(worstMotor(d, T, f)).toFixed(2).padStart(6)).join(''));

// the simulated transition (same script as tools/sim-test.mjs): what the motors would have had to hold
const sim = createSim(), s = sim.s, DT = 1 / 400, g = 9.81e-3;
const script = (t, s) => ({ thr: t < 3 ? 0.9 : 0.5, tilt: t < 8 ? 90 : t < 14 ? 90 - (t - 8) * 15 : t < 26 ? 0 : Math.min(90, (t - 26) * 15), pitch: t > 31 && s.v[0] * Math.cos(s.att.heading) - s.v[2] * Math.sin(s.att.heading) > 1.5 ? 0.6 : 0 });
const peak = {}; for (const k of Object.keys(FRICTION)) peak[k] = { v: 0, at: null };
for (let t = 0; t < 60; t += DT) {
  sim.step(DT, { thr: 0.5, roll: 0, pitch: 0, yaw: 0, tilt: 90, altHold: true, armed: true, ...script(t, s) });
  if (Math.abs(t % 0.05) >= DT) continue;
  for (const [k, f] of Object.entries(FRICTION)) {
    const m = kgcm(Math.max(...motorTorque(Math.min(s.tilt, 100), s.nozzle, s.T[1] / g, f).m));
    if (m > peak[k].v) peak[k] = { v: m, at: `t ${t.toFixed(1)} s, ${s.tilt.toFixed(0)} deg, ${(s.T[1] / g).toFixed(0)} g` };
  }
}
console.log('\nSimulated transition and back (60 s):');
for (const [k, p] of Object.entries(peak)) console.log(`  ${FRICTION[k].label.padEnd(26)} peak ${p.v.toFixed(2)} kg cm at ${p.at}`);
check(`with plain printed bearings the motors hold the whole simulated transition inside ${Math.round(motor.budget * 100)}% of stall`, peak.plain.v <= budget);
check('with the PTFE seal washers there is at least 40% margin on that budget', peak.ptfe.v <= 0.6 * budget);

const env = thrustEnvelope(motor, FRICTION.plain, 5);
check('full main-fan thrust can be held at every deflection, even without PTFE: the fan needs no cap', env.every(([, t]) => t >= LOADS.thrustMax));
const trim = hoverTrim(massProps());
console.log(`hover trim: ${trim.M.toFixed(0)} g of main fan at 90 deg`);

// Speed: the controller slews deflection at AERO.tiltRate and yaw swing at AERO.nozzleRate. Each joint must keep up while
// holding its full-thrust load.
console.log(`\nJoint speed needed (deflection ${AERO.tiltRate} deg/s plus yaw ${AERO.nozzleRate} deg/s) against what each motor turns at full-thrust load, deg/s:`);
const need = [0, 0, 0], have = [1e9, 1e9, 1e9], h = 0.5;
for (let d = 0; d <= NOZZLE.maxDeflection - h; d += 1) for (const ys of [-1, 0, 1]) {
  const y = ys * yawLimit(d) * 0.95, j0 = solve(d, y), jd = solve(d + h, y), jy = solve(d, y + h * (ys > 0 ? -1 : 1));
  const q0 = [j0.a, j0.b, j0.c], qd = [jd.a, jd.b, jd.c], qy = [jy.a, jy.b, jy.c], tau = motorTorque(d, y, LOADS.thrustMax, FRICTION.ptfe).m;
  for (let i = 0; i < 3; i++) {
    need[i] = Math.max(need[i], Math.abs(qd[i] - q0[i]) / h * AERO.tiltRate + Math.abs(qy[i] - q0[i]) / h * AERO.nozzleRate);
    have[i] = Math.min(have[i], jointSpeed(motor, i, tau[i]));
  }
}
need.forEach((n, i) => console.log(`  joint ${i + 1}: needs ${n.toFixed(0)}, has ${have[i].toFixed(0)} (no load ${jointSpeed(motor, i).toFixed(0)})`));
check('every joint keeps up with the controller\'s slew rates under full load', need.every((n, i) => n <= have[i]));
process.exit(ok ? 0 : 1);
