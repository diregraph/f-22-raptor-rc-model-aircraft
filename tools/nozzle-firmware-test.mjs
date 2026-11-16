// Checks both flight-controller ports of the nozzle code against the reference maths in site/js/nozzle.js and
// site/js/nozzle-loads.js: node tools/nozzle-firmware-test.mjs
//   C++ (Nozzle3BSM.h, for the ESP32): needs g++ or clang++.   Lua (nozzle_3bsm.lua, for ArduPilot): needs python3 with lupa.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { solve, servoAngles, jointCentres } from '../site/js/nozzle.js';
import { thrustEnvelope, LOADS } from '../site/js/nozzle-loads.js';
const dir = new URL('../firmware/nozzle/', import.meta.url).pathname, bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nz-')), 'host');
const cxx = ['g++', 'clang++'].find(c => { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });
let ok = true, ran = 0; const check = (label, pass) => { ok = ok && pass; console.log((pass ? 'PASS ' : 'FAIL ') + label); };
const env = thrustEnvelope();
function verify(name, R) {
  console.log(`-- ${name}`); ran++;
  const C = jointCentres();
  check('pulley centres match nozzle.js', Math.abs(R.centres[0] - C.band) < 0.01 && Math.abs(R.centres[1] - C.ring) < 0.01);
  let worst = 0;
  for (const [d, y, a, b, s1, s2] of R.poses) {
    const j = solve(d, y), s = servoAngles(j, C);
    worst = Math.max(worst, Math.abs(a - j.a), Math.abs(b - j.b), Math.abs(s1 - s.s1), Math.abs(s2 - s.s2));
  }
  check(`joint and servo angles match nozzle.js over ${R.poses.length} poses (worst ${worst.toFixed(4)} deg)`, worst < 0.02);
  if (R.caps) check('thrust cap table matches the load model', R.caps.every((c, i) => Math.abs(c - Math.min(1, env.find(([d]) => d === i * 10)[1] / LOADS.thrustMax)) < 0.002));

  const at = t => R.run.reduce((p, r) => Math.abs(r[0] - t) < Math.abs(p[0] - t) ? r : p);
  check('power-up: leaves the stringing pose (45 deg) slowly, 30 deg/s', Math.abs(at(0.5)[1] - 60) < 1 && Math.abs(at(2.9)[1] - 90) < 0.5);
  check('hover guard: at 2 m/s the nozzle stays at 35 deg when the pilot asks for 0', Math.abs(at(3.9)[1] - 35) < 0.5 && at(3.9)[6] === 1);
  check('deflection then follows at the flight rate, 150 deg/s', at(3.2)[1] > 50 && at(3.2)[1] < 65);
  check('hover guard lets go by 17 m/s', at(7.9)[1] < 0.5);
  check('yaw is clipped to the limit (20 deg)', Math.abs(at(8.9)[2] - 20) < 0.01);
  check('radio lost: yaw goes back to centre, deflection held', Math.abs(at(9.8)[2]) < 0.01 && at(9.8)[1] < 0.5);
  check('servo pulses stay within 500-2500 us', R.run.every(r => r[3] >= 500 && r[3] <= 2500 && r[4] >= 500 && r[4] <= 2500));
}
if (cxx) {
  execFileSync(cxx, ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-o', bin, path.join(dir, 'host_test.cpp')], { stdio: 'inherit' });
  verify('C++ (ESP32 / madflight)', JSON.parse(execFileSync(bin, { encoding: 'utf8' })));
} else console.log('SKIP C++: no compiler');
let lua = null; try { lua = execFileSync('python3', [new URL('nozzle_lua_run.py', import.meta.url).pathname], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
if (lua) verify('Lua (ArduPilot script)', JSON.parse(lua)); else console.log('SKIP Lua: pip install lupa to check it');
check('at least one port was checked', ran > 0);
process.exit(ok ? 0 : 1);
