// Engineering analysis page: reads the JSON written by analysis/*.py and draws it. No chart library.
const J = async f => (await fetch('analysis/' + f)).json();
const [sz, fl, fans, st, cur, hv, v5] = await Promise.all(['sizing.json', 'flight.json', 'fans.json', 'structure.json', 'current.json', 'hover.json', 'v5.json'].map(J));
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
// ---- scorecard
const n = cur.now, f0 = cur.first, pr = hv.steps[hv.steps.length - 1];
const row = (name, target, a, b, c, okA, okB, okC, warnB, warnC) => `<tr><td>${name}</td><td>${target}</td><td class="n">${a}</td><td>${okA === null ? '' : status(okA)}</td><td class="n">${b}</td><td>${status(okB, warnB)}</td><td class="n">${c}</td><td>${status(okC, warnC)}</td></tr>`;
add(`<section id="score"><h2>Scorecard</h2><p>The first layout, the hover-margin proposal that came out of the study below, and the aircraft as it is now drawn in the 3D model and the CAD. Every figure in the last column is measured off the drawn parts, not off a sketch.</p>
<div class="card"><div class="scroll" style="max-height:none;overflow-x:auto"><table><tr><th>Requirement</th><th>Target</th><th class="n">First layout</th><th></th><th class="n">Hover study</th><th></th><th class="n">As drawn now</th><th></th></tr>
${row('Pitch stability margin in forward flight', '+5 to +12%', f0.margin + '%', '+' + pr.margin + '%', '+' + n.margin + '%', false, pr.ok.margin, n.margin >= 5 && n.margin <= 12)}
${row('Hardest-working fan in the hover', '60% or less', pct(f0.hover_worst), pct(pr.hover_worst), pct(n.hover_worst), false, pr.ok.hover, n.hover_worst <= .6, pr.hover_worst <= .7, n.hover_worst <= .7)}
${row('Stall speed', '12 m/s or less', f0.stall, pr.stall, n.stall, false, pr.ok.stall, n.stall <= 12)}
${row('All-up weight', '2,000 g or less (was 1,900)', f0.mass.toLocaleString('en') + ' g', pr.mass.toLocaleString('en') + ' g', n.mass.toLocaleString('en') + ' g', true, pr.mass <= 2000, n.mass <= 2000)}
${row('Hover time', '3 min or more', 'not computed', pr.time.minutes + ' min', v5.best.time.minutes + ' min', null, pr.ok.time, v5.best.time.minutes >= 3)}
${row('Nothing in the airflow on the ground', 'retractable legs', 'two tall skids', 'two tall skids', 'three retracting legs', false, false, true)}
${row('Wiring the owner can service', 'connector at each end', 'loose bundle', 'loose bundle', '25 runs in two raceways', false, false, true)}</table></div></div>
<div class="tiles"><div class="tile"><b>${pct(n.hover.F)}</b><span>lift fan in the hover, as drawn (${n.thrust_g.lift.toLocaleString('en')} g available)</span></div><div class="tile"><b>${pct(n.hover.M)}</b><span>tail nozzle, as drawn (${n.thrust_g.nozzle_down.toLocaleString('en')} g available pointing down)</span></div><div class="tile"><b>${pct(n.hover.R)}</b><span>roll motors, as drawn (${n.thrust_g.roll_pair.toLocaleString('en')} g the pair, from a propeller model)</span></div><div class="tile"><b>${pct(n.ideal_equal_load)}</b><span>the best any layout could do with today's thrust and weight</span></div></div>
<div class="note"><b>The weight target moved from 1,900 g to 2,000 g in this loop, and here is why.</b> Drawing the wiring properly turned the first draft's 45 g guess into 132 g of real wire, connectors and raceway covers. Retracting the legs instead of hanging skids in the airflow costs 36 g of servos. Both buy something the targets ask for, so the honest answer was to raise the weight limit rather than to pretend. Hover times come from a fan power model with the roll propellers from momentum theory: treat them as ±20%.</div>
<div class="card"><h3>What changed from the first layout to the as-drawn aircraft</h3><table><tr><th>Item</th><th>Change</th><th>Why</th></tr>${cur.changes.map(c => `<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`).join('')}</table></div></section>`);

