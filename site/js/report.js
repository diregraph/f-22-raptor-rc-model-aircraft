// Workbench reporter: point at a part or a chart, write a note, and the report is saved into reports/open/ in the repo.
// Only switches on when the page is served by the local workbench (npm run bench). On the public site it does nothing.
const BENCH = await fetch('/api/ping', { cache: 'no-store' }).then(r => r.ok && r.json()).then(j => j?.bench === true).catch(() => false);
if (BENCH) start();

function start() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const isTwin = !!document.querySelector('canvas#c');
  const KIND = { error: ['Error', '#ff6b6b'], problem: ['Problem', '#ffb347'], suggestion: ['Suggestion', '#1fd1bd'] };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.head.insertAdjacentHTML('beforeend', `<style>
  .wb { --wb-bg: #0e151e; --wb-line: rgba(160,190,220,.18); --wb-ink: #e8eef4; --wb-mute: #8b9bab; --wb-acc: #ff7a1a; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--wb-ink); }
  #wbBar { position: fixed; right: max(14px, env(safe-area-inset-right)); bottom: ${isTwin ? '232px' : '16px'}; z-index: 20; display: flex; gap: 6px; }
  #wbBar button, .wb .btn { border: 1px solid var(--wb-line); background: var(--wb-bg); color: var(--wb-ink); border-radius: 999px; padding: 8px 14px; font: inherit; cursor: pointer; }
  #wbBar .go, .wb .btn.go { background: var(--wb-acc); border-color: var(--wb-acc); color: #1a0d00; font-weight: 600; }
  .wb .btn:focus-visible, #wbBar button:focus-visible { outline: 2px solid var(--wb-acc); outline-offset: 2px; }
  #wbHint { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 21; background: var(--wb-acc); color: #1a0d00; font-weight: 600; padding: 8px 16px; border-radius: 999px; box-shadow: 0 6px 24px rgba(0,0,0,.4); }
  body.wb-pick, body.wb-pick canvas, body.wb-pick main * { cursor: crosshair !important; }
  .wb-modal { position: fixed; inset: 0; z-index: 30; background: rgba(5,9,14,.62); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .wb-card { background: var(--wb-bg); border: 1px solid var(--wb-line); border-radius: 14px; width: min(560px, 100%); max-height: calc(100% - 32px); overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .wb-card h3 { margin: 0; font-size: 16px; } .wb .mute { color: var(--wb-mute); font-size: 12.5px; }
  .wb-card img { width: 100%; border-radius: 8px; border: 1px solid var(--wb-line); }
  .wb-kinds { display: flex; gap: 6px; flex-wrap: wrap; } .wb-kinds label { border: 1px solid var(--wb-line); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
  .wb-kinds input { position: absolute; opacity: 0; pointer-events: none; } .wb-kinds label:has(input:checked) { background: var(--k); border-color: var(--k); color: #10161d; font-weight: 600; }
  .wb-kinds label:has(input:focus-visible) { outline: 2px solid var(--wb-acc); outline-offset: 2px; }
  .wb input[type=text], .wb textarea { width: 100%; box-sizing: border-box; background: #0a1017; color: var(--wb-ink); border: 1px solid var(--wb-line); border-radius: 8px; padding: 8px 10px; font: inherit; }
  .wb textarea { min-height: 96px; resize: vertical; } .wb-row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .wb-err { color: #ff6b6b; font-size: 13px; min-height: 1em; }
  .wb-list { display: flex; flex-direction: column; gap: 8px; } .wb-item { display: grid; grid-template-columns: 96px 1fr; gap: 10px; border: 1px solid var(--wb-line); border-radius: 10px; padding: 8px; align-items: start; }
  .wb-item img { width: 96px; border-radius: 6px; } .wb-item .noimg { width: 96px; height: 60px; border-radius: 6px; border: 1px dashed var(--wb-line); }
  .wb-item b { display: block; } .wb-badge { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--k); margin-right: 6px; }
  .wb-item a { color: #7db4f5; font-size: 12.5px; } .wb-item.closed { opacity: .55; }
  #wbToast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 40; background: #1a2430; border: 1px solid var(--wb-line); padding: 8px 14px; border-radius: 10px; }
  @media (max-width: 900px) { #wbBar { bottom: ${isTwin ? 'calc(62px + env(safe-area-inset-bottom))' : '16px'}; } }
  </style>`);

  const bar = document.createElement('div'); bar.id = 'wbBar'; bar.className = 'wb';
  bar.innerHTML = '<button class="go" id="wbReport" title="Point at something to report it">Report</button><button id="wbList">Reports</button>';
  document.body.append(bar);
  const $r = s => document.querySelector(s);
  const toast = msg => { $r('#wbToast')?.remove(); const t = document.createElement('div'); t.id = 'wbToast'; t.className = 'wb'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 3200); };
  refreshCount();

  // ---- pick mode: the next tap chooses what the report is about
  let picking = false, downAt = null;
  function setPick(on) {
    picking = on; window.__reportMode = on; document.body.classList.toggle('wb-pick', on);
    $r('#wbHint')?.remove();
    if (on) { const h = document.createElement('div'); h.id = 'wbHint'; h.className = 'wb'; h.textContent = isTwin ? 'Tap the part or spot to report · Esc cancels' : 'Tap the chart, number or text to report · Esc cancels'; document.body.append(h); }
    $r('#wbReport').textContent = on ? 'Cancel' : 'Report';
  }
  $r('#wbReport').onclick = () => setPick(!picking);
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (picking) setPick(false); else $r('.wb-modal')?.remove(); } });

  if (isTwin) {
    const cv = document.querySelector('canvas#c');
    cv.addEventListener('pointerdown', e => { if (picking) downAt = [e.clientX, e.clientY]; }, true);
    cv.addEventListener('pointerup', e => {
      if (!picking || !downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
      if (moved > 6) return;   // that was an orbit drag, keep waiting for a tap
      e.stopImmediatePropagation(); setPick(false); twinPicked(e);
    }, true);
  } else {
    document.addEventListener('click', e => {
      if (!picking || e.target.closest('.wb')) return;
      e.preventDefault(); e.stopPropagation(); setPick(false); pagePicked(e);
    }, true);
  }

  async function twinPicked(e) {
    const T = window.__twin; if (!T) return toast('The 3D model is still loading.');
    const hit = T.pickHit(e), view = { ...T.getView(), selected: hit ? hit.id : null };
    const name = hit ? (await import('./spec.js')).PART[hit.id]?.name || hit.id : null;
    T.select(hit ? hit.id : null);   // highlight the reported part so it stands out in the screenshot
    T.render();   // fresh frame, then read it straight back
    const r = T.canvas.getBoundingClientRect();
    const image = shot(T.canvas, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    const target = hit ? { type: 'part', id: hit.id, name, point: hit.point } : { type: 'space', note: 'No part under the tap' };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(view))));
    openForm({ target, view, image, viewUrl: `index.html#view=${b64}`, title: name ? `${name}: ` : '', describe: hit ? `${name} · part ${hit.id} · point x ${hit.point[0]}, y ${hit.point[1]}, z ${hit.point[2]} mm` : 'Empty space (no part under the tap)' });
  }

  async function pagePicked(e) {
    const el = e.target, chart = el.closest('.chart'), section = sectionOf(el);
    let image = null, value = null;
    if (chart) {
      const svg = chart.querySelector('svg');
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));   // phones never hover: ask the chart for its tooltip at the tap
      const tip = chart.querySelector('.tip'); value = tip && tip.style.display !== 'none' ? tip.innerText.split('\n').map(s => s.trim()).filter(Boolean).join(' · ') : null;
      const r = svg.getBoundingClientRect(); image = await svgShot(svg, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    } else if (el.tagName === 'CANVAS') {
      const r = el.getBoundingClientRect(); try { image = shot(el, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); } catch { /* tainted canvas */ }
    }
    const text = (el.closest('tr, .tile, .card, p, li, td') || el).innerText?.replace(/\s+/g, ' ').trim().slice(0, 400) || '';
    const chartName = chart ? chart.querySelector('svg')?.getAttribute('aria-label') : null;
    const target = { type: chart ? 'chart' : 'text', section: section.title, chart: chartName, value, text: chart ? undefined : text };
    const anchor = section.id ? '#' + section.id : '';
    openForm({ target, view: { scrollY: Math.round(scrollY) }, image, viewUrl: page + anchor, title: section.title ? `${section.title}: ` : '',
      describe: [section.title, chartName, value || (!chart && text.slice(0, 120))].filter(Boolean).join(' · ') });
  }

  function sectionOf(el) {   // nearest heading above the tapped element, and the closest id to link back to
    const hs = [...document.querySelectorAll('h2, h3')].filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(el));
    const h2 = hs.filter(h => h.tagName === 'H2').pop(), h = hs.pop();
    const title = [h2?.innerText, h && h !== h2 ? h.innerText : null].filter(Boolean).join(' / ').trim();
    const anchors = [...document.querySelectorAll('nav a[href^="#"]')].map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);   // the page's own section links
    const before = anchors.filter(x => x.contains(el) || x.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { title, id: h2?.id || before.pop()?.id || '' };
  }

  // ---- screenshots: JPEG at most 1280 px wide, with an orange pin where the tap was
  function pin(ctx, x, y, s) {
    ctx.lineWidth = 3 * s; ctx.strokeStyle = '#1a0d00'; ctx.beginPath(); ctx.arc(x, y, 15 * s, 0, 7); ctx.stroke();
    ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 15 * s, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 4 * s, 0, 7); ctx.fill();
  }
  function toJpeg(src, w, h, fx, fy, bg) {
    const k = Math.min(1, 1280 / w), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
    pin(ctx, fx * c.width, fy * c.height, Math.max(1, c.width / 900)); return c.toDataURL('image/jpeg', 0.8);
  }
  function shot(canvas, fx, fy) { return toJpeg(canvas, canvas.width, canvas.height, fx, fy, getComputedStyle(document.body).backgroundColor || '#0a0f15'); }
  async function svgShot(svg, fx, fy) {   // inline the CSS variables the chart uses, then rasterise
    const cs = getComputedStyle(svg), vb = svg.viewBox.baseVal, scale = 2, w = (vb?.width || svg.clientWidth) * scale, h = (vb?.height || svg.clientHeight) * scale;
    const src = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#888')
      .replace('<svg', `<svg width="${w}" height="${h}" font-family="system-ui, sans-serif"`);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    try { await img.decode(); } catch { return null; }
    const card = svg.closest('.card'), bg = card ? getComputedStyle(card).backgroundColor : getComputedStyle(document.body).backgroundColor;
    return toJpeg(img, w, h, fx, fy, bg || '#0e151e');
  }

  // ---- the report form
  function openForm({ target, view, image, viewUrl, title, describe }) {
    const m = document.createElement('div'); m.className = 'wb wb-modal';
    m.innerHTML = `<form class="wb-card" novalidate>
      <h3>New report</h3><div class="mute">${esc(describe)}</div>
      ${image ? `<img alt="Screenshot of the reported spot" src="${image}">` : '<div class="mute">No screenshot for this spot; the text above is saved instead.</div>'}
      <div class="wb-kinds" role="radiogroup" aria-label="Kind">${Object.entries(KIND).map(([k, [n, c]], i) => `<label style="--k:${c}"><input type="radio" name="kind" id="wbKind-${k}" value="${k}" ${i === 1 ? 'checked' : ''}>${n}</label>`).join('')}</div>
      <input type="text" id="wbTitle" name="title" maxlength="140" placeholder="Short title" value="${esc(title)}" aria-label="Title">
      <textarea id="wbNote" name="note" placeholder="What is wrong, or what would you change? Numbers welcome." aria-label="Note"></textarea>
      <div class="wb-err" role="alert"></div>
      <div class="wb-row"><button type="button" class="btn" data-x>Cancel</button><button type="submit" class="btn go">Save report</button></div></form>`;
    document.body.append(m);
    const f = m.querySelector('form'), t = f.querySelector('#wbTitle'); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = f.querySelector('.wb-err'), btn = f.querySelector('.go');
      if (!t.value.trim() || t.value.trim() === title.trim()) { err.textContent = 'Add a few words to the title.'; return t.focus(); }
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: f.kind.value, title: t.value, note: f.note.value, page, target, view, viewUrl, image }) });
        const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not save.');
        m.remove(); toast(`Saved to ${j.path}`); refreshCount();
      } catch (x) { err.textContent = x.message.includes('fetch') ? 'The workbench server is not answering. Is npm run bench still running?' : x.message; btn.disabled = false; btn.textContent = 'Save report'; }
    });
  }

  // ---- list of reports
  async function refreshCount() {
    try { const all = await (await fetch('/api/reports', { cache: 'no-store' })).json(); const n = all.filter(r => r.status === 'open').length; $r('#wbList').textContent = `Reports (${n})`; return all; } catch { return []; }
  }
  $r('#wbList').onclick = async () => {
    const all = await refreshCount(), m = document.createElement('div'); m.className = 'wb wb-modal';
    const item = r => { const [n, c] = KIND[r.kind] || [r.kind, '#888'], t = r.target || {};
      const where = t.type === 'part' ? `${t.name} (${t.id})` : t.type === 'chart' ? [t.section, t.value].filter(Boolean).join(' · ') : t.section || r.page;
      return `<div class="wb-item ${r.status}">${r.imageUrl ? `<img alt="" src="${r.imageUrl}">` : '<div class="noimg"></div>'}<div><span class="wb-badge" style="--k:${c}">${n}</span><span class="mute">${r.status === 'closed' ? 'closed · ' : ''}${new Date(r.created).toLocaleString()}</span>
        <b>${esc(r.title)}</b><div class="mute">${esc(where)}</div>${r.note ? `<div style="font-size:13px;margin-top:4px">${esc(r.note.slice(0, 220))}</div>` : ''}${r.resolution ? `<div class="mute" style="margin-top:4px">Fix: ${esc(r.resolution)}</div>` : ''}
        ${r.viewUrl ? `<a href="${esc(r.viewUrl)}" data-view="${esc(r.viewUrl)}">Open this view</a>` : ''}</div></div>`; };
    const open = all.filter(r => r.status === 'open'), closed = all.filter(r => r.status === 'closed');
    m.innerHTML = `<div class="wb-card"><h3>Reports</h3><div class="mute">${open.length} open, ${closed.length} closed. Saved in reports/ in the repo. Ask Claude to "work the reports" to fix the open ones.</div>
      <div class="wb-list">${open.map(item).join('') || '<div class="mute">No open reports.</div>'}</div>
      ${closed.length ? `<details><summary class="mute">Closed (${closed.length})</summary><div class="wb-list" style="margin-top:8px">${closed.map(item).join('')}</div></details>` : ''}
      <div class="wb-row"><button type="button" class="btn" data-x>Close</button></div></div>`;
    document.body.append(m);
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-x]')) return m.remove();
      const a = e.target.closest('a[data-view]'); if (!a) return;
      const [p, hash] = a.dataset.view.split('#'); if ((p || 'index.html') !== page) return;   // other page: let the link navigate
      e.preventDefault(); m.remove(); if (hash) { location.hash = ''; location.hash = hash; }
    });
  };
}
