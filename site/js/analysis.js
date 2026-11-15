// Engineering analysis page: reads the JSON written by analysis/*.py and draws it. No chart library.
const J = async f => (await fetch('analysis/' + f)).json();
const [sz, fl, fans, st] = await Promise.all(['sizing.json', 'flight.json', 'fans.json', 'structure.json'].map(J));
const C = { s1: '#3987e5', s2: '#d95926', s3: '#199e70' }, pct = v => Math.round(v * 100) + '%';
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const status = (ok, warn) => ok ? '<span class="st good"><i>✓</i>Met</span>' : warn ? '<span class="st warn"><i>!</i>Close</span>' : '<span class="st crit"><i>✕</i>Not met</span>';

// ---- line chart: one y axis, crosshair + tooltip, legend, optional target band, table view
function lineChart({ series, xLabel, yLabel, band, yMin, yMax, xFmt = v => v, yFmt = v => v, mark }) {
  const W = 640, H = 300, m = { l: 48, r: 86, t: 12, b: 38 }, xs = series.reduce((a, s) => s.pts.length > a.length ? s.pts : a, []).map(p => p[0]), cid = 'c' + Math.random().toString(36).slice(2);
  const all = series.flatMap(s => s.pts.map(p => p[1])).filter(v => v != null);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = yMin ?? Math.min(...all), y1 = yMax ?? Math.max(...all);
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - (Math.min(Math.max(v, y0 - (y1 - y0)), y1 + (y1 - y0)) - y0) / (y1 - y0) * (H - m.t - m.b);
  const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), k = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st; const o = []; for (let v = Math.ceil(a / k) * k; v <= b + 1e-9; v += k) o.push(+v.toFixed(6)); return o; };
  let g = '';
  for (const v of ticks(y0, y1, 6)) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11.5" fill="var(--mute)">${yFmt(v)}</text>`;
  for (const v of ticks(x0, x1, 8)) g += `<text x="${X(v)}" y="${H - m.b + 16}" text-anchor="middle" font-size="11.5" fill="var(--mute)">${xFmt(v)}</text>`;
  if (band) g += `<rect x="${m.l}" width="${W - m.l - m.r}" y="${Y(band.hi)}" height="${Y(band.lo) - Y(band.hi)}" fill="${'#0ca30c'}" opacity=".13"/><text x="${m.l + 6}" y="${Y(band.hi) + 13}" font-size="11.5" fill="var(--mute)">${band.label}</text>`;
  if (y0 < 0 && y1 > 0) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--mute)" opacity=".6"/>`;
  if (mark) g += `<line x1="${X(mark.x)}" x2="${X(mark.x)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--mute)" stroke-dasharray="3 4"/><text x="${X(mark.x) + 5}" y="${m.t + 11}" font-size="11.5" fill="var(--mute)">${mark.label}</text>`;
  series.forEach(s => { const pts = s.pts.filter(p => p[1] != null); g += `<path clip-path="url(#${cid})" d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round"/>`;
    const e = pts.filter(p => p[1] >= y0 && p[1] <= y1 && p[0] <= x1).pop() || pts[0]; g += `<text x="${X(e[0]) + 6}" y="${Y(e[1]) + 4}" font-size="11.5" fill="var(--ink)">${s.short || s.name}</text>`; });
  g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--mute)">${xLabel}</text><text x="12" y="${(m.t + H - m.b) / 2}" transform="rotate(-90 12 ${(m.t + H - m.b) / 2})" text-anchor="middle" font-size="12" fill="var(--mute)">${yLabel}</text>`;
  const box = el(`<div class="chart"><div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${yLabel} against ${xLabel}"><clipPath id="${cid}"><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></clipPath>${g}<line class="ch" y1="${m.t}" y2="${H - m.b}" stroke="var(--mute)" style="display:none"/><g class="dots"></g></svg><div class="tip"></div>
    <details><summary>Show as table</summary><div class="scroll"><table><tr><th>${xLabel}</th>${series.map(s => `<th class="n">${s.name}</th>`).join('')}</tr>${xs.filter((_, i) => i % Math.ceil(xs.length / 40) === 0).map(x => `<tr><td>${xFmt(x)}</td>${series.map(s => { const p = s.pts.find(p => p[0] === x); return `<td class="n">${p && p[1] != null ? yFmt(+p[1].toFixed(2)) : '–'}</td>`; }).join('')}</tr>`).join('')}</table></div></details></div>`);
  const svg = box.querySelector('svg'), ch = box.querySelector('.ch'), tip = box.querySelector('.tip'), dots = box.querySelector('.dots');
  svg.addEventListener('pointermove', ev => { const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * W, xv = x0 + (vx - m.l) / (W - m.l - m.r) * (x1 - x0);
    const x = xs.reduce((a, b) => Math.abs(b - xv) < Math.abs(a - xv) ? b : a); ch.setAttribute('x1', X(x)); ch.setAttribute('x2', X(x)); ch.style.display = '';
    const rows = series.map(s => [s, s.pts.find(p => p[0] === x)]).filter(([, p]) => p && p[1] != null);
    dots.innerHTML = rows.map(([s, p]) => `<circle cx="${X(x)}" cy="${Y(p[1])}" r="4.5" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`).join('');
    tip.innerHTML = `<b>${xFmt(x)}</b> <span class="mute">${xLabel}</span><br>` + rows.map(([s, p]) => `<i style="background:${s.color}"></i>${s.name}: <b>${yFmt(+p[1].toFixed(2))}</b>`).join('<br>');
    tip.style.display = 'block'; const px = X(x) / W * r.width; tip.style.left = Math.min(px + 14, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = (svg.offsetTop + 20) + 'px'; });
  svg.addEventListener('pointerleave', () => { ch.style.display = 'none'; tip.style.display = 'none'; dots.innerHTML = ''; });
  return box;
}
function bars(rows, fmt, ref) {   // horizontal bars, one colour, value labels
  const max = Math.max(...rows.map(r => r.v), ref ?? 0) * 1.08;
  return el(`<div>${rows.map(r => `<div style="margin:8px 0" title="${r.label}: ${fmt(r.v)}"><div style="font-size:13px">${r.label}</div><div style="display:flex;align-items:center;gap:8px"><div style="height:14px;border-radius:0 4px 4px 0;background:${C.s1};width:${r.v / max * 100}%"></div><b style="font-size:13px">${fmt(r.v)}</b></div></div>`).join('')}</div>`);
}
function field(d, nx, ny) {   // density map of a generated part: one hue, light = material
  const c = document.createElement('canvas'); c.width = nx; c.height = ny; const x = c.getContext('2d'), im = x.createImageData(nx, ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const v = Math.min(1, d[i * ny + j]), o = 4 * (j * nx + i); im.data[o] = 11 + v * (57 - 11) * 1.6; im.data[o + 1] = 17 + v * (135 - 17) * 1.4; im.data[o + 2] = 24 + v * (229 - 24); im.data[o + 3] = 255; }
  x.putImageData(im, 0, 0); return c;
}
const app = document.getElementById('app'); app.className = ''; app.innerHTML = '';
const add = h => { const n = typeof h === 'string' ? el(h) : h; app.append(n); return n; };
const b = sz.base, s = sz.best, T = sz.tmax;