// ---- fourth loop: shape, legs and wiring (layout_v5.py, run against the drawn parts)
const B5 = v5.best, PL = v5.places, lifts = { owned: 'EMAX 2306, 1,700 KV (owned)', 1500: '2807 size, 1,500 KV (buy)' };
const v5s = add(`<section id="v5"><h2>Fourth loop: shape, legs and wiring</h2>
<p>This loop drew the things the earlier loops had only assumed: a blended body, three retracting legs, and every wire as a numbered run in a belly raceway with a connector at each end. Then it re-ran the balance and the hover against those drawn parts, and priced the three places the speed controllers could live, because that choice moves both the balance point and the length of the wiring.</p>
<div class="tiles"><div class="tile"><b>${B5.mass.toLocaleString('en')} g</b><span>all-up, every part from the CAD</span></div><div class="tile"><b>+${B5.margin}%</b><span>pitch stability margin (floor +5%)</span></div><div class="tile"><b>${pct(B5.worst)}</b><span>hardest-working fan in the hover</span></div><div class="tile"><b>${B5.time.minutes} min</b><span>hover on a ${B5.cap.toLocaleString('en')} mAh pack</span></div><div class="tile"><b>$${B5.usd}</b><span>still to buy</span></div></div>
<div class="card"><h3>Where the speed controllers go, against lift motor and battery</h3><p class="mute" style="font-size:13px">18 combinations. The lift-fan controller stays in the nose in all of them: its motor is up front, and nose weight is what keeps the aircraft stable. A row fails if any target is missed.</p>
<div class="scroll" style="max-height:none;overflow-x:auto"><table><tr><th>Controllers</th><th>Lift motor</th><th class="n">Pack</th><th class="n">Weight</th><th class="n">Harness</th><th class="n">Margin</th><th class="n">Worst fan</th><th class="n">Hover</th><th class="n">$</th><th>Verdict</th></tr>
${v5.rows.map(r => { const bad = Object.entries(r.ok).filter(([, v]) => !v).map(([k]) => k), win = r.place === B5.place && r.lift === B5.lift && r.cap === B5.cap;
  return `<tr${win ? ' style="background:rgba(12,163,12,.10)"' : ''}><td>${PL[r.place].name.split(',')[0]}</td><td>${lifts[r.lift]}</td><td class="n">${r.cap.toLocaleString('en')}</td><td class="n">${r.mass.toLocaleString('en')} g</td><td class="n">${r.harness_g} g</td><td class="n">+${r.margin}%</td><td class="n">${pct(r.worst)}</td><td class="n">${r.time ? r.time.minutes + ' min' : '–'}</td><td class="n">${r.usd}</td><td>${bad.length ? '<span class="st crit"><i>✕</i>' + bad.join(', ') + '</span>' : status(true).replace('Met', win ? 'Chosen' : 'All met')}</td></tr>`; }).join('')}</table></div></div>
<div class="grid2"><div class="card" id="v5c1"><h3>Sliding the battery in its tray</h3><p class="mute" style="font-size:13px">Chosen layout. The tray runs from the lift-fan bay to the spar, ${Math.abs(v5.slide[0].battery_x)} mm ahead of the datum to ${v5.slide[v5.slide.length - 1].battery_x} mm behind it. The hardest-working fan hardly notices, moving from ${pct(v5.slide[0].worst)} to ${pct(v5.slide[v5.slide.length - 1].worst)} across the whole travel, so the tray is purely a trim adjustment.</p></div>
<div class="card"><h3>What the chosen layout costs and buys</h3><table><tr><th>Choice</th><th>Why this one</th></tr>
<tr><td>Controllers beside the battery, under the hatch</td><td>Shortest total wiring of the three places (${B5.harness_g} g), and it leaves the balance point where the battery can still trim it. In the nose bay the harness grows and the aircraft runs nose-heavy; in the fan bay the controllers sit in the fan's own airflow</td></tr>
<tr><td>2807-size lift motor at about 1,500 KV</td><td>${B5.thrust_g.lift.toLocaleString('en')} g instead of 1,206 g from the owned motor, at the same 35 A, because the fan is torque-limited. $20, and the only way the hover target is met</td></tr>
<tr><td>4-cell ${B5.cap.toLocaleString('en')} mAh pack</td><td>2,200 mAh meets every target but hover time; 3,300 mAh is too heavy for the fan margin. ${B5.time.minutes} min, and the balance point lands at +${B5.margin}%</td></tr>
<tr><td>Three retracting legs</td><td>Nothing in the airflow once airborne, and the simulator gives back ${Math.round(0.012 / (0.012 + 0.03) * 100)}% of the wing's drag when they come up. 36 g of servos is the price</td></tr>
<tr><td>Raceways moulded into the belly</td><td>Each of the 25 runs has its own slot and a connector at each end, so any component comes out without cutting wire. The covers are printed, four of them, and screw on</td></tr></table></div></div>
<div class="note">The chosen layout clears every target but has no slack: the hardest-working fan sits at ${(B5.worst * 100).toFixed(1)}% against a 60% limit, and the margin at +${B5.margin}% against a +5% floor. Both rest on thrust figures nobody has measured. If the thrust stand comes in low, the ${(2200).toLocaleString('en')} mAh pack buys back ${Math.round((B5.mass - v5.rows.filter(r => r.place === B5.place && r.lift === B5.lift && r.cap === 2200)[0].mass))} g at the cost of hover time.</div></section>`);
v5s.querySelector('#v5c1').append(lineChart({ xLabel: 'battery position, mm ahead of the datum', yLabel: 'stability margin, % of chord', yMin: 0, yMax: 13, yFmt: v => v + '%',
  band: { lo: 5, hi: 12, label: 'target: +5 to +12%' }, mark: { x: Math.round(B5.battery_x), label: 'chosen' },
  series: [{ name: 'Stability margin', short: 'margin', color: C.s1, pts: v5.slide.map(d => [d.battery_x, d.margin]) }] }));

