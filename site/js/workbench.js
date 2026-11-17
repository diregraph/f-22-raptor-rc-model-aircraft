// Workbench tweak panel (3D page, local workbench only): number knobs with an instant scorecard against the targets.
// Battery, thrust estimates, and the mass and station of any part you tap. "Save as report" files the tweak so
// Claude can make it permanent in spec.js, rerun the studies and check it.
import { PART, THRUSTERS } from './spec.js';
import { TARGETS, BATTERIES, defaults, score, grade } from './score.js';

const BENCH = await fetch('/api/ping', { cache: 'no-store' }).then(r => r.ok && r.json()).then(j => j?.bench === true).catch(() => false);
if (BENCH) { const wait = () => (window.__twin && document.querySelector('#wbBar') ? start() : setTimeout(wait, 100)); wait(); }

function start() {
  const T = window.__twin, base = defaults(), k = structuredClone(base), B = score(base);
  k.battX = T.state.battX;
  const $ = s => panel.querySelector(s), fmt = { mass: v => Math.round(v), margin: v => v.toFixed(1), hover: v => v.toFixed(1), stall: v => v.toFixed(1), time: v => v.toFixed(1) };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.head.insertAdjacentHTML('beforeend', `<style>
  #wbTweak { position: fixed; top: 100px; right: 14px; width: 330px; max-height: calc(100% - 390px); overflow: auto; z-index: 15; background: #0e151e; border: 1px solid rgba(160,190,220,.18); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  #wbTweak h3 { margin: 0; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #8b9bab; font-weight: 600; }
  #wbTweak table { width: 100%; border-collapse: collapse; font-size: 12.5px; } #wbTweak td, #wbTweak th { padding: 4px 4px; border-bottom: 1px solid rgba(160,190,220,.12); text-align: left; }
  #wbTweak th { color: #8b9bab; font-weight: 500; } #wbTweak td.n { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
  #wbTweak .g { display: inline-block; min-width: 54px; text-align: right; padding: 1px 6px; border-radius: 6px; font-weight: 600; }
  #wbTweak .g.ok { color: #1fd1bd; } #wbTweak .g.warn { color: #ffb347; background: rgba(255,179,71,.1); } #wbTweak .g.bad { color: #ff6b6b; background: rgba(255,107,107,.12); }
  #wbTweak label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8b9bab; }
  #wbTweak label span { display: flex; justify-content: space-between; } #wbTweak label output { color: #e8eef4; font-family: ui-monospace, monospace; text-transform: none; letter-spacing: 0; }
  #wbTweak input[type=range] { width: 100%; accent-color: #ff7a1a; } #wbTweak select, #wbTweak input[type=number] { background: #0a1017; color: #e8eef4; border: 1px solid rgba(160,190,220,.18); border-radius: 6px; padding: 4px 6px; font: inherit; width: 100%; box-sizing: border-box; }
  #wbTweak .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } #wbTweak .mute { color: #8b9bab; font-size: 12px; } #wbTweak ul { margin: 0; padding-left: 16px; font-size: 12.5px; }
  @media (max-width: 900px) { #wbTweak { left: 8px; right: 8px; width: auto; top: auto; bottom: calc(112px + env(safe-area-inset-bottom)); max-height: 52vh; } }
  </style>`);

  const btn = document.createElement('button'); btn.id = 'wbTweakBtn'; btn.textContent = 'Tweak'; btn.title = 'Change numbers and see the scorecard update';
  document.querySelector('#wbBar').prepend(btn);
  const panel = document.createElement('section'); panel.id = 'wbTweak'; panel.className = 'wb'; panel.hidden = true; panel.setAttribute('aria-label', 'Tweak and score');
  const pct = (id) => `<label><span>${id === 'R' ? 'Roll pair' : THRUSTERS.find(t => t.id === id).name} thrust <output id="wbo${id}"></output></span><input type="range" id="wbT${id}" min="50" max="150" step="1" value="100"></label>`;
  panel.innerHTML = `<h3>Scorecard</h3>
    <table><thead><tr><th>Target</th><th class="n">Was</th><th class="n">Now</th></tr></thead><tbody id="wbScore"></tbody></table>
    <h3>Battery</h3>
    <div class="two"><label><span>Pack</span><select id="wbCap">${Object.keys(BATTERIES).map(c => `<option value="${c}">${(+c).toLocaleString()} mAh · ${BATTERIES[c]} g</option>`).join('')}</select></label>
    <label><span>Station <output id="wboBx"></output></span><input type="range" id="wbBx" min="-73" max="16" step="1"></label></div>
    <h3>Thrust estimates</h3>${pct('F')}${pct('M')}${pct('R')}
    <h3>Tapped part</h3><div id="wbPart" class="mute">Tap a part in the model to change its mass or station.</div>
    <h3>Changes</h3><ul id="wbChanges"></ul>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="wbReset">Reset</button><button class="btn go" id="wbSave">Save as report</button></div>
    <div class="mute">Same sums as the analysis scorecard. Hover time is a rough estimate. The header chips above still show the drawn design.</div>`;
  document.body.append(panel);
  $('#wbCap').value = k.battCap;

  btn.onclick = () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-pressed', !panel.hidden); render(); };

  function changes() {
    const out = [];
    if (k.battCap !== base.battCap) out.push(`Battery ${k.battCap} mAh (${BATTERIES[k.battCap]} g)`);
    if (Math.round(k.battX) !== Math.round(base.battX)) out.push(`Battery station ${base.battX} → ${k.battX} mm`);
    for (const id of ['F', 'M', 'R']) if (Math.round(k.thrust[id]) !== Math.round(base.thrust[id])) out.push(`${id === 'R' ? 'Roll pair' : id === 'F' ? 'Lift fan' : 'Main fan'} thrust ${Math.round(base.thrust[id])} → ${Math.round(k.thrust[id])} g`);
    for (const [id, g] of Object.entries(k.mass)) if (g !== PART[id].mass) out.push(`${PART[id].name} mass ${PART[id].mass} → ${g} g`);
    for (const [id, x] of Object.entries(k.x)) if (x !== PART[id].cg[0]) out.push(`${PART[id].name} station x ${PART[id].cg[0]} → ${x} mm`);
    return out;
  }
  let lastSel;
  function render() {
    if (panel.hidden) return;
    if (T.state.battX !== k.battX) k.battX = T.state.battX;   // the main battery slider and this one are the same knob
    const S = score(k);
    $('#wbScore').innerHTML = Object.entries(TARGETS).map(([key, t]) => {
      const lim = t.min != null && t.max != null ? `${t.min}–${t.max}` : t.max != null ? `≤ ${t.max}` : `≥ ${t.min}`;
      const v = S[key], b = B[key];
      return `<tr><td>${t.label}<br><span class="mute">${lim} ${t.unit}</span></td><td class="n">${b == null ? '–' : fmt[key](b)}</td><td class="n"><span class="g ${grade(key, v)}">${v == null ? 'can’t hover' : fmt[key](v)}</span></td></tr>`;
    }).join('');
    $('#wbBx').value = k.battX; $('#wboBx').textContent = `${k.battX} mm`;
    for (const id of ['F', 'M', 'R']) { $('#wbT' + id).value = Math.round(100 * k.thrust[id] / base.thrust[id]); $('#wbo' + id).textContent = `${Math.round(k.thrust[id])} g`; }
    const sel = T.state.selected;
    if (sel !== lastSel) {
      lastSel = sel; const p = PART[sel];
      $('#wbPart').innerHTML = !p ? 'Tap a part in the model to change its mass or station.' : sel === 'battery' ? 'The battery is set above.' :
        `<b style="color:#e8eef4">${esc(p.name)}</b><div class="two" style="margin-top:6px"><label><span>Mass g</span><input type="number" id="wbM" step="1" min="0" value="${k.mass[sel] ?? p.mass}"></label><label><span>Station x mm</span><input type="number" id="wbX" step="1" value="${k.x[sel] ?? p.cg[0]}"></label></div>`;
      $('#wbM')?.addEventListener('input', e => { const v = +e.target.value; if (Number.isFinite(v) && v >= 0) { v === p.mass ? delete k.mass[sel] : k.mass[sel] = v; render(); } });
      $('#wbX')?.addEventListener('input', e => { const v = +e.target.value; if (Number.isFinite(v)) { v === p.cg[0] ? delete k.x[sel] : k.x[sel] = v; render(); } });
    }
    const ch = changes(); $('#wbChanges').innerHTML = ch.length ? ch.map(c => `<li>${esc(c)}</li>`).join('') : '<li class="mute">None yet: this is the design as drawn.</li>';
    $('#wbSave').disabled = !ch.length;
    return S;
  }
  $('#wbCap').onchange = e => { k.battCap = +e.target.value; render(); };
  $('#wbBx').oninput = e => { k.battX = T.state.battX = +e.target.value; T.apply(); render(); };
  for (const id of ['F', 'M', 'R']) $('#wbT' + id).oninput = e => { k.thrust[id] = base.thrust[id] * e.target.value / 100; render(); };
  $('#wbReset').onclick = () => { Object.assign(k, structuredClone(base)); T.state.battX = base.battX; T.apply(); lastSel = undefined; $('#wbCap').value = k.battCap; render(); };
  setInterval(render, 300);   // follows taps on the model and the main battery slider

  $('#wbSave').onclick = () => {
    const S = render(), R = window.__wbReport, ch = changes();
    const round = o => Object.fromEntries(Object.entries(o).map(([a, v]) => [a, typeof v === 'number' ? Math.round(v * 10) / 10 : v]));
    const pick = s => round({ mass: s.mass, cg: s.cg, margin: s.margin, hover: s.hover, stall: s.stall, time: s.time });
    T.render(); const image = R.shot(T.canvas, null, null), view = T.getView();
    R.openForm({ target: { type: 'tweak', changes: ch, knobs: { battCap: k.battCap, battX: k.battX, thrust: round(k.thrust), mass: k.mass, x: k.x }, before: pick(B), after: pick(S) },
      view, image, viewUrl: `index.html#view=${btoa(unescape(encodeURIComponent(JSON.stringify(view))))}`, title: 'Tweak: ', kind: 'suggestion',
      describe: ch.join(' · ') + ` → margin ${S.margin.toFixed(1)}%, hover fan ${S.hover == null ? 'none' : S.hover.toFixed(1) + '%'}, ${Math.round(S.mass)} g` });
  };
}
