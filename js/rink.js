// Handwriting on PDF pages (stylus, mouse or finger): pen, highlighter, eraser, undo.
// One 'rink' item per document page: { id: `${docId}_${page}`, docId, page, strokes: [{ id, t, c, w, p }] }
//   t  'pen' | 'hl' (highlighter)    c  colour    w  width as 1/1000 of the page width
//   p  points "x,y x,y …" in 1/10000 of the page width / height, so they fit any zoom or screen.
// Drawing is in the Page view only. With a stylus, the pen draws and a finger scrolls (palm-friendly).
import { R } from './rlib.js';

export const INK_COLORS = ['#1d1b22', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899'];
const WIDTHS = { pen: [1.6, 2.8, 4.5], hl: [10, 16, 24] };
const LS = 'pb.ink';
export const inkPrefs = () => { try { return { tool: 'pen', color: '#2563eb', size: 1, finger: false, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { tool: 'pen', color: '#2563eb', size: 1, finger: false }; } };
const saveInkPrefs = (p) => { try { localStorage.setItem(LS, JSON.stringify({ ...inkPrefs(), ...p })); } catch {} };
export const inkOf = (docId, page) => R.S.get('rink', `${docId}_${page}`);
export const inkPagesOf = (docId) => R.S.all('rink').filter((x) => x.docId === docId && x.strokes?.length);

const parse = (p) => p.split(' ').map((xy) => xy.split(',').map(Number));
function simplify(pts, eps) { // Ramer–Douglas–Peucker
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(b[1] - a[1], b[0] - a[0]) || 1);
    if (d > dmax) { dmax = d; idx = i; }
  }
  return dmax > eps ? [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)] : [a, b];
}
const pathD = (pts) => (pts.length === 1 ? `M${pts[0][0]} ${pts[0][1]}h0.01` : 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L'));

export function paintInk(st, n) {
  const el = st.root.querySelector(`.rpage[data-page="${n}"]`);
  if (!el) return;
  let svg = el.querySelector('svg.ink-layer');
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ink-layer no-anchor'); el.appendChild(svg); }
  const W = el.clientWidth, H = el.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const item = inkOf(st.doc.id, n);
  svg.innerHTML = (item?.strokes || []).map((s) => `<path data-sid="${s.id}" d="${pathD(parse(s.p).map(([x, y]) => [(x / 10000) * W, (y / 10000) * H]))}" stroke="${s.c}" stroke-width="${((s.w / 1000) * W).toFixed(2)}" class="${s.t === 'hl' ? 'ink-hl' : 'ink-pen'}"/>`).join('');
}

export function inkBarHTML() {
  const p = inkPrefs();
  return `<div class="rd-inkbar" id="rdInk" hidden>
    <div class="seg">${[['pen', '✒️', 'Pen'], ['hl', '🖍️', 'Highlighter'], ['eraser', '⌫', 'Eraser']].map(([k, i, l]) => `<button data-ract="inktool" data-v="${k}" class="${p.tool === k ? 'on' : ''}" title="${l}" aria-label="${l}">${i}</button>`).join('')}</div>
    <span class="ink-colors">${INK_COLORS.map((c) => `<button data-ract="inkcolor" data-v="${c}" style="background:${c}" class="${p.color === c ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('')}</span>
    <div class="seg">${[0, 1, 2].map((k) => `<button data-ract="inksize" data-v="${k}" class="${p.size === k ? 'on' : ''}" title="${['Thin', 'Medium', 'Thick'][k]}"><i class="ink-dot" style="width:${4 + k * 4}px;height:${4 + k * 4}px"></i></button>`).join('')}</div>
    <button class="icon-btn" data-ract="inkundo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
    <label class="check-line small" title="Off: a stylus draws and a finger scrolls. On: a finger draws too."><input type="checkbox" data-rchange="inkfinger" ${p.finger ? 'checked' : ''}> Finger draws</label>
    <button class="btn sm primary" data-ract="draw">Done</button>
  </div>`;
}

/* ---------- drawing ---------- */
export function wireInk(st) {
  const sc = st.scroll;
  let cur = null, pan = null;
  const pageAt = (e) => e.target.closest?.('.rpage');
  sc.addEventListener('pointerdown', (e) => {
    if (!st.drawing || st.mode !== 'pdf') return;
    const pg = pageAt(e);
    if (!pg) return;
    const p = inkPrefs();
    // A finger scrolls while drawing (unless "finger draws" is on); a pen or mouse draws.
    if (e.pointerType === 'touch' && !p.finger) { pan = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    e.preventDefault();
    try { pg.setPointerCapture(e.pointerId); } catch {}
    const erasing = p.tool === 'eraser' || (e.buttons & 32) === 32;
    const box = pg.getBoundingClientRect();
    cur = { pg, n: +pg.dataset.page, box, erasing, pts: [], id: e.pointerId, path: null, removed: new Set() };
    if (!erasing) {
      const svg = pg.querySelector('svg.ink-layer') || (paintInk(st, cur.n), pg.querySelector('svg.ink-layer'));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const W = box.width, wv = WIDTHS[p.tool === 'hl' ? 'hl' : 'pen'][p.size] * (e.pointerType === 'pen' ? 0.6 + (e.pressure || 0.5) * 0.8 : 1);
      path.setAttribute('stroke', p.tool === 'hl' && p.color === '#1d1b22' ? '#f59e0b' : p.color);
      path.setAttribute('stroke-width', ((wv / 1000) * W * 1.6).toFixed(2));
      path.setAttribute('class', p.tool === 'hl' ? 'ink-hl' : 'ink-pen');
      svg.appendChild(path);
      cur.path = path; cur.tool = p.tool === 'hl' ? 'hl' : 'pen'; cur.color = path.getAttribute('stroke'); cur.w = +(wv * 1.6).toFixed(2);
    }
    addPoint(e);
  });
  const addPoint = (e) => {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const x = ev.clientX - cur.box.left, y = ev.clientY - cur.box.top;
      if (cur.erasing) { eraseAt(x, y); continue; }
      cur.pts.push([x, y]);
    }
    if (cur.path) cur.path.setAttribute('d', pathD(cur.pts));
  };
  const eraseAt = (x, y) => {
    for (const path of cur.pg.querySelectorAll('svg.ink-layer path[data-sid]')) {
      if (cur.removed.has(path.dataset.sid)) continue;
      const len = path.getTotalLength(), step = Math.max(2, len / 200);
      for (let d = 0; d <= len; d += step) { const pt = path.getPointAtLength(d); if (Math.hypot(pt.x - x, pt.y - y) < 12) { cur.removed.add(path.dataset.sid); path.style.opacity = '0.15'; break; } }
    }
  };
  sc.addEventListener('pointermove', (e) => {
    if (pan && e.pointerId === pan.id) { if (st.pinching) return; sc.scrollTop -= e.clientY - pan.y; sc.scrollLeft -= e.clientX - pan.x; pan.x = e.clientX; pan.y = e.clientY; return; }
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    addPoint(e);
  });
  const end = (e) => {
    if (pan && e.pointerId === pan.id) { pan = null; return; }
    if (!cur || e.pointerId !== cur.id) return;
    const c = cur; cur = null;
    const key = `${st.doc.id}_${c.n}`;
    const item = R.S.get('rink', key) || { id: key, docId: st.doc.id, page: c.n, strokes: [] };
    if (c.erasing) {
      if (c.removed.size) { R.S.put('rink', { ...item, strokes: item.strokes.filter((s) => !c.removed.has(s.id)) }); st.inkUndo.push({ key, add: item.strokes.filter((s) => c.removed.has(s.id)) }); }
      return;
    }
    if (!c.pts.length) { c.path?.remove(); return; }
    const W = c.box.width, H = c.box.height;
    const pts = simplify(c.pts, 0.6).map(([x, y]) => `${Math.round((x / W) * 10000)},${Math.round((y / H) * 10000)}`).join(' ');
    const s = { id: R.S.uid(), t: c.tool, c: c.color, w: +c.w.toFixed(2), p: pts };
    R.S.put('rink', { ...item, strokes: [...item.strokes, s] });
    st.inkUndo.push({ key, remove: s.id });
  };
  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', end);
}

export function inkUndo(st) {
  const u = st.inkUndo.pop();
  if (!u) { R.toast('Nothing to undo'); return; }
  const item = R.S.get('rink', u.key);
  if (!item) return;
  if (u.remove) R.S.put('rink', { ...item, strokes: item.strokes.filter((s) => s.id !== u.remove) });
  if (u.add) R.S.put('rink', { ...item, strokes: [...item.strokes, ...u.add] });
}
export const INK_SET = {
  inktool: (st, b) => { saveInkPrefs({ tool: b.dataset.v }); refreshBar(st); },
  inkcolor: (st, b) => { saveInkPrefs({ color: b.dataset.v, tool: inkPrefs().tool === 'eraser' ? 'pen' : inkPrefs().tool }); refreshBar(st); },
  inksize: (st, b) => { saveInkPrefs({ size: +b.dataset.v }); refreshBar(st); },
  inkundo: (st) => inkUndo(st),
};
export const setFinger = (on) => saveInkPrefs({ finger: on });
function refreshBar(st) {
  const bar = st.root.querySelector('#rdInk');
  if (!bar) return;
  const hidden = bar.hidden;
  bar.outerHTML = inkBarHTML();
  st.root.querySelector('#rdInk').hidden = hidden;
}

// For the annotated-PDF export: strokes as PDF Ink annotations.
export function inkAnnotations(docId) {
  return inkPagesOf(docId).map((it) => ({ page: it.page, strokes: it.strokes.map((s) => ({ ...s, pts: parse(s.p).map(([x, y]) => [x / 10000, y / 10000]) })) }));
}