// ---- hover margin study
const rb = hv.roll.B, need = hv.need, C4 = '#a35fd6';
const hs = add(`<section id="hover"><h2>Hover margin: getting to 60%</h2>
<p>In the hover, three things hold the aircraft up: the lift fan near the nose, the tail nozzle at the back, and the two roll motors in the wings. Their thrust is centred ${Math.round(hv.now.cg - hv.now.thrust_centre)} mm behind the balance point, and stability will not let the balance point move aft. So the lift fan and roll motors do all the work and the nozzle idles at ${pct(hv.now.hover.M)}.</p>
<div class="card"><h3>One change at a time, from the aircraft as drawn</h3><div class="scroll" style="max-height:none;overflow-x:auto"><table><tr><th>Step</th><th class="n">Weight</th><th class="n">Margin</th><th class="n">Lift fan</th><th class="n">Nozzle</th><th class="n">Roll</th><th class="n">Hover time</th></tr>
${hv.steps.map(s => `<tr><td>${s.step}</td><td class="n">${s.mass} g</td><td class="n">+${s.margin}%</td><td class="n">${pct(s.hover.F)}</td><td class="n">${pct(s.hover.M)}</td><td class="n">${pct(s.hover.R)}</td><td class="n">${s.time.minutes} min</td></tr>`).join('')}</table></div>
<div id="hstep"></div></div>
<div class="grid2"><div class="card" id="h1"><h3>Hardest-working fan against all-up weight</h3><p class="mute" style="font-size:13px">Balance point held at +${hv.margin_target}% stability margin.</p></div>
<div class="card" id="h2"><h3>Why the balance point matters: fan loads, proposed layout</h3><p class="mute" style="font-size:13px">Left of the dashed line the aircraft is unstable in forward flight.</p></div></div>
<div class="grid2"><div class="card" id="h3"><h3>Lift-fan motor: thrust at 35 A against motor KV</h3><p class="mute" style="font-size:13px">Same 140 mm fan. A lower-KV motor gives more torque per amp, until the battery runs out of volts.</p></div>
<div class="card" id="h4"><h3>What the roll motors would have to give</h3><p class="mute" style="font-size:13px">Proposed layout. The roll pair's ${1000} g is a guess; nothing has measured it.</p></div></div>
<div class="note">${pr.ok.hover ? `<b>Every target is met, with nothing to spare.</b> Fan load ${pct(pr.hover_worst)}, margin +${pr.margin}%, hover ${pr.time.minutes} min (±20%). The step before, with the 2,700 mAh pack, gives ${pct(hv.steps[hv.steps.length - 2].hover_worst)} and ${hv.steps[hv.steps.length - 2].time.minutes} min: the safer choice if the thrust stand falls short.` : `<b>60% is not reached</b>: the proposal gets to ${pct(pr.hover_worst)} at ${pr.mass} g.`} All of this rests on thrust figures nobody has measured${pr.ok.hover ? `, and the design sits exactly on the line: it needs the lift fan's modelled ${pr.thrust_g.lift} g and the roll pair's guessed ${pr.thrust_g.roll_pair} g in full` : `. To reach 60%: lift fan ${need.lift_g} g (modelled ${pr.thrust_g.lift} g), or roll pair ${need.roll_pair_g} g (guessed ${pr.thrust_g.roll_pair} g)`}.</div>
<div class="card"><h3>The proposal</h3><table><tr><th>Item</th><th>Change</th><th>Effect and cost</th></tr>
<tr><td>Lift-fan motor</td><td>EMAX 2306 1,700 KV → a 2807-size motor of about ${hv.kv_new} KV (about +${hv.motors[hv.kv_new].g - hv.motors[1700].g} g)</td><td>${pr.thrust_g.lift} g instead of ${hv.now.thrust_g.lift} g at the same 35 A, held down to 3.5 V per cell. Motor mount on the fan spider to check</td></tr>
<tr><td>Roll motors</td><td>From ${-hv.roll.A.x} mm behind the datum, behind the spar, to ${-rb.x} mm, in front of it; ${rb.z} mm out instead of ${hv.roll.A.z}</td><td>Moves their thrust ${rb.x - hv.roll.A.x} mm forward. Roll arm ${Math.round((1 - rb.arm_vs_now) * 100)}% shorter. Pod hangs the motor ahead of the spar; the inner/outer wing joint moves inboard, clear of the propeller duct</td></tr>
<tr><td>Battery</td><td>4-cell 3,300 → ${pr.cap.toLocaleString('en')} mAh (about ${hv.batteries[3300] - hv.batteries[pr.cap]} g lighter)${Math.round(16 - pr.battery_x) > 0 ? ', slid ' + Math.round(16 - pr.battery_x) + ' mm aft in the tray' : ', in today\u2019s position'}</td><td>Hover time ${hv.now.time.minutes} → ${pr.time.minutes} min. The balance point sits at +${pr.margin}%, a point in hand above the +5% floor</td></tr>
<tr><td>Lighter parts</td><td>${hv.savings.filter(v => v.used).reduce((a, v) => a + v.g, 0)} g in all: see the table below</td><td>Tail and centre savings are free. Nose savings are limited, because nose weight is what keeps the aircraft stable</td></tr>
<tr><td>Wing, tail, outline</td><td>Unchanged</td><td>So the point where lift acts and the stall speed are unchanged apart from weight</td></tr></table></div>
<div class="card"><h3>Where the weight comes from</h3><div class="scroll" style="max-height:none;overflow-x:auto"><table><tr><th>Saving</th><th class="n">Grams</th><th>Where</th><th>How sure</th><th>Used</th></tr>
${hv.savings.map(v => `<tr><td>${v.label}</td><td class="n">${v.g}</td><td>${v.where}</td><td>${v.conf}</td><td>${v.used ? status(true).replace('Met', 'Yes') : '<span class="st crit"><i>✕</i>No</span>'}</td></tr>`).join('')}</table></div>
<p class="mute" style="font-size:13px">With the 4-in-1 speed controller in place of the four lighter singles: ${hv.with_4in1.mass} g and ${pct(hv.with_4in1.hover_worst)} on the fans, but the stability margin falls to ${hv.with_4in1.margin > 0 ? '+' : ''}${hv.with_4in1.margin}% (the floor is +5%).</p></div></section>`);
hs.querySelector('#hstep').append(bars(hv.steps.map(s => ({ label: s.step, v: s.hover_worst })), pct, 0.6));
const VC = [C.s1, C.s2, C.s3, C4];
hs.querySelector('#h1').append(lineChart({ xLabel: 'all-up weight, g', yLabel: 'hardest-working fan', yMin: 0.5, yMax: 0.9, yFmt: pct, band: { lo: 0.5, hi: 0.6, label: 'target: 60% or less' }, mark: { x: 1900, label: '1,900 g target' },
  series: hv.vs_mass.map((c, i) => ({ name: c.name, short: ['as drawn', '1,500 KV', '+ roll fwd', '+ roll inboard'][i], color: VC[i], pts: c.pts })) }));
