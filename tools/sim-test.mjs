// Headless checks of the flight model: node tools/sim-test.mjs
import { createSim } from '../site/js/sim.js';
const DT = 1 / 400, deg = r => (r * 180 / Math.PI).toFixed(1);
function run(name, script, T) {
  const sim = createSim(), s = sim.s; let maxAtt = 0, minAlt = 1e9, log = [];
  for (let t = 0; t < T; t += DT) {
    const inp = { thr: 0.5, roll: 0, pitch: 0, yaw: 0, tilt: 90, altHold: true, armed: true, ...script(t, s) };
    sim.step(DT, inp);
    if (!Number.isFinite(s.p[1])) { console.log(name, 'DIVERGED at', t.toFixed(2)); return null; }
    if (t > 5) { maxAtt = Math.max(maxAtt, Math.abs(s.att.roll), Math.abs(s.att.pitch)); minAlt = Math.min(minAlt, s.p[1]); }
    if (Math.abs(t % 2) < DT) log.push(`t${t.toFixed(0)} alt ${s.p[1].toFixed(2)} v ${s.speed.toFixed(1)} roll ${deg(s.att.roll)} pitch ${deg(s.att.pitch)} hdg ${deg(s.att.heading)} tilt ${s.tilt.toFixed(0)} T ${s.T.map(x => x.toFixed(1)).join('/')}`);
  }
  console.log(`\n== ${name}\n` + log.join('\n'));
  return { s, maxAtt, minAlt, sim };
}
const results = [];
const check = (label, ok) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + label); };

let r = run('take-off and hover', t => ({ thr: t < 2.5 ? 0.8 : 0.5 }), 12);
check('hover: level within 2 deg', r.maxAtt < 2 * Math.PI / 180);
check('hover: holds height (drift < 0.15 m/s)', Math.abs(r.s.v[1]) < 0.15 && r.s.p[1] > 1.5);
check('hover: lift motors below 80% thrust', r.s.T[0] < 0.8 * r.sim.thrusters[0].max && r.s.T[1] < 0.8 * r.sim.thrusters[1].max);

r = run('roll step', t => ({ thr: t < 2.5 ? 0.8 : 0.5, roll: t > 5 && t < 7 ? 0.5 : 0 }), 12);
check('roll: recovers level', Math.abs(r.s.att.roll) < 2 * Math.PI / 180);
check('roll: moved sideways', Math.abs(r.s.p[2]) > 1);

r = run('yaw step', t => ({ thr: t < 2.5 ? 0.8 : 0.5, yaw: t > 5 && t < 7 ? 0.5 : 0 }), 12);
check('yaw: heading changed 60-200 deg, stays level', Math.abs(r.s.att.heading) > 1 && r.maxAtt < 6 * Math.PI / 180);

r = run('transition to forward flight and back', (t, s) => ({ thr: t < 3 ? 0.9 : 0.5, tilt: t < 8 ? 90 : t < 14 ? 90 - (t - 8) * 15 : t < 26 ? 0 : Math.min(90, (t - 26) * 15), pitch: t > 31 && s.v[0] * Math.cos(s.att.heading) - s.v[2] * Math.sin(s.att.heading) > 1.5 ? 0.6 : 0 }), 60);   // pilot holds the nose up to brake
check('transition: no ground strike', r.minAlt > 1);
check('transition: back to a slow hover within 34 s of tilting up', r.s.speed < 3 && r.s.tilt > 85 && r.s.T[0] > 3);
let c = run('cruise', t => ({ thr: t < 3 ? 0.9 : 0.5, tilt: t < 8 ? 90 : Math.max(0, 90 - (t - 8) * 15) }), 30);
check('cruise: wing-borne above 12 m/s with lift fans off', c.s.speed > 12 && c.s.T[0] < 0.2);
check('cruise: holds height (vertical speed < 0.5 m/s)', c.minAlt > 1 && Math.abs(c.s.v[1]) < 0.5);

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
