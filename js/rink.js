// Mark mode on PDF pages (stylus, mouse or finger): Pen, Marker, Highlight text, Eraser, one Undo.
// Handwriting is one 'rink' item per document page: { id: `${docId}_${page}`, docId, page, strokes: [{ id, t, c, w, p }] }
//   t  'pen' | 'hl' (marker)    c  colour    w  width as 1/1000 of the page width
//   p  points "x,y x,y …" in 1/10000 of the page width / height, so they fit any zoom or screen.
// Text highlights made here are ordinary highlights (rnotes); the reader makes them via st.markText.
// The eraser removes any mark it touches: pen, marker, text highlights and underlines. Undo brings it back.
// Hands: a stylus or mouse marks; one finger scrolls; two fingers zoom; a palm (or any touch while the
// stylus is down) is ignored, and a scroll the palm started is put back when the stylus lands.
import { R, COLORS } from './rlib.js';

export const INK_COLORS = ['#1d1b22', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899'];
const WIDTHS = { pen: [1.6, 2.8, 4.5], marker: [10, 16, 24] };
const TOOLS = [['pen', '✒️', 'Pen'], ['marker', '🖍️', 'Marker'], ['text', '🟨', 'Highlight text'], ['eraser', '🧽', 'Eraser']];
const LS = 'pb.ink';
const DEF = { tool: 'pen', color: '#2563eb', hcolor: 'yellow', size: 1, finger: false };
export const inkPrefs = () => { try { const p = { ...DEF, ...JSON.parse(localStorage.getItem(LS) || '{}') }; if (p.tool === 'hl') p.tool = 'marker'; return p; } catch { return { ...DEF }; } };
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

/* ---------- the Mark bar ---------- */
export function inkBarHTML() {
  const p = inkPrefs();
  const opts = p.tool === 'eraser' ? '<span class="mk-hint">Swipe over any pen, marker or highlight to erase it</span>'
    : p.tool === 'text' ? `<span class="mk-colors">${Object.entries(COLORS).map(([k, c]) => `<button data-ract="inkhcolor" data-v="${k}" style="background:${c}" class="${p.hcolor === k ? 'on' : ''}" aria-label="${k}"></button>`).join('')}</span><span class="mk-hint">Drag across the words</span>`
    : `<span class="mk-colors">${INK_COLORS.map((c) => `<button data-ract="inkcolor" data-v="${c}" style="background:${c}" class="${p.color === c ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('')}</span>
       <span class="mk-sizes">${[0, 1, 2].map((k) => `<button data-ract="inksize" data-v="${k}" class="${p.size === k ? 'on' : ''}" aria-label="${['Thin', 'Medium', 'Thick'][k]}"><i class="ink-dot" style="width:${4 + k * 4}px;height:${4 + k * 4}px"></i></button>`).join('')}</span>`;
  return `<div class="rd-markbar" id="rdInk" hidden>
    <div class="mk-tools">${TOOLS.map(([k, i, l]) => `<button data-ract="inktool" data-v="${k}" class="mk-tool ${p.tool === k ? 'on' : ''}"><b>${i}</b><span>${l}</span></button>`).join('')}</div>
    <div class="mk-row">${opts}
      <label class="mk-finger" title="Off: only the stylus or mouse marks, a finger scrolls. On: a finger marks too."><input type="checkbox" data-rchange="inkfinger" ${p.finger ? 'checked' : ''}> Finger marks</label>
      <span class="spacer"></span>
      <button class="mk-btn" data-ract="inkundo" title="Undo (Ctrl+Z)"><b>↶</b><span>Undo</span></button>
      <button class="mk-btn done" data-ract="draw"><span>Done</span></button>
    </div>
  </div>`;
}
export function setToolClass(st) {
  const t = inkPrefs().tool;
  for (const [k] of TOOLS) st.root.classList.toggle(`tool-${k}`, st.drawing && t === k);
}
function refreshBar(st) {
  const bar = st.root.querySelector('#rdInk');
  if (!bar) return;
  const hidden = bar.hidden;
  bar.outerHTML = inkBarHTML();
  st.root.querySelector('#rdInk').hidden = hidden;
  setToolClass(st);
}

/* ---------- pointer handling ---------- */
export function wireInk(st) {
  const sc = st.scroll;
  let cur = null, pan = null;
  const isPalm = (e) => e.pointerType === 'touch' && (e.width > 44 || e.height > 44);
  sc.addEventListener('pointerdown', (e) => {
    if (!st.drawing || st.mode !== 'pdf') return;
    const p = inkPrefs();
    if (e.pointerType === 'touch' && !p.finger) {
      // A finger scrolls — unless the stylus is down (palm) or the contact is palm-sized.
      if (st.penDown || isPalm(e) || pan) return;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, top: sc.scrollTop, left: sc.scrollLeft };
      return;
    }
    if (e.pointerType === 'pen') {
      st.penDown = true;
      // The palm touched first and nudged the page: put it back.
      if (pan) { sc.scrollTop = pan.top; sc.scrollLeft = pan.left; pan = null; }
    }
    const pg = e.target.closest?.('.rpage');
    if (!pg || cur) return;
    e.preventDefault();
    try { pg.setPointerCapture(e.pointerId); } catch {}
    const tool = (e.buttons & 32) === 32 ? 'eraser' : p.tool;
    const box = pg.getBoundingClientRect();
    cur = { pg, n: +pg.dataset.page, box, tool, id: e.pointerId, pts: [], path: null, removed: new Set(), notes: new Set() };
    if (tool === 'text') { if (st.markText?.('start', e, pg) === false) cur = null; return; }
    if (tool === 'pen' || tool === 'marker') {
      const svg = pg.querySelector('svg.ink-layer') || (paintInk(st, cur.n), pg.querySelector('svg.ink-layer'));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const wv = WIDTHS[tool][p.size] * (e.pointerType === 'pen' && e.pressure ? 0.6 + e.pressure * 0.8 : 1);
      cur.color = tool === 'marker' && p.color === '#1d1b22' ? '#f59e0b' : p.color;
      cur.w = wv;
      path.setAttribute('stroke', cur.color);
      path.setAttribute('stroke-width', ((wv / 1000) * box.width).toFixed(2));
      path.setAttribute('class', tool === 'marker' ? 'ink-hl' : 'ink-pen');
      svg.appendChild(path);
      cur.path = path;
    }
    addPoint(e);
  });
  const addPoint = (e) => {
    const evs = e.getCoalescedEvents?.() || [];
    for (const ev of evs.length ? evs : [e]) {
      if (cur.tool === 'eraser') { eraseAt(ev.clientX, ev.clientY); continue; }
      cur.pts.push([ev.clientX - cur.box.left, ev.clientY - cur.box.top]);
    }
    if (cur.path) cur.path.setAttribute('d', pathD(cur.pts));
  };
  // Erase pen / marker strokes and text highlights under the eraser.
  const eraseAt = (cx, cy) => {
    const x = cx - cur.box.left, y = cy - cur.box.top, R0 = 12;
    for (const path of cur.pg.querySelectorAll('svg.ink-layer path[data-sid]')) {
      if (cur.removed.has(path.dataset.sid)) continue;
      const len = path.getTotalLength(), step = Math.max(2, len / 200);
      for (let d = 0; d <= len; d += step) { const pt = path.getPointAtLength(d); if (Math.hypot(pt.x - x, pt.y - y) < R0 + (+path.getAttribute('stroke-width') || 0) / 2) { cur.removed.add(path.dataset.sid); path.style.opacity = '0.12'; break; } }
    }
    for (const hl of cur.pg.querySelectorAll('.hlr[data-nid]')) {
      const r = hl.getBoundingClientRect();
      if (cx >= r.left - R0 && cx <= r.right + R0 && cy >= r.top - R0 && cy <= r.bottom + R0) {
        cur.notes.add(hl.dataset.nid);
        cur.pg.querySelectorAll(`.hlr[data-nid="${hl.dataset.nid}"], .hl-pin[data-nid="${hl.dataset.nid}"]`).forEach((h) => { h.style.opacity = '0.12'; });
      }
    }
  };
  sc.addEventListener('pointermove', (e) => {
    if (pan && e.pointerId === pan.id) {
      if (st.pinching || st.penDown) return;
      sc.scrollTop -= e.clientY - pan.y; sc.scrollLeft -= e.clientX - pan.x;
      pan.x = e.clientX; pan.y = e.clientY;
      return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    if (cur.tool === 'text') { st.markText?.('move', e, cur.pg); return; }
    addPoint(e);
  });
  const end = (e) => {
    if (e.pointerType === 'pen') st.penDown = false;
    if (pan && e.pointerId === pan.id) { pan = null; return; }
    if (!cur || e.pointerId !== cur.id) return;
    const c = cur;
    cur = null;
    if (c.tool === 'text') { const note = st.markText?.('end', e, c.pg); if (note) st.inkUndo.push({ noteRemove: note.id }); return; }
    const key = `${st.doc.id}_${c.n}`;
    const item = R.S.get('rink', key) || { id: key, docId: st.doc.id, page: c.n, strokes: [] };
    if (c.tool === 'eraser') {
      const undo = {};
      if (c.removed.size) {
        undo.key = key; undo.add = item.strokes.filter((s) => c.removed.has(s.id));
        R.S.put('rink', { ...item, strokes: item.strokes.filter((s) => !c.removed.has(s.id)) });
      }
      if (c.notes.size) {
        undo.notesAdd = [...c.notes].map((id) => R.S.get('rnotes', id)).filter(Boolean);
        for (const n of undo.notesAdd) R.S.remove('rnotes', n);
      }
      const k = (undo.add?.length || 0) + (undo.notesAdd?.length || 0);
      if (k) { st.inkUndo.push(undo); R.toast(`Erased ${k} mark${k > 1 ? 's' : ''} — Undo brings ${k > 1 ? 'them' : 'it'} back`); }
      return;
    }
    if (!c.pts.length) { c.path?.remove(); return; }
    const W = c.box.width, H = c.box.height;
    const pts = simplify(c.pts, 0.6).map(([x, y]) => `${Math.round((x / W) * 10000)},${Math.round((y / H) * 10000)}`).join(' ');
    const s = { id: R.S.uid(), t: c.tool === 'marker' ? 'hl' : 'pen', c: c.color, w: +c.w.toFixed(2), p: pts };
    R.S.put('rink', { ...item, strokes: [...item.strokes, s] });
    st.inkUndo.push({ key, remove: s.id });
  };
  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', end);
}

// One undo for every kind of mark: pen / marker strokes, text highlights made in Mark mode, and erasing.
export function inkUndo(st) {
  const u = st.inkUndo.pop();
  if (!u) { R.toast('Nothing to undo'); return; }
  if (u.noteRemove) { const n = R.S.get('rnotes', u.noteRemove); if (n) R.S.remove('rnotes', n); }
  if (u.notesAdd?.length) R.S.putMany('rnotes', u.notesAdd.map(({ _b, ...n }) => n));
  if (u.key) {
    const item = R.S.get('rink', u.key);
    if (item && u.remove) R.S.put('rink', { ...item, strokes: item.strokes.filter((s) => s.id !== u.remove) });
    if (item && u.add) R.S.put('rink', { ...item, strokes: [...item.strokes, ...u.add] });
  }
}
export const INK_SET = {
  inktool: (st, b) => { saveInkPrefs({ tool: b.dataset.v }); refreshBar(st); },
  inkcolor: (st, b) => { saveInkPrefs({ color: b.dataset.v }); refreshBar(st); },
  inkhcolor: (st, b) => { saveInkPrefs({ hcolor: b.dataset.v }); refreshBar(st); },
  inksize: (st, b) => { saveInkPrefs({ size: +b.dataset.v }); refreshBar(st); },
  inkundo: (st) => inkUndo(st),
};
export const setFinger = (on) => saveInkPrefs({ finger: on });
