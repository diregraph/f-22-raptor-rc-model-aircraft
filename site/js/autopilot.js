// "Autopilot flights" section of the analysis page: flights flown by real ArduPilot (ArduPlane 4.7.2 SITL) against the
// sim.js physics, recorded by tools/sitl-run.py and scored by tools/sitl-summary.py. No chart library.
const root = document.getElementById('autopilot');
const J = async f => (await fetch('analysis/sitl/' + f)).json();
const el = h => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const MAX_N = [13.18, 9.40, 8.07, 8.07];
const C = { s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#a46ee0' };
const st = (ok, warn) => ok ? '<span class="st good"><i>✓</i>Met</span>' : warn ? '<span class="st warn"><i>!</i>Close</span>' : '<span class="st crit"><i>✕</i>Not met</span>';

// time chart: several series on one axis, phase shading (hover / transition / wing-borne), crosshair tooltip, table view
function chart({ series, yLabel, yMin, yMax, ref, phases, yFmt = v => v }) {
  const W = 640, H = 280, m = { l: 46, r: 64, t: 10, b: 34 };
  const xs = series[0].pts.map(p => p[0]), x0 = xs[0], x1 = xs[xs.length - 1];
  const all = series.flatMap(s => s.pts.map(p => p[1]));
  const y0 = yMin ?? Math.min(...all), y1 = yMax ?? Math.max(...all) * 1.05;
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const step = (a, b, n) => { const s = Math.pow(10, Math.floor(Math.log10((b - a) / n))); return [1, 2, 5, 10].find(k => (b - a) / (k * s) <= n) * s; };
  let g = '';
  if (phases) phases.forEach(p => { if (p.kind !== 'hover') g += `<rect x="${X(p.a)}" width="${X(p.b) - X(p.a)}" y="${m.t}" height="${H - m.t - m.b}" fill="${p.kind === 'wing' ? C.s1 : C.s4}" opacity=".08"/>`; });
  const ys = step(y0, y1, 5); for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${m.l - 7}" y="${Y(v) + 4}" text-anchor="end" font-size="11.5" fill="var(--mute)">${yFmt(+v.toFixed(3))}</text>`;
  const xsT = step(x0, x1, 8); for (let v = Math.ceil(x0 / xsT) * xsT; v <= x1 + 1e-9; v += xsT) g += `<text x="${X(v)}" y="${H - m.b + 15}" text-anchor="middle" font-size="11.5" fill="var(--mute)">${Math.round(v)}</text>`;
  if (ref) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(ref.v)}" y2="${Y(ref.v)}" stroke="var(--warn)" stroke-dasharray="4 4"/><text x="${W - m.r + 4}" y="${Y(ref.v) + 4}" font-size="11.5" fill="var(--warn)">${ref.label}</text>`;
  series.forEach(s => { g += `<path d="${s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(Math.min(Math.max(p[1], y0), y1)).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
  });
  g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle" font-size="12" fill="var(--mute)">time from take-off, s</text>`;
  const leg = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('') + (phases ? `<span><i style="background:${C.s4};opacity:.45;height:9px"></i>transition</span><span><i style="background:${C.s1};opacity:.45;height:9px"></i>wing-borne</span>` : '');
  const box = el(`<div class="chart"><div class="legend">${leg}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${yLabel} against time">${g}<line class="ch" y1="${m.t}" y2="${H - m.b}" stroke="var(--mute)" style="display:none"/><g class="dots"></g></svg><div class="tip"></div>
    <details><summary>Show as table</summary><div class="scroll"><table><tr><th>time, s</th>${series.map(s => `<th class="n">${s.name}</th>`).join('')}</tr>${xs.filter((_, i) => i % Math.ceil(xs.length / 40) === 0).map(x => `<tr><td>${x.toFixed(0)}</td>${series.map(s => `<td class="n">${yFmt(+s.pts.find(p => p[0] === x)[1].toFixed(2))}</td>`).join('')}</tr>`).join('')}</table></div></details></div>`);
  const svg = box.querySelector('svg'), ch = box.querySelector('.ch'), tip = box.querySelector('.tip'), dots = box.querySelector('.dots');
  svg.addEventListener('pointermove', ev => { const r = svg.getBoundingClientRect(), xv = x0 + ((ev.clientX - r.left) / r.width * W - m.l) / (W - m.l - m.r) * (x1 - x0);
    let k = 0; for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - xv) < Math.abs(xs[k] - xv)) k = i; const x = xs[k];
    ch.setAttribute('x1', X(x)); ch.setAttribute('x2', X(x)); ch.style.display = '';
    dots.innerHTML = series.map(s => `<circle cx="${X(x)}" cy="${Y(s.pts[k][1])}" r="4.5" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`).join('');
    tip.innerHTML = `<b>${x.toFixed(1)} s</b><br>` + series.map(s => `<i style="background:${s.color}"></i>${s.name}: <b>${yFmt(+s.pts[k][1].toFixed(2))}</b>`).join('<br>');
    tip.style.display = 'block'; tip.style.left = Math.min(X(x) / W * r.width + 14, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = '30px'; });
  svg.addEventListener('pointerleave', () => { ch.style.display = 'none'; tip.style.display = 'none'; dots.innerHTML = ''; });
  return box;
}

function phasesOf(P, t0) {
  const kind = r => r.tilt < 5 ? 'wing' : r.tilt < 80 ? 'trans' : 'hover', out = [];
  for (const r of P) { const k = kind(r), t = r.t - t0; if (out.length && out[out.length - 1].kind === k) out[out.length - 1].b = t; else out.push({ kind: k, a: t, b: t }); }
  return out;
}

try {
  const [sum, mis] = await Promise.all([J('summary.json'), J('mission.json')]);
  const P = mis.physics.filter((_, i) => i % 2 === 0), on = P.findIndex(r => r.T.some(t => t > 0.05)), t0 = P[on].t;
  const F = P.slice(Math.max(0, on - 5)).filter(r => r.t - t0 < 150), t = r => +(r.t - t0).toFixed(1);
  const sp = r => Math.hypot(r.v[0], r.v[2]), ph = phasesOf(F, t0);
  const h = sum.hover, g = sum.gust, w = sum['weak-roll-motor'], ms = sum.mission;
  const row = (name, target, val, ok, warn, note = '') => `<tr><td>${name}</td><td>${target}</td><td class="n">${val}</td><td>${st(ok, warn)}</td><td class="mute">${note}</td></tr>`;
  root.append(el(`<section id="ap"><h2>Autopilot flights</h2>
<p>The real autopilot, ArduPlane 4.7.2 running as software-in-the-loop, flown against this model's physics (<code>site/js/sim.js</code>). Its parameters and the two Lua scripts (motor layout and swivel nozzle) are the files that go onto the flight controller board. Press <b>Fly it</b> on the 3D model and pick a flight under <b>Watch ArduPilot fly</b> to see each one.</p>
<div class="card"><div class="scroll" style="max-height:none;overflow-x:auto"><table><tr><th>Check</th><th>Target</th><th class="n">ArduPilot in SITL</th><th></th><th>Note</th></tr>
${row('Hover: height held', '± 0.3 m', '± ' + (h.hold_height_band_m / 2).toFixed(2) + ' m', h.hold_height_band_m <= 0.6, false, '50 s position hold (QLOITER)')}
${row('Hover: position held', '1 m or less', h.hold_drift_m.toFixed(1) + ' m', h.hold_drift_m <= 1, false)}
${row('Hardest-working fan in the hover', '60% or less', h.hover_fan_load_mean_pct.toFixed(0) + '%', h.hover_fan_load_mean_pct <= 60.5, h.hover_fan_load_mean_pct <= 65, 'average over the hover; the design trim is 60%')}
${row('Full mission flown and landed', 'yes', ms.landed ? 'yes' : 'no', ms.landed, false, `${ms.forward_flight_s.toFixed(0)} s wing-borne, up to ${ms.max_airspeed_ms.toFixed(0)} m/s`)}
${row('Height lost finishing the transition', '3 m or less', (25 - ms.min_height_after_climb_m).toFixed(1) + ' m', 25 - ms.min_height_after_climb_m <= 3, false, 'the lift fans stop the moment the nozzle is fully aft')}
${row('5 m/s side gust in the hover', 'stays up', g.landed ? `drift ${g.hold_drift_m.toFixed(1)} m` : 'lost', g.landed && g.hold_drift_m < 3, false, 'turns its nose into the wind on purpose (weathervane on)')}
${row('Left roll fan at 70% thrust', 'stays up', w.landed ? `roll ≤ ${w.max_roll_deg.toFixed(0)}°, drift ${w.hold_drift_m.toFixed(1)} m` : 'lost', w.landed && w.max_roll_deg < 15, false)}
</table></div></div>
<h3 style="margin-top:22px">The mission, second by second</h3><p class="mute">Take-off to 15 m, transition, three wing-borne legs at 25 m, back-transition and a vertical landing. Shaded: transition and wing-borne flight.</p>
<div id="apCharts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:12px"></div>
<div class="note"><b>What the autopilot found that the hand-written controller hid.</b> (1) ArduPilot cuts the lift fans as soon as the nozzle is fully aft, and the wing then needs about 11° of nose-up to carry the weight, so the aircraft sinks about ${(25 - ms.min_height_after_climb_m).toFixed(0)} m before it recovers; a few degrees of wing incidence would cut that. (2) In this model the wing stalls near 13.6 m/s, above the 12 m/s target, so transitions are set to finish at 16 m/s; the wing model and the stall target need reconciling. (3) Hover yaw comes only from swinging the nozzle jet, which in 3 m/s of wind uses half its travel against the fins, so the autopilot is set to weathervane into the wind.</div>
</section>`));
  const box = root.querySelector('#apCharts'), card = (title, c) => { const d = el(`<div class="card"><h3>${title}</h3></div>`); d.append(c); box.append(d); };
  card('Height and speed', chart({ series: [{ name: 'height, m', short: 'height', color: C.s1, pts: F.map(r => [t(r), r.p[1]]) }, { name: 'ground speed, m/s', short: 'speed', color: C.s2, pts: F.map(r => [t(r), sp(r)]) }], yLabel: 'height and speed', yMin: 0, phases: ph, yFmt: v => v }));
  card('Fan load', chart({ series: ['lift fan', 'main fan', 'roll left', 'roll right'].map((n, i) => ({ name: n, color: [C.s1, C.s2, C.s3, C.s4][i], pts: F.map(r => [t(r), 100 * r.T[i] / MAX_N[i]]) })), yLabel: 'fan load', yMin: 0, yMax: 105, ref: { v: 60, label: '60% target' }, phases: ph, yFmt: v => v + '%' }));
  card('Nozzle', chart({ series: [{ name: 'deflection, ° (90 = down)', short: 'deflection', color: C.s2, pts: F.map(r => [t(r), r.tilt]) }, { name: 'side swing, °', short: 'swing', color: C.s3, pts: F.map(r => [t(r), r.nozzle]) }], yLabel: 'nozzle angle', yMin: -20, yMax: 95, phases: ph }));
  card('Attitude', chart({ series: [{ name: 'pitch, °', short: 'pitch', color: C.s1, pts: F.map(r => { const [x, y, z, w] = r.q; return [t(r), Math.asin(Math.max(-1, Math.min(1, 2 * (x * y + z * w)))) * 57.3]; }) },
    { name: 'roll, °', short: 'roll', color: C.s3, pts: F.map(r => { const [x, y, z, w] = r.q; return [t(r), Math.atan2(-2 * (y * z - x * w), 1 - 2 * (x * x + z * z)) * 57.3]; }) }], yLabel: 'attitude', yMin: -45, yMax: 45, phases: ph }));
} catch (e) {
  root.append(el(`<p class="mute">Autopilot flights not available: ${e.message}</p>`));
}
