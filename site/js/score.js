// Live scorecard for the workbench: the same sums as analysis/as_drawn.py (weight, balance, stability margin,
// hardest-working hover fan, stall), run instantly on tweaked numbers. Hover time is a rough momentum-theory scale.
// Shape changes (wing area, where lift acts) are not knobs here: those need the CAD rebuild.
import { D, PARTS, THRUSTERS } from './spec.js';

export const TARGETS = {   // requirements v2, docs/engineering/00-requirements-and-plan.md
  mass: { label: 'Weight', unit: 'g', max: 2000 },
  margin: { label: 'Static margin', unit: '%', min: 5, max: 12 },
  hover: { label: 'Hardest-working hover fan', unit: '%', max: 60 },
  stall: { label: 'Stall speed', unit: 'm/s', max: 12 },
  time: { label: 'Hover time (rough)', unit: 'min', min: 3 },
};
export const BATTERIES = { 2200: 254, 2700: 306, 3000: 338, 3300: 370 };   // 4-cell packs: capacity mAh -> grams (analysis/design_v4.py)

const NP = -39, C_REF = 240;                         // where lift acts (mm, spec x) and mean chord: analysis/baseline_aero.json
const S_REF = 0.1584, CLMAX = 1.08 * 1.5896 / 1.12496;   // reference area m2; lattice CL max scaled to the SD7062 section (as_drawn.py)
const X_NOZ = -403.5, NOZ_EFF = 0.85;                // nozzle exit station and thrust kept through the bends, as in as_drawn.py
const G = 9.81, RHO = 1.2;
const DISC = { F: Math.PI * 0.07 ** 2, M: Math.PI * 0.04 ** 2, R: 2 * Math.PI * 0.0635 ** 2 };   // 140 mm lift fan, 80 mm main fan, two 5 in propellers
const K_POWER = 2.0;                                  // momentum power x this = electrical watts; fitted to the 464 W hover of analysis/hover.json (with_4in1)

// The defaults: every part as in spec.js, thrust caps from THRUSTERS, the 2,700 mAh pack.
export function defaults() {
  const T = Object.fromEntries(THRUSTERS.map(t => [t.id, t.maxG]));
  return { mass: {}, x: {}, battX: D.battery.xDefault, battCap: 2700, thrust: { F: T.F, M: T.M, R: T.L + T.R } };
}

// Smallest possible load on the hardest-working fan, with lift = weight and no pitching moment (each fan 5-100%).
// Same problem as the linprog in as_drawn.py: two equalities leave one free variable, so scan the lift-fan share.
export function hoverLoad(m, cg, cap) {
  const arms = [D.fanX - cg, X_NOZ - cg, D.rollX - cg];
  let best = null;
  for (let i = 0; i <= 4000; i++) {
    const a = 0.05 + 0.95 * i / 4000;
    // cap1*b + cap2*c = m - cap0*a ;  cap1*arm1*b + cap2*arm2*c = -cap0*arm0*a
    const r1 = m - cap[0] * a, r2 = -cap[0] * arms[0] * a, det = cap[1] * cap[2] * (arms[2] - arms[1]);
    if (Math.abs(det) < 1e-9) continue;
    const b = (r1 * cap[2] * arms[2] - cap[2] * r2) / det, c = (cap[1] * r2 - cap[1] * arms[1] * r1) / det;
    if (b < 0.05 - 1e-9 || c < 0.05 - 1e-9 || b > 1 || c > 1) continue;
    const w = Math.max(a, b, c); if (!best || w < best.worst) best = { worst: w, F: a, M: b, R: c };
  }
  return best;   // null: no way to hover level
}

export function score(k = defaults()) {
  let m = 0, mx = 0;
  for (const p of PARTS) {
    let g = k.mass[p.id] ?? p.mass, x = k.x[p.id] ?? p.cg[0];
    if (p.id === 'battery') { g = k.mass.battery ?? BATTERIES[k.battCap] ?? p.mass; x = k.battX; }
    if (p.id === 'batteryTray') x = k.battX;
    m += g; mx += g * x;
  }
  const cg = mx / m, margin = (cg - NP) / C_REF * 100;
  const cap = [k.thrust.F, k.thrust.M * NOZ_EFF, k.thrust.R], h = hoverLoad(m, cg, cap);
  const stall = Math.sqrt(2 * m / 1000 * G / (1.225 * S_REF * CLMAX));
  let time = null, watts = null;
  if (h) {   // ideal power T^1.5 / sqrt(2 rho A) per disc, scaled to measured-model watts, plus 6 W of electronics
    const ideal = (g, A) => Math.pow(g / 1000 * G, 1.5) / Math.sqrt(2 * RHO * A);
    watts = K_POWER * (ideal(h.F * cap[0], DISC.F) + ideal(h.M * cap[1] / NOZ_EFF, DISC.M) + 2 * ideal(h.R * cap[2] / 2, DISC.R / 2)) + 6;
    time = 0.8 * k.battCap / 1000 * 14.8 * 60 / watts;
  }
  return { mass: m, cg, margin, hover: h ? h.worst * 100 : null, hoverSplit: h, stall, time, watts };
}

// green / amber (within 10% of the limit) / red for one metric
export function grade(key, v) {
  const t = TARGETS[key]; if (v == null) return 'bad';
  const lo = t.min ?? -Infinity, hi = t.max ?? Infinity;
  if (v >= lo && v <= hi) { const room = Math.min(v - lo, hi - v), span = Number.isFinite(hi) ? Math.abs(hi) * 0.05 : Math.abs(lo) * 0.1; return room < span ? 'warn' : 'ok'; }
  return 'bad';
}