// ---- scorecard
add(`<section id="score"><h2>Scorecard</h2><p>Today's layout against the layout the sizing study proposes. The proposal is a recommendation: the 3D model still shows today's layout.</p>
<div class="card"><table><tr><th>Requirement</th><th>Target</th><th class="n">Today</th><th></th><th class="n">Proposed</th><th></th></tr>
<tr><td>Pitch stability margin in forward flight</td><td>+5 to +12%</td><td class="n">${b.margin}%</td><td>${status(b.margin >= 5)}</td><td class="n">+${s.margin}%</td><td>${status(s.margin >= 5)}</td></tr>
<tr><td>Hardest-working fan in the hover</td><td>60% or less</td><td class="n">${pct(b.hover_worst)}</td><td>${status(b.hover_worst <= .6, b.hover_worst <= .7)}</td><td class="n">${pct(s.hover_worst)}</td><td>${status(s.hover_worst <= .6, s.hover_worst <= .7)}</td></tr>
<tr><td>Stall speed</td><td>12 m/s or less</td><td class="n">${b.stall}</td><td>${status(b.stall <= 12, b.stall <= 13)}</td><td class="n">${s.stall}</td><td>${status(s.stall <= 12)}</td></tr>
<tr><td>All-up weight</td><td>1,900 g or less</td><td class="n">${b.mass} g</td><td>${status(b.mass <= 1900)}</td><td class="n">${s.mass} g</td><td>${status(s.mass <= 1900)}</td></tr></table></div>
<div class="tiles"><div class="tile"><b>${s.wing_dx} mm</b><span>wing and roll motors move aft</span></div><div class="tile"><b>${s.fan_x - b.fan_x} mm</b><span>lift fan moves forward</span></div><div class="tile"><b>${s.xb - b.xb} mm</b><span>battery and electronics move forward, into the space the fan leaves</span></div><div class="tile"><b>SD7062</b><span>wing section: 14% thick, more lift before stall</span></div></div>
<div class="note">The hover line got worse, not better, because the fan model below says the lift-fan motor can give about ${T.F} g within its current limit, not the 1,300 g assumed until now. That is the next thing to fix.</div></section>`);