hs.querySelector('#h2').append(lineChart({ xLabel: 'balance point, mm ahead of the datum', yLabel: 'share of maximum thrust', yMin: 0, yMax: 1, yFmt: pct, band: { lo: 0, hi: 0.6, label: 'target' }, mark: { x: Math.round(hv.np + 5 * 2.4), label: '+5% margin' },
  series: [{ name: 'Lift fan', color: C.s1, pts: hv.cg_sweep.map(d => [d.cg, d.F]) }, { name: 'Tail nozzle', short: 'nozzle', color: C.s2, pts: hv.cg_sweep.map(d => [d.cg, d.M]) }, { name: 'Roll motors', short: 'roll', color: C.s3, pts: hv.cg_sweep.map(d => [d.cg, d.R]) }] }));
hs.querySelector('#h3').append(lineChart({ xLabel: 'lift-fan motor, KV', yLabel: 'expected thrust, g', yMin: 1000, yMax: 1600, mark: { x: hv.kv_new, label: 'proposed' },
  series: [{ name: 'Fresh pack (4.0 V per cell)', short: 'fresh', color: C.s1, pts: hv.kv_sweep.map(r => [r.kv, r.fresh_g]) }, { name: 'Tired pack (3.5 V per cell)', short: 'tired', color: C.s2, pts: hv.kv_sweep.map(r => [r.kv, r.tired_g]) }] }));
