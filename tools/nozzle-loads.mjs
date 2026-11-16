// Can the two cord servos hold the swivel nozzle? node tools/nozzle-loads.mjs
// Prints the torque each servo needs, checks the simulated transition against the servo budget, and writes the
// thrust-limit table the firmware uses (firmware/nozzle/NozzleLimits.h). Model: site/js/nozzle-loads.js.
import fs from 'fs';
import { LOADS, FRICTION, SERVOS, servoTorque, worstServo, thrustEnvelope, jointLoads, kgcm } from '../site/js/nozzle-loads.js';
import { createSim } from '../site/js/sim.js';

let ok = true; const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };
const servo = SERVOS.mg90s_6v, budget = servo.stall * servo.budget;

console.log('Loads at 90 deg, full thrust (958 g): joint torques a/b/c (N m) and bearing axial / radial / tilting (N, N, N m)');
const L90 = jointLoads(90, 0, LOADS.thrustMax);
console.log('  ', L90.Q.map(v => v.toFixed(3)).join(' / '), ' |  ', L90.bearings.map(b => `${b.Fa.toFixed(1)}/${b.Fr.toFixed(1)}/${b.Mt.toFixed(2)}`).join('   '));

console.log('\nServo torque needed, kg cm (worst of yaw left / centre / right). MG90S stalls at 2.2 on 6 V; budget', budget.toFixed(2));
console.log('deflection      ' + [0, 15, 30, 45, 60, 75, 90, 100].map(d => String(d).padStart(6)).join(''));
for (const [T, tl] of [[LOADS.thrustMax, 'full'], [228, 'hover']]) for (const [fk, f] of Object.entries(FRICTION))
  console.log(`${tl.padEnd(5)} ${fk.padEnd(6)}    ` + [0, 15, 30, 45, 60, 75, 90, 100].map(d => kgcm(worstServo(d, T, f)).toFixed(2).padStart(6)).join(''));

// the simulated transition (same script as tools/sim-test.mjs): what the servos would have had to hold
const sim = createSim(), s = sim.s, DT = 1 / 400, g = 9.81e-3;
const script = (t, s) => ({ thr: t < 3 ? 0.9 : 0.5, tilt: t < 8 ? 90 : t < 14 ? 90 - (t - 8) * 15 : t < 26 ? 0 : Math.min(90, (t - 26) * 15), pitch: t > 31 && s.v[0] * Math.cos(s.att.heading) - s.v[2] * Math.sin(s.att.heading) > 1.5 ? 0.6 : 0 });
const peak = {}; for (const k of Object.keys(FRICTION)) peak[k] = { v: 0, over: 0, at: null };
let n = 0;
for (let t = 0; t < 60; t += DT) {
  sim.step(DT, { thr: 0.5, roll: 0, pitch: 0, yaw: 0, tilt: 90, altHold: true, armed: true, ...script(t, s) });
  if (Math.abs(t % 0.05) >= DT) continue; n++;
  for (const [k, f] of Object.entries(FRICTION)) {
    const r = servoTorque(Math.min(s.tilt, 100), s.nozzle, s.T[1] / g, f), m = kgcm(Math.max(r.s1, r.s2));
    if (m > peak[k].v) peak[k] = { ...peak[k], v: m, at: `t ${t.toFixed(1)} s, ${s.tilt.toFixed(0)} deg, ${(s.T[1] / g).toFixed(0)} g` };
    if (m > budget) peak[k].over++;
  }
}
console.log('\nSimulated transition and back (60 s):');
for (const [k, p] of Object.entries(peak)) console.log(`  ${FRICTION[k].label.padEnd(48)} peak ${p.v.toFixed(2)} kg cm at ${p.at}; over budget ${(100 * p.over / n).toFixed(0)}% of the time`);
check('as first drawn (plain PETG bearings), the servos are overloaded in the simulated transition', peak.plain.over > 0);
check('with PTFE seal washers and liners and the controller\'s thrust cap, MG90S on 6 V holds the whole simulated transition inside 70% of stall', peak.ptfe.v <= budget);

const env = thrustEnvelope(servo, FRICTION.ptfe, 5);
console.log('\nThrust the nozzle can hold (g), MG90S on 6 V, PTFE:', env.filter(([d]) => d % 15 === 0 || d === 100).map(([d, t]) => `${d}:${t}`).join('  '));
check('hover trim (228 g at 90 deg) is inside the envelope', env.find(([d]) => d === 90)[1] >= 228);
const caps = env.map(([, t]) => Math.min(1, t / LOADS.thrustMax));
const hdr = `// Written by tools/nozzle-loads.mjs from site/js/nozzle-loads.js. Do not edit by hand: change the model and rerun.
// Largest main-fan thrust the cord servos (${servo.label}, ${Math.round(servo.budget * 100)}% of stall) can hold, as a fraction of
// full thrust (${LOADS.thrustMax} g), every ${env[1][0]} degrees of deflection from 0 to ${env[env.length - 1][0]}. Bearings with PTFE washers.
#pragma once
namespace nozzle {
static constexpr int LIMIT_N = ${caps.length};
static constexpr float LIMIT_STEP = ${env[1][0]}.0f;
static constexpr float LIMIT_CAP[LIMIT_N] = {${caps.map(c => c.toFixed(3) + 'f').join(', ')}};
}
`;
const out = new URL('../firmware/nozzle/NozzleLimits.h', import.meta.url);
if (process.argv.includes('--write')) { fs.writeFileSync(out, hdr); console.log('wrote firmware/nozzle/NozzleLimits.h'); }
else check('firmware/nozzle/NozzleLimits.h matches the model (rerun with --write after a change)', fs.existsSync(out) && fs.readFileSync(out, 'utf8') === hdr);
process.exit(ok ? 0 : 1);