// ---- central trade
const sec = add(`<section id="trade"><h2>The central trade: where the battery sits</h2><p>One variable, today's layout. Moving the battery forward makes forward flight stable but takes load off the tail nozzle and puts it on the lift fan and roll motors. No battery position satisfies both, which is why the wing and the lift fan have to move too.</p><div class="grid2"><div class="card" id="c1"><h3>Pitch stability margin</h3></div><div class="card" id="c2"><h3>Fan load in the hover</h3></div></div>
<div class="card"><h3>Try a battery position</h3><input id="bx" type="range" min="0" max="${sz.sweep.length - 1}" value="0" aria-label="Battery position"><div class="tiles" id="bt"></div></div></section>`);
sec.querySelector('#c1').append(lineChart({ xLabel: 'battery position, mm ahead of the datum', yLabel: 'margin, % of chord', yMin: -30, yMax: 40, yFmt: v => v + '%', band: { lo: 5, hi: 12, label: 'target' }, mark: { x: -60, label: 'today' },
  series: [{ name: "Today's layout", short: 'today', color: C.s1, pts: sz.sweep.map(d => [d.xb, d.margin]) }, { name: 'Wing 100 mm aft, tail 1.5x', short: 'wing aft', color: C.s2, pts: sz.sweep_tail.map(d => [d.xb, d.margin]) }] }));
sec.querySelector('#c2').append(lineChart({ xLabel: 'battery position, mm ahead of the datum', yLabel: 'share of maximum thrust', yMin: 0, yMax: 1, yFmt: pct, band: { lo: 0, hi: .6, label: 'target: 60% or less' }, mark: { x: -60, label: 'today' },
  series: [{ name: 'Lift fan', color: C.s1, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.F]) }, { name: 'Tail nozzle', short: 'nozzle', color: C.s2, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.M]) }, { name: 'Roll motors', short: 'roll', color: C.s3, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.R]) }] }));
const bx = sec.querySelector('#bx'), bt = sec.querySelector('#bt');
const showB = () => { const d = sz.sweep[+bx.value]; bt.innerHTML = `<div class="tile"><b>${d.xb} mm</b><span>battery position</span></div><div class="tile"><b>${d.cg} mm</b><span>balance point</span></div><div class="tile"><b>${d.margin}%</b><span>stability margin ${d.margin >= 5 ? '✓' : '✕ unstable or too little'}</span></div><div class="tile"><b>${d.hover ? pct(d.hover_worst) : 'cannot hover'}</b><span>hardest-working fan ${d.hover && d.hover_worst <= .6 ? '✓' : '✕'}</span></div>`; };
bx.addEventListener('input', showB); showB();