hs.querySelector('#h4').append(lineChart({ xLabel: 'roll pair thrust, g', yLabel: 'hardest-working fan', yMin: 0.5, yMax: 0.8, yFmt: pct, band: { lo: 0.5, hi: 0.6, label: 'target' }, mark: { x: 1000, label: 'today’s guess' },
  series: [{ name: 'Proposed layout, ' + pr.mass + ' g', short: 'proposed', color: C.s1, pts: hv.roll_sweep }] }));
const b = sz.base, s = sz.best, T = sz.tmax;

// ---- central trade
const sec = add(`<section id="trade"><h2>The central trade: where the battery sits</h2><p>One variable, in the first layout (this is the study that started the re-layout). Moving the battery forward makes forward flight stable but takes load off the tail nozzle and puts it on the lift fan and roll motors. No battery position satisfies both, which is why the wing and the lift fan have to move too.</p><div class="grid2"><div class="card" id="c1"><h3>Pitch stability margin</h3></div><div class="card" id="c2"><h3>Fan load in the hover</h3></div></div>
<div class="card"><h3>Try a battery position</h3><input id="bx" type="range" min="0" max="${sz.sweep.length - 1}" value="0" aria-label="Battery position"><div class="tiles" id="bt"></div></div></section>`);
sec.querySelector('#c1').append(lineChart({ xLabel: 'battery position, mm ahead of the datum', yLabel: 'margin, % of chord', yMin: -30, yMax: 40, yFmt: v => v + '%', band: { lo: 5, hi: 12, label: 'target' }, mark: { x: -60, label: 'first layout' },
  series: [{ name: 'First layout', short: 'first', color: C.s1, pts: sz.sweep.map(d => [d.xb, d.margin]) }, { name: 'Wing 100 mm aft, tail 1.5x', short: 'wing aft', color: C.s2, pts: sz.sweep_tail.map(d => [d.xb, d.margin]) }] }));
sec.querySelector('#c2').append(lineChart({ xLabel: 'battery position, mm ahead of the datum', yLabel: 'share of maximum thrust', yMin: 0, yMax: 1, yFmt: pct, band: { lo: 0, hi: .6, label: 'target: 60% or less' }, mark: { x: -60, label: 'first layout' },
  series: [{ name: 'Lift fan', color: C.s1, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.F]) }, { name: 'Tail nozzle', short: 'nozzle', color: C.s2, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.M]) }, { name: 'Roll motors', short: 'roll', color: C.s3, pts: sz.sweep.map(d => [d.xb, d.hover && d.hover.R]) }] }));
const bx = sec.querySelector('#bx'), bt = sec.querySelector('#bt');
const showB = () => { const d = sz.sweep[+bx.value]; bt.innerHTML = `<div class="tile"><b>${d.xb} mm</b><span>battery position</span></div><div class="tile"><b>${d.cg} mm</b><span>balance point</span></div><div class="tile"><b>${d.margin}%</b><span>stability margin ${d.margin >= 5 ? '✓' : '✕ unstable or too little'}</span></div><div class="tile"><b>${d.hover ? pct(d.hover_worst) : 'cannot hover'}</b><span>hardest-working fan ${d.hover && d.hover_worst <= .6 ? '✓' : '✕'}</span></div>`; };
bx.addEventListener('input', showB); showB();

