// Checks both halves of the nozzle firmware: node tools/nozzle-firmware-test.mjs
//   Nozzle board (Nozzle3BSM.h, C++ for the RP2040): against site/js/nozzle.js, then a simulated bench run with homing.
//     Needs g++ or clang++.
//   Flight controller (nozzle_3bsm.lua, ArduPilot script): hover guard, slew rates, radio loss and the pulses it sends.
//     Needs python3 with lupa.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { solve, countsPerDeg } from '../site/js/nozzle.js';
const dir = new URL('../firmware/nozzle/', import.meta.url).pathname, bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nz-')), 'host');
const cxx = ['g++', 'clang++'].find(c => { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });
let ok = true; const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };

if (cxx) {
  console.log('-- nozzle board (C++)');
  execFileSync(cxx, ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-o', bin, path.join(dir, 'host_test.cpp')], { stdio: 'inherit' });
  const R = JSON.parse(execFileSync(bin, { encoding: 'utf8' }));
  check('encoder counts per joint degree match nozzle.js', R.cpd.every((c, i) => Math.abs(c - countsPerDeg(i)) < 1e-3));
  let worst = 0;
  for (const [d, y, a, b, c] of R.poses) { const j = solve(d, y); worst = Math.max(worst, Math.abs(a - j.a), Math.abs(b - j.b), Math.abs(c - j.c)); }
  check(`joint angles match nozzle.js over ${R.poses.length} poses (worst ${worst.toFixed(4)} deg)`, worst < 0.02);
  // run rows: t, state, signal, deflection, yaw, then per joint: true angle, believed angle, target, duty
  const J = (r, i) => ({ q: r[5 + 4 * i], est: r[6 + 4 * i], tgt: r[7 + 4 * i], duty: r[8 + 4 * i] }), run = R.run;
  const at = t => run.reduce((p, r) => Math.abs(r[0] - t) < Math.abs(p[0] - t) ? r : p);
  const homedAt = run.find(r => r[1] >= 2)?.[0] ?? 1e9;
  console.log(`   homed after ${homedAt.toFixed(1)} s`);
  check('power-up: finds all three stops inside 8 s, and from then on knows where the joints are within 0.2 deg (one encoder count plus one loop of travel)', homedAt < 8 && run.filter(r => r[1] >= 2).every(r => [0, 1, 2].every(i => Math.abs(J(r, i).q - J(r, i).est) < 0.2)));
  check('then moves off the stops slowly, 30 deg/s per joint', Math.abs((J(at(homedAt + 1.0), 1).tgt - J(at(homedAt + 0.5), 1).tgt) - 15) < 1);
  const j90 = solve(90, 0), r9 = at(9.9);
  check('reaches the hover pose (90 deg) and holds it within 0.2 deg', [j90.a, j90.b, j90.c].every((q, i) => Math.abs(J(r9, i).q - q) < 0.2));
  const jy = solve(90, 15);
  check('follows a 15 deg yaw swing within 0.5 deg after 0.5 s', Math.abs(J(at(10.6), 0).q - jy.a) < 0.5);
  const slew = run.filter(r => r[0] > 12 && r[0] < 13.5), lag = Math.max(...slew.flatMap(r => [0, 1, 2].map(i => Math.abs(J(r, i).q - J(r, i).tgt))));
  check(`tracks the 90 to 0 deg move at 150 deg/s, loaded, within 4 deg (worst ${lag.toFixed(1)}, while the motors spin up)`, lag < 4);
  const j0 = solve(0, 0), r15 = at(14.9), r17 = run[run.length - 1];
  check('settles straight within 0.2 deg', [j0.a, j0.b, j0.c].every((q, i) => Math.abs(J(r15, i).q - q) < 0.2));
  check('signal wire off: says so, and holds the last pose', r17[2] === 0 && [0, 1, 2].every(i => Math.abs(J(r17, i).q - J(r15, i).q) < 0.2));
  check('duty never leaves -1..1', run.every(r => [0, 1, 2].every(i => Math.abs(J(r, i).duty) <= 1)));
} else { console.log('SKIP C++: no compiler'); }

let lua = null; try { lua = execFileSync('python3', [new URL('nozzle_lua_run.py', import.meta.url).pathname], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
if (lua) {
  console.log('-- flight controller (Lua)');
  const R = JSON.parse(lua), at = t => R.run.reduce((p, r) => Math.abs(r[0] - t) < Math.abs(p[0] - t) ? r : p);
  check('pulses: deflection 0..100 deg = 1000..2000 us, yaw -20..20 deg = 1000..2000 us, clipped (what the board decodes)',
    R.pulses.every(([d, y, u1, u2]) => u1 === Math.round(1000 + Math.min(Math.max(d, 0), 100) * 10) && u2 === Math.round(1500 + Math.min(Math.max(y, -20), 20) * 25)));
  check('hover guard: at 2 m/s the nozzle stays at 35 deg when the pilot asks for 0', Math.abs(at(3.9)[1] - 35) < 0.5 && at(3.9)[5] === 1);
  check('deflection follows at the flight rate, 150 deg/s', at(3.2)[1] > 50 && at(3.2)[1] < 65);
  check('hover guard lets go by 17 m/s', at(7.9)[1] < 0.5);
  check('yaw is clipped to the limit (20 deg)', Math.abs(at(8.9)[2] - 20) < 0.01);
  check('radio lost: yaw goes back to centre, deflection held', Math.abs(at(9.8)[2]) < 0.01 && at(9.8)[1] < 0.5);
} else { console.log('SKIP Lua: pip install lupa to check it'); }
check('at least one half was checked', !!(cxx || lua));
process.exit(ok ? 0 : 1);