// ---- flight dynamics
const ts = (r, k) => r.t.map((t, i) => [t, r[k][i]]);
const fs = add(`<section id="flight"><h2>Flight dynamics (JSBSim)</h2><p>Level flight at 18 m/s. At 0.5 s the tail is kicked 2° nose-up for 0.2 s. A line that leaves the chart has departed controlled flight.</p>
<div class="tiles"><div class="tile"><b>${fl.today.mode.replace('diverges: ', '')}</b><span>today's layout, hands off: pitch error ${fl.today.mode.startsWith('div') ? 'grows' : 'oscillates'}</span></div><div class="tile"><b>${fl.sized.mode.replace('oscillates at ', '')}</b><span>proposed layout: a slow, stable pitch oscillation</span></div><div class="tile"><b>${fl.sized.free.trim.tail_deg}°</b><span>tail angle the proposed layout needs to fly level: too much, see note</span></div></div>
<div class="grid2"><div class="card" id="f1"><h3>Pitch after the kick</h3></div><div class="card" id="f2"><h3>Proposed layout: 5° pitch-up command</h3></div></div>
<div class="note">Today's layout departs even with a pitch gyro driving the tail at full servo speed. The proposed layout is stable, but it trims with ${Math.abs(fl.sized.free.trim.tail_deg)}° of tail, which costs drag and control range. Next loop: set the wing at an angle to the body so the tail trims near zero.</div></section>`);
fs.querySelector('#f1').append(lineChart({ xLabel: 'time, s', yLabel: 'pitch change, degrees', yMin: -20, yMax: 40, yFmt: v => v + '°',
  series: [{ name: 'Today, hands off', short: 'today', color: C.s1, pts: ts(fl.today.free, 'pitch') }, { name: 'Today, with pitch gyro', short: 'today + gyro', color: C.s2, pts: ts(fl.today.damped, 'pitch') }, { name: 'Proposed, hands off', short: 'proposed', color: C.s3, pts: ts(fl.sized.free, 'pitch') }] }));
fs.querySelector('#f2').append(lineChart({ xLabel: 'time, s', yLabel: 'degrees', yMin: -25, yMax: 15, yFmt: v => v + '°',
  series: [{ name: 'Pitch change', short: 'pitch', color: C.s1, pts: ts(fl.sized.step, 'pitch') }, { name: 'Tail angle', short: 'tail', color: C.s2, pts: ts(fl.sized.step, 'tail') }] }));

// ---- fans
const fsec = add(`<section id="fans"><h2>Fans (blade-element model)</h2><p>Thrust of each printed fan against speed, and the point where the EMAX 2306 motor settles. "Expected" is ${Math.round(fans.main.real_factor * 100)}% of the ideal figure, to allow for tip gap, stator and surface losses.</p><div class="grid2" id="fg"></div>
<div class="note">Reliable only near each fan's design speed. It cannot yet be used to choose a better diameter or blade angle: off-design it gives nonsense. The thrust stand decides.</div></section>`);
for (const k of ['lift', 'main']) { const f = fans[k], L = f.at_current_limit, c = el(`<div class="card"><h3>${f.label}</h3><div class="tiles"><div class="tile"><b>${L.expected_g} g</b><span>expected at ${L.amps} A (${Math.round(L.throttle * 100)}% throttle). Assumed before: ${f.assumed_g} g</span></div><div class="tile"><b>${L.rpm.toLocaleString()}</b><span>rpm · jet ${L.jet_m_s} m/s · ${L.watts} W</span></div></div></div>`);
  c.append(lineChart({ xLabel: 'fan speed, rpm', yLabel: 'thrust, g', yMin: 0, xFmt: v => (v / 1000) + 'k', mark: { x: Math.round(L.rpm / 1000) * 1000, label: 'motor limit' },
    series: [{ name: 'Ideal', color: C.s1, dash: true, pts: f.curve.map(p => [p.rpm, p.thrust_g]) }, { name: 'Expected', color: C.s2, pts: f.curve.map(p => [p.rpm, Math.round(p.thrust_g * f.real_factor)]) }] })); fsec.querySelector('#fg').append(c); }