// ---- flight dynamics
const ts = (r, k) => r.t.map((t, i) => [t, r[k][i]]);
const fs = add(`<section id="flight"><h2>Flight dynamics (JSBSim)</h2><p>Level flight at 18 m/s. At 0.5 s the tail is kicked 2° nose-up for 0.2 s. A line that leaves the chart has departed controlled flight.</p>
<div class="tiles"><div class="tile"><b>${fl.today.mode.replace('diverges: ', '')}</b><span>first layout, hands off: pitch error ${fl.today.mode.startsWith('div') ? 'grows' : 'oscillates'}</span></div><div class="tile"><b>${fl.sized.mode.replace('oscillates at ', '')}</b><span>as drawn now: a slow, stable pitch oscillation</span></div><div class="tile"><b>${fl.sized.free.trim.tail_deg}°</b><span>tail angle needed to fly level at 18 m/s: too much, see note</span></div></div>
<div class="grid2"><div class="card" id="f1"><h3>Pitch after the kick</h3></div><div class="card" id="f2"><h3>As drawn now: 5° pitch-up command</h3></div></div>
<div class="note">The first layout departed even with a pitch gyro driving the tail at full servo speed. The aircraft as drawn is stable, but it needs ${Math.abs(fl.sized.free.trim.tail_deg)}° of tail to fly level at 18 m/s, out of 25° available: the cambered wing section pitches the nose down and the tail, sitting in the wing's wake, is weak. This is the main open problem in forward flight.</div></section>`);
fs.querySelector('#f1').append(lineChart({ xLabel: 'time, s', yLabel: 'pitch change, degrees', yMin: -20, yMax: 40, yFmt: v => v + '°',
  series: [{ name: 'First layout, hands off', short: 'first', color: C.s1, pts: ts(fl.today.free, 'pitch') }, { name: 'First layout, with pitch gyro', short: 'first + gyro', color: C.s2, pts: ts(fl.today.damped, 'pitch') }, { name: 'As drawn now, hands off', short: 'now', color: C.s3, pts: ts(fl.sized.free, 'pitch') }] }));
fs.querySelector('#f2').append(lineChart({ xLabel: 'time, s', yLabel: 'degrees', yMin: -30, yMax: 15, yFmt: v => v + '°',
  series: [{ name: 'Pitch change', short: 'pitch', color: C.s1, pts: ts(fl.sized.step, 'pitch') }, { name: 'Tail angle', short: 'tail', color: C.s2, pts: ts(fl.sized.step, 'tail') }] }));

// ---- fans
const fsec = add(`<section id="fans"><h2>Fans (blade-element model)</h2><p>Thrust of each printed fan against speed, and the point where the EMAX 2306 motor settles. "Expected" is ${Math.round(fans.main.real_factor * 100)}% of the ideal figure, to allow for tip gap, stator and surface losses.</p><div class="grid2" id="fg"></div>
<div class="note">Reliable only near each fan's design speed. It cannot yet be used to choose a better diameter or blade angle: off-design it gives nonsense. The thrust stand decides.</div></section>`);
for (const k of ['lift', 'main']) { const f = fans[k], L = f.at_current_limit, c = el(`<div class="card"><h3>${f.label}</h3><div class="tiles"><div class="tile"><b>${L.expected_g} g</b><span>expected at ${L.amps} A (${Math.round(L.throttle * 100)}% throttle). ${k === 'lift' ? 'Previous 120 mm fan: ' + fans.lift_old.at_current_limit.expected_g + ' g' : 'First guess: ' + f.assumed_g + ' g'}</span></div><div class="tile"><b>${L.rpm.toLocaleString()}</b><span>rpm · jet ${L.jet_m_s} m/s · ${L.watts} W</span></div></div></div>`);
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
<tr><td>Hover time</td><td>Fan model for the two fans; momentum theory (figure of merit 0.55, drive 80%) for the roll propellers; 80% of the pack used</td><td>About ±20%. Battery masses scaled from the 3,300 mAh pack, not weighed</td></tr>
<tr><td>Pitch response</td><td>JSBSim, six degrees of freedom</td><td>Linear aerodynamics, symmetric flight only, no transition yet</td></tr>
<tr><td>Fan thrust</td><td>Blade-element with duct momentum</td><td>Valid near design speed only</td></tr>
<tr><td>Beams</td><td>Beam formulas</td><td>No buckling, no layer-direction weakness</td></tr>
<tr><td>Skid shape</td><td>Topology optimisation (SIMP), 110 × 60 cells</td><td>Flat (2D) model; not yet turned into a printable part</td></tr></table></div>
<p class="mute">Scripts are in <code>analysis/</code> in the repository; each writes the file this page reads.</p></section>`);
window.__analysis = true;