// ---- structure
const k = st.skid, ss = add(`<section id="struct"><h2>Structure</h2><p><b>Long beams: aluminium stays.</b> A printed beam of the same weight, even in the deepest box that fits inside the wing, is less stiff than the 8 mm tube, and its 0.8 mm walls would buckle first.</p>
<div class="grid2"><div class="card"><h3>Bending stiffness at equal weight (aluminium tube = 1)</h3><div id="sb"></div><details><summary>Show as table</summary><table><tr><th>Beam</th><th class="n">g per m</th><th class="n">Stiffness, N·m²</th><th class="n">Breaking moment, N·m</th></tr>${st.beams.map(r => `<tr><td>${r.beam}</td><td class="n">${r.g_per_m}</td><td class="n">${r.EI}</td><td class="n">${r.M_fail}</td></tr>`).join('')}</table></details></div>
<div class="card"><h3>Generative design: landing skid, front view</h3><p class="mute" style="font-size:13px">Same weight, same clips (top) and feet (bottom). Three load cases: flat landing, and one foot first with sideways drift, each side.</p><div class="grid2" style="grid-template-columns:1fr 1fr"><div><div class="mute" style="font-size:12.5px">Today</div><div id="k0"></div></div><div><div class="mute" style="font-size:12.5px">Generated</div><div id="k1"></div></div></div>
<div class="tiles"><div class="tile"><b>about ${Math.round(k.stiffness_gain)}×</b><span>stiffer at the same weight, in this flat model</span></div></div></div></div>
<p><b>Brackets and frames: generative design wins.</b> Today's skid resists a sideways landing by bending two straight legs. The generated shape turns that into tension and compression in a braced frame. The gain is large because the starting point was poor for that load; expect less on parts that are already triangulated.</p></section>`);
ss.querySelector('#sb').append(bars(st.beams.map(r => ({ label: r.beam, v: r.stiffness_vs_al })), v => v.toFixed(2) + '×'));
ss.querySelector('#k0').append(field(k.current, k.nx, k.ny)); ss.querySelector('#k1').append(field(k.density, k.nx, k.ny));

// ---- methods
add(`<section id="method"><h2>Methods and limits</h2><div class="card"><table><tr><th>Question</th><th>Tool</th><th>Main limit</th></tr>
<tr><td>Where lift acts; stability; lift and tail power</td><td>AeroSandbox vortex-lattice method</td><td>No stall, no fan openings. Wing and tail in one plane, so results with the wing moved aft are less certain</td></tr>
<tr><td>Stall speed, wing section</td><td>NeuralFoil section data, scaled to the wing</td><td>Rough: within about 15%</td></tr>
<tr><td>Hover fan loads</td><td>Force and moment balance, linear programme</td><td>Depends on three thrust figures; only two come from a model, none from a test</td></tr>
<tr><td>Pitch response</td><td>JSBSim, six degrees of freedom</td><td>Linear aerodynamics, symmetric flight only, no transition yet</td></tr>
<tr><td>Fan thrust</td><td>Blade-element with duct momentum</td><td>Valid near design speed only</td></tr>
<tr><td>Beams</td><td>Beam formulas</td><td>No buckling, no layer-direction weakness</td></tr>
<tr><td>Skid shape</td><td>Topology optimisation (SIMP), 110 × 60 cells</td><td>Flat (2D) model; not yet turned into a printable part</td></tr></table></div>
<p class="mute">Scripts are in <code>analysis/</code> in the repository; each writes the file this page reads.</p></section>`);
window.__analysis = true;
