// The reader: a full-screen layer over Playbook (#/read/<docId>). Two views of the same document:
//   "Page"  the original PDF pages (pdf.js canvas + selectable text layer), for tables, charts and layout
//   "Text"  the reflowed text (headings, paragraphs, lists) with your font, size, spacing and theme
// Position, highlights and notes are saved to the person's account and follow them to every device.
import {
  R, getDoc, progOf, notesOf, readerPrefs, saveReaderPrefs, COLORS, deviceId, pdfjs, fileBytes, textOf, findQuote, selectionAnchor, markRange,
  addReading, flushStats, runOcr, notesMarkdown, notesText, printNotes, annotatedPdf, takeJump,
} from './rlib.js';
import { aiPanelHTML, AI_ACTS, aiWire } from './rai.js';

let st = null; // the open reader
export const readerState = () => st;
const $r = (sel) => st?.root.querySelector(sel);
const esc = (s) => R.esc(s);
const ic = (n, s) => R.ic(n, s);
const THEMES = { light: ['#ffffff', '#1d1b22'], sepia: ['#f6efe0', '#3b3226'], dark: ['#1e1c24', '#e6e2ee'], night: ['#000000', '#bdb8c8'] };
const FONTS = { serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif", sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", readable: "Verdana, 'Atkinson Hyperlegible', Tahoma, sans-serif", mono: "ui-monospace, Consolas, monospace" };
const MARGINS = { narrow: 760, normal: 680, wide: 580 };

/* ---------- open / close (driven by the route) ---------- */
export function syncReader(route) {
  const m = route.match(/^read\/([^/?]+)/);
  if (m) { if (!st || st.id !== m[1]) openReader(m[1]); else if (!st.doc) tryLoad(); }
  else if (st) closeReader();
}
function closeReader() {
  if (!st || st.closing) return;
  // Saving below re-renders the app, which calls syncReader again: don't close twice.
  st.closing = true;
  commitPosition(true);
  flushStats();
  clearInterval(st.tick);
  st.io?.disconnect(); st.fio?.disconnect();
  st.unsub?.();
  try { st.pdf?.destroy(); } catch {}
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  st.root.remove();
  document.body.classList.remove('reading');
  st = null;
}

function openReader(id) {
  if (st) closeReader();
  const root = document.createElement('div');
  root.id = 'reader';
  root.className = 'rd';
  document.body.appendChild(root);
  document.body.classList.add('reading');
  st = { id, root, doc: null, text: null, mode: null, page: 1, frac: 0, pinned: false, saved: null, seenPages: new Set(), rendered: new Map(), filled: new Set(), panel: null, lastActivity: Date.now(), sel: null };
  root.innerHTML = `<div class="rd-loading">${ic('book', 28)}<p>Opening…</p></div>`;
  wireRoot(root);
  st.unsub = R.S.onChange(onData);
  tryLoad();
}

// Each await below re-checks that this reader is still the open one: switching documents quickly
// must not let the previous document finish loading into the new reader.
async function tryLoad() {
  const me = st;
  if (!me || me.loading) return;
  const d = getDoc(me.id);
  if (!d) {
    if (R.S.status.user && R.S.status.connected !== false && Date.now() - (st.waitSince ||= Date.now()) > 6000)
      st.root.innerHTML = `<div class="rd-loading"><p>This document isn't in your library.</p><a class="btn" href="#/read">Back to Library</a></div>`;
    return;
  }
  me.loading = true;
  me.doc = d;
  const p = progOf(d.id);
  const prefs = readerPrefs();
  st.mode = d.kind === 'epub' ? 'flow' : p?.mode || prefs.defMode || 'pdf';
  st.pinned = !!p?.pinned;
  st.saved = p ? { page: p.page, frac: p.frac, at: p.at } : null;
  st.page = p?.page || 1; st.frac = p?.frac || 0;
  shell();
  applyTheme();
  try {
    setStatus('Loading the document…');
    const text = await textOf(d);
    if (st !== me) return;
    me.text = text;
    await buildView();
    if (st !== me) return;
    const jump = takeJump(d.id);
    if (jump) { me.restoring = true; goTo(jump.page, { quote: jump.quote, prefix: jump.prefix, nid: jump.nid }); setTimeout(() => { if (st === me) { me.restoring = false; trackPosition(); } }, 900); }
    else restorePosition(p);
    setStatus('');
  } catch (e) {
    if (st === me) setStatus(e.message || String(e), true);
  }
  if (st !== me) return;
  me.loading = false;
  R.S.update('rdocs', d.id, { lastOpened: R.S.nowISO(), status: d.status === 'unread' ? 'reading' : d.status });
  me.tick = setInterval(tick, 15000);
}

/* ---------- layout ---------- */
function shell() {
  const d = st.doc;
  st.root.innerHTML = `
  <header class="rd-top">
    <a class="icon-btn" href="#/read" aria-label="Back to Library" title="Back to Library">${ic('chevL', 20)}</a>
    <div class="rd-title"><b>${esc(d.title)}</b><small>${esc(d.author || '')}</small></div>
    <button class="rd-pageno" data-ract="jump" title="Go to page"><span id="rdPage">1</span> / ${d.pages}</button>
    <span class="spacer"></span>
    ${d.kind === 'pdf' ? `<div class="seg" role="group" aria-label="View"><button data-ract="mode" data-v="pdf" class="${st.mode === 'pdf' ? 'on' : ''}" title="Original pages">Page</button><button data-ract="mode" data-v="flow" class="${st.mode === 'flow' ? 'on' : ''}" title="Reflowed text">Text</button></div>` : ''}
    <button class="icon-btn" data-ract="panel" data-v="toc" title="Contents" aria-label="Contents">${ic('todo', 18)}</button>
    <button class="icon-btn" data-ract="panel" data-v="search" title="Search (Ctrl+F)" aria-label="Search">${ic('search', 18)}</button>
    <button class="icon-btn" data-ract="panel" data-v="notes" title="Highlights & notes" aria-label="Highlights and notes">${ic('pen', 18)}</button>
    <button class="icon-btn" data-ract="bookmark" title="Bookmark this page (B)" aria-label="Bookmark">${ic('flag', 18)}</button>
    <button class="icon-btn rd-pin ${st.pinned ? 'on' : ''}" data-ract="pin" title="Keep my place here" aria-label="Keep my place here">${ic('pin', 18)}</button>
    <button class="icon-btn" data-ract="panel" data-v="ai" title="Ask AI about this document" aria-label="AI">✨</button>
    <button class="icon-btn" data-ract="panel" data-v="look" title="Reading settings" aria-label="Reading settings"><b style="font-family:Georgia,serif">Aa</b></button>
    <button class="icon-btn" data-ract="full" title="Full screen (F)" aria-label="Full screen">${ic('expand', 18)}</button>
  </header>
  <div class="rd-status" id="rdStatus" hidden></div>
  <div class="rd-remote" id="rdRemote" hidden></div>
  ${d.ocr && d.ocr.done < d.ocr.need.length ? `<div class="rd-ocr" id="rdOcr">${d.ocr.need.length - d.ocr.done} scanned page${d.ocr.need.length - d.ocr.done > 1 ? 's have' : ' has'} no text yet. <button class="btn sm" data-ract="ocr">Read them now</button></div>` : ''}
  <div class="rd-body">
    <main class="rd-scroll" id="rdScroll" tabindex="-1"></main>
    <aside class="rd-panel" id="rdPanel" hidden></aside>
  </div>
  <footer class="rd-bot"><div class="rd-progress"><i id="rdBar"></i></div><span id="rdPct">0%</span><span class="muted small" id="rdSync"></span></footer>
  <div class="rd-selbar" id="rdSel" hidden>
    ${Object.entries(COLORS).map(([k, c]) => `<button data-ract="hl" data-v="${k}" style="background:${c}" title="Highlight ${k} (H)" aria-label="Highlight ${k}"></button>`).join('')}
    <button data-ract="hl" data-v="underline" title="Underline (U)" aria-label="Underline"><u>U</u></button>
    <button data-ract="selnote" title="Add a note (N)" aria-label="Add note">${ic('pen', 15)}</button>
    <button data-ract="copy" title="Copy" aria-label="Copy">${ic('copy', 15)}</button>
    <button data-ract="explain" title="Explain simply (AI)" aria-label="Explain">✨</button>
  </div>
  <div class="rd-pop" id="rdPop" hidden></div>`;
  st.scroll = $r('#rdScroll');
  st.scroll.addEventListener('scroll', onScroll, { passive: true });
}

function applyTheme() {
  const p = readerPrefs();
  const [bg, fg] = p.theme === 'custom' ? [p.bg || '#f6efe0', p.fg || '#222'] : THEMES[p.theme] || THEMES.sepia;
  const s = st.root.style;
  s.setProperty('--rd-bg', bg); s.setProperty('--rd-fg', fg);
  s.setProperty('--rd-font', FONTS[p.font] || FONTS.serif);
  s.setProperty('--rd-size', p.size + 'px'); s.setProperty('--rd-lh', p.lh);
  s.setProperty('--rd-width', (MARGINS[p.margin] || 680) + 'px');
  s.setProperty('--rd-align', p.align);
  st.root.classList.toggle('rd-dark', ['dark', 'night'].includes(p.theme) || (p.theme === 'custom' && lum(bg) < 0.4));
  st.root.classList.toggle('pdf-dark', !!p.pdfDark);
}
const lum = (hex) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/* ---------- building the two views ---------- */
async function buildView() {
  st.io?.disconnect(); st.fio?.disconnect();
  st.rendered.clear(); st.filled.clear();
  if (st.mode === 'pdf') await buildPdf(); else buildFlow();
}

async function buildPdf() {
  const me = st, d = st.doc;
  if (!st.pdf) {
    const lib = await pdfjs();
    const bytes = await fileBytes(d, (p) => setStatus(`Downloading… ${Math.round(p * 100)}%`));
    const pdf = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
    if (st !== me) { pdf.destroy(); return; }
    st.pdf = pdf;
  }
  const p = readerPrefs();
  const avail = Math.min(st.scroll.clientWidth - 16, 1100);
  const pages = st.text.pages;
  const baseW = pages[0]?.sz?.[0] || 612;
  st.scale = (avail / baseW) * (p.zoom || 1);
  const wrap = document.createElement('div');
  wrap.className = 'rd-pages';
  wrap.innerHTML = pages.map((pg, i) => {
    const [w, h] = pg.sz || [612, 792];
    return `<div class="rpage" data-page="${i + 1}" style="width:${Math.round(w * st.scale)}px;height:${Math.round(h * st.scale)}px"><div class="rp-num no-anchor">${i + 1}</div></div>`;
  }).join('');
  st.scroll.innerHTML = '';
  st.scroll.appendChild(wrap);
  st.io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) renderPage(+e.target.dataset.page); }), { root: st.scroll, rootMargin: '1200px 0px' });
  wrap.querySelectorAll('.rpage').forEach((el) => st.io.observe(el));
}

async function renderPage(n) {
  const me = st;
  if (!me?.pdf || me.rendered.has(n)) return;
  const el = $r(`.rpage[data-page="${n}"]`);
  if (!el) return;
  const job = { cancelled: false };
  st.rendered.set(n, job);
  try {
    const page = await me.pdf.getPage(n);
    if (job.cancelled || st !== me) return;
    const vp = page.getViewport({ scale: me.scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    const g = canvas.getContext('2d');
    await page.render({ canvasContext: g, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (job.cancelled || st !== me) return;
    const tl = document.createElement('div');
    tl.className = 'textLayer';
    tl.style.setProperty('--scale-factor', vp.scale);
    const words = st.text.pages[n - 1]?.w;
    if (words?.length) ocrLayer(tl, words, vp.width, vp.height);
    else {
      const tc = await page.getTextContent();
      await window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    }
    if (job.cancelled || st !== me) return;
    const hl = document.createElement('div'); hl.className = 'hl-layer no-anchor';
    el.querySelectorAll('canvas,.textLayer,.hl-layer').forEach((x) => x.remove());
    el.append(canvas, hl, tl);
    paintPdfHighlights(n);
    if (st.flash?.page === n) flashQuote();
    pruneRendered();
  } catch (e) {
    me.rendered.delete(n);
    if (!job.cancelled) console.warn('page', n, e);
  }
}
// Scanned pages read by OCR get our own invisible text layer so their words can be selected too.
function ocrLayer(tl, words, W, H) {
  const meas = document.createElement('canvas').getContext('2d');
  for (const [t, x, y, w, h] of words) {
    const s = document.createElement('span');
    const fs = h * H * 0.9;
    meas.font = `${fs}px sans-serif`;
    const natural = meas.measureText(t).width || 1;
    s.textContent = t + ' ';
    s.style.cssText = `left:${x * W}px;top:${y * H}px;font-size:${fs}px;font-family:sans-serif;transform:scaleX(${(w * W) / natural})`;
    tl.appendChild(s);
  }
}
function pruneRendered() {
  if (st.rendered.size <= 14) return;
  for (const [n, job] of st.rendered) {
    if (Math.abs(n - st.page) > 6) {
      job.cancelled = true;
      st.rendered.delete(n);
      const el = $r(`.rpage[data-page="${n}"]`);
      el?.querySelectorAll('canvas,.textLayer,.hl-layer').forEach((x) => { if (x.tagName === 'CANVAS') { x.width = 0; x.height = 0; } x.remove(); });
    }
  }
}

function buildFlow() {
  const pages = st.text.pages;
  const p = readerPrefs();
  const colW = Math.min(st.scroll.clientWidth - 32, MARGINS[p.margin] || 680);
  const art = document.createElement('article');
  art.className = 'rd-flow';
  art.innerHTML = pages.map((pg, i) => {
    const chars = (pg.t || '').length + 200;
    const est = Math.max(120, ((chars * p.size * 0.5) / colW) * p.size * p.lh + (pg.b?.length || 1) * p.size * 0.8);
    return `<section class="fpage" data-page="${i + 1}" style="min-height:${Math.round(est)}px"></section>`;
  }).join('');
  st.scroll.innerHTML = '';
  st.scroll.appendChild(art);
  st.fio = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) fillSection(+e.target.dataset.page); }), { root: st.scroll, rootMargin: '1500px 0px' });
  art.querySelectorAll('.fpage').forEach((el) => st.fio.observe(el));
}

function fillSection(n) {
  if (!st || st.filled.has(n)) return;
  const sec = $r(`.fpage[data-page="${n}"]`);
  if (!sec) return;
  st.filled.add(n);
  const pg = st.text.pages[n - 1] || {};
  const isPdf = st.doc.kind === 'pdf';
  const label = isPdf ? `Page ${n}` : `Chapter ${n}`;
  let html = `<div class="fp-sep no-anchor"><span>${label}</span>${isPdf ? `<button class="fp-origbtn" data-ract="origimg" data-v="${n}" title="Show this page as printed (charts, tables, images)">original</button>` : ''}</div>`;
  const visual = isPdf && (pg.f === 'tbl' || pg.f === 'scan');
  html += isPdf ? `<div class="fp-orig no-anchor" data-orig="${n}">${visual ? `<button class="btn sm" data-ract="origimg" data-v="${n}">Show the original page ${pg.f === 'tbl' ? '(table)' : '(scanned)'}</button>` : ''}</div>` : '';
  const blocks = pg.b || [];
  if (!blocks.length && pg.f === 'scan') html += `<p class="muted no-anchor"><i>This page is a scan with no text yet — use “Read them now” at the top, or switch to Page view.</i></p>`;
  let inRows = false;
  for (const b of blocks) {
    const [k, t, lvl] = b;
    if (k === 'row') { if (!inRows) { html += '<div class="frows">'; inRows = true; } html += `<div class="frow">${String(t).split('\t').map((c) => `<span>${esc(c)}</span>`).join('')}</div>`; continue; }
    if (inRows) { html += '</div>'; inRows = false; }
    if (k === 'h') html += lvl === 1 ? `<h2>${esc(t)}</h2>` : `<h3>${esc(t)}</h3>`;
    else if (k === 'li') html += `<p class="fli">${esc(t)}</p>`;
    else html += `<p>${esc(t)}</p>`;
  }
  if (inRows) html += '</div>';
  sec.innerHTML = html;
  sec.style.minHeight = '';
  if (visual && pg.f !== 'scan' && readerPrefs().autoOrig !== false) showOriginalImage(n);
  paintFlowHighlights(n);
  if (st.flash?.page === n) flashQuote();
}

async function showOriginalImage(n) {
  const box = $r(`.fp-orig[data-orig="${n}"]`);
  if (!box || box.dataset.done) return;
  box.dataset.done = '1';
  box.innerHTML = '<span class="muted small">Loading the original page…</span>';
  const me = st;
  try {
    if (!me.pdf) { const lib = await pdfjs(); const pdf = await lib.getDocument({ data: new Uint8Array(await fileBytes(me.doc)) }).promise; if (st !== me) { pdf.destroy(); return; } me.pdf = pdf; }
    const page = await me.pdf.getPage(n);
    const w = Math.min(st.scroll.clientWidth - 24, 900);
    const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = vp.width * dpr; c.height = vp.height * dpr; c.style.width = '100%';
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
    box.innerHTML = '';
    box.appendChild(c);
  } catch (e) { box.innerHTML = `<span class="muted small">Couldn't show the page: ${esc(e.message)}</span>`; }
}

/* ---------- highlights ---------- */
function paintFlowHighlights(n) {
  const sec = $r(`.fpage[data-page="${n}"]`);
  if (!sec) return;
  sec.querySelectorAll('mark.hl').forEach((m) => m.replaceWith(...m.childNodes));
  sec.normalize();
  for (const note of notesOf(st.doc.id).filter((x) => x.page === n && x.quote && (x.kind === 'highlight' || x.kind === 'note' || x.kind === 'ai'))) {
    const r = findQuote(sec, note.quote, note.prefix, note.mode === 'flow' ? note.approx : null);
    if (r) markRange(r, { class: `hl hl-${note.color || 'yellow'}${note.style === 'underline' ? ' ul' : ''}${note.note ? ' has-note' : ''}`, 'data-nid': note.id });
  }
}
function paintPdfHighlights(n) {
  const el = $r(`.rpage[data-page="${n}"]`);
  const layer = el?.querySelector('.hl-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const W = el.clientWidth, H = el.clientHeight, tl = el.querySelector('.textLayer');
  for (const note of notesOf(st.doc.id).filter((x) => x.page === n && x.quote && (x.kind === 'highlight' || x.kind === 'note' || x.kind === 'ai'))) {
    let rects = note.rects;
    if (!rects?.length && tl) {
      const r = findQuote(tl, note.quote, note.prefix, note.mode === 'pdf' ? note.approx : null);
      // Remember the boxes (for the annotated-PDF export) once painting is done: saving re-triggers a repaint.
      if (r) { rects = rectsOf(r, el); if (rects.length) { const id = note.id, rs = rects; setTimeout(() => R.S.update('rnotes', id, { rects: rs }), 0); } }
    }
    for (const [x, y, w, h] of rects || []) {
      const d = document.createElement('div');
      d.className = `hlr hl-${note.color || 'yellow'}${note.style === 'underline' ? ' ul' : ''}`;
      d.dataset.nid = note.id;
      d.style.cssText = `left:${x * W}px;top:${y * H}px;width:${w * W}px;height:${h * H}px`;
      layer.appendChild(d);
    }
    if (note.note && rects?.length) {
      const [x, y] = rects[0];
      const pin = document.createElement('button');
      pin.className = 'hl-pin'; pin.dataset.nid = note.id; pin.title = note.note; pin.textContent = '✎';
      pin.style.cssText = `left:${Math.max(0, x * W - 18)}px;top:${y * H}px`;
      layer.appendChild(pin);
    }
  }
}
function rectsOf(range, pageEl) {
  const box = pageEl.getBoundingClientRect();
  const out = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const x = (r.left - box.left) / box.width, y = (r.top - box.top) / box.height, w = r.width / box.width, h = r.height / box.height;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - y) < h * 0.5 && x <= last[0] + last[2] + 0.01) { last[2] = Math.max(last[0] + last[2], x + w) - last[0]; last[3] = Math.max(last[3], h); }
    else out.push([x, y, w, h]);
  }
  return out.map((a) => a.map((v) => +v.toFixed(4)));
}
function repaintAll() {
  if (st.mode === 'pdf') for (const n of st.rendered.keys()) paintPdfHighlights(n);
  else for (const n of st.filled) paintFlowHighlights(n);
}

/* ---------- selection toolbar ---------- */
function pageOfNode(node) {
  const el = (node.nodeType === 3 ? node.parentElement : node)?.closest('[data-page]');
  return el ? { el, n: +el.dataset.page } : null;
}
function onSelection() {
  if (!st?.doc) return;
  const sel = getSelection();
  const bar = $r('#rdSel');
  if (!sel || sel.isCollapsed || !sel.rangeCount || !st.scroll.contains(sel.anchorNode)) { bar.hidden = true; st.sel = null; return; }
  const range = sel.getRangeAt(0);
  const pg = pageOfNode(range.startContainer);
  if (!pg || !range.toString().trim()) { bar.hidden = true; return; }
  st.sel = { range: range.cloneRange(), page: pg.n, pageEl: pg.el };
  const r = range.getBoundingClientRect(), box = st.root.getBoundingClientRect();
  bar.hidden = false;
  const bw = bar.offsetWidth || 280;
  bar.style.left = Math.max(8, Math.min(box.width - bw - 8, r.left - box.left + r.width / 2 - bw / 2)) + 'px';
  bar.style.top = (r.top - box.top > 64 ? r.top - box.top - 48 : r.bottom - box.top + 10) + 'px';
}
function createFromSelection(kind, color = 'yellow', style = 'highlight') {
  if (!st.sel) return null;
  const { range, page, pageEl } = st.sel;
  const anchorEl = st.mode === 'pdf' ? pageEl.querySelector('.textLayer') || pageEl : pageEl;
  const a = selectionAnchor(anchorEl, range);
  if (!a.quote) return null;
  const rects = st.mode === 'pdf' ? rectsOf(range, pageEl) : null;
  const note = R.S.put('rnotes', {
    docId: st.doc.id, docTitle: st.doc.title, kind, color, style, page, quote: a.quote.slice(0, 2000), prefix: a.prefix, suffix: a.suffix, approx: a.approx, mode: st.mode,
    rects, note: '', tags: [], at: R.S.nowISO(),
  });
  getSelection().removeAllRanges();
  $r('#rdSel').hidden = true;
  st.sel = null;
  repaintPage(page);
  if (st.panel === 'notes') renderPanel();
  return note;
}
const repaintPage = (n) => (st.mode === 'pdf' ? paintPdfHighlights(n) : paintFlowHighlights(n));

export function editNote(note, isNew) {
  R.openModal(isNew ? 'Add a note' : 'Edit note', `
    ${note.quote ? `<blockquote class="rd-quote">${esc(note.quote)}</blockquote>` : ''}
    ${R.field('Note', `<textarea class="input" name="note" rows="5" placeholder="Your thoughts…">${esc(note.note || '')}</textarea>`)}
    <div class="form-grid">
      ${R.field('Tags (comma separated)', `<input class="input" name="tags" value="${esc((note.tags || []).join(', '))}" placeholder="e.g. valuation, risks">`)}
      ${R.field('Page', `<input class="input" type="number" min="1" name="page" value="${note.page || st?.page || 1}">`)}
    </div>
    ${note.quote ? R.field('Colour', `<select class="input" name="color">${R.opts(Object.keys(COLORS), note.color || 'yellow')}</select>`) : ''}`,
  (v) => {
    R.S.put('rnotes', { ...note, note: v.note.trim(), tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), page: +v.page || note.page || 1, color: v.color || note.color });
    if (st) { repaintPage(note.page); if (st.panel === 'notes') renderPanel(); }
  }, 'Save note');
}

/* ---------- position: track, save, restore, sync ---------- */
let scrollT = null;
function onScroll() {
  st.lastActivity = Date.now();
  $r('#rdSel').hidden = true;
  $r('#rdPop').hidden = true;
  if (scrollT) return;
  scrollT = setTimeout(() => { scrollT = null; if (st) { trackPosition(); ensureNear(); } }, 60);
}
// Backup for the on-screen detector: always draw the pages around the reading position.
function ensureNear() {
  if (!st?.doc) return;
  const n = currentPos().page;
  for (let k = n - 1; k <= n + 2; k++) if (k >= 1 && k <= st.doc.pages) (st.mode === 'pdf' ? renderPage(k) : fillSection(k));
}
function pageEls() { return st.root.querySelectorAll(st.mode === 'pdf' ? '.rpage' : '.fpage'); }
// The reading line sits REF px below the top of the reading area; positions are saved and restored against it.
const REF = 48;
function currentPos() {
  const ref = st.scroll.scrollTop + REF;
  const els = pageEls();
  let lo = 0, hi = els.length - 1, at = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (els[mid].offsetTop <= ref) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  const el = els[at];
  if (!el) return { page: 1, frac: 0 };
  const frac = Math.max(0, Math.min(1, (ref - el.offsetTop) / Math.max(1, el.offsetHeight)));
  let anchor = null;
  if (st.mode === 'flow') {
    const blk = [...el.querySelectorAll('p,h2,h3,.frow')].find((b) => b.offsetTop + b.offsetHeight > ref);
    if (blk) anchor = blk.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  return { page: +el.dataset.page, frac: +frac.toFixed(4), anchor };
}
let commitTimer = null;
function trackPosition() {
  const pos = currentPos();
  const pct = Math.round(((pos.page - 1 + pos.frac) / st.doc.pages) * 100);
  $r('#rdPage').textContent = pos.page;
  $r('#rdBar').style.width = pct + '%';
  $r('#rdPct').textContent = pct + '%';
  if (pos.page !== st.page) {
    st.page = pos.page;
    if (st.mode === 'pdf') pruneRendered();
  }
  st.frac = pos.frac; st.anchor = pos.anchor; st.pct = pct;
  clearTimeout(commitTimer);
  // Only a page you stay on counts: a quick jump to check something doesn't move your place.
  commitTimer = setTimeout(() => commitPosition(), 4000);
}
function commitPosition() {
  if (!st?.doc || st.loading || st.restoring) return;
  if (!st.seenPages.has(st.page)) { st.seenPages.add(st.page); if (st.seenPages.size > 1) addReading(st.doc.id, 0, 1); }
  if (st.pinned) return;
  const same = st.saved && st.saved.page === st.page && Math.abs((st.saved.frac || 0) - st.frac) < 0.02 && st.saved.mode === st.mode;
  if (same) return;
  const at = R.S.nowISO();
  R.S.put('rprog', { id: st.doc.id, page: st.page, frac: st.frac, anchor: st.anchor || null, mode: st.mode, pinned: false, pct: st.pct || 0, at, dev: deviceId });
  st.saved = { page: st.page, frac: st.frac, at, mode: st.mode };
  const d = getDoc(st.doc.id);
  const finished = st.page >= st.doc.pages && st.frac > 0.5;
  if (d && (Math.abs((d.pct || 0) - (st.pct || 0)) >= 1 || (finished && d.status !== 'finished')))
    R.S.update('rdocs', d.id, { pct: st.pct || 0, lastOpened: at, status: finished ? 'finished' : d.status === 'unread' ? 'reading' : d.status });
  if (finished && d?.status !== 'finished') R.toast('Finished! Marked as read.');
  const s = $r('#rdSync'); if (s) s.textContent = navigator.onLine ? 'Saved' : 'Saved on this device — syncs when online';
}

function restorePosition(p) {
  st.restoring = true;
  const page = Math.min(Math.max(1, p?.page || 1), st.doc.pages);
  goTo(page, { frac: p?.frac || 0, anchor: p?.mode === st.mode ? p?.anchor : null, quiet: true });
  setTimeout(() => { if (st) { st.restoring = false; trackPosition(); ensureNear(); } }, 900);
}

export function goTo(page, { frac = 0, anchor = null, quote = null, prefix = null, nid = null, quiet = false } = {}) {
  if (!st) return;
  page = Math.min(Math.max(1, page), st.doc.pages);
  if (st.mode === 'flow') for (let k = page - 1; k <= page + 1; k++) if (k >= 1 && k <= st.doc.pages) fillSection(k);
  if (st.mode === 'pdf') for (let k = page - 1; k <= page + 2; k++) if (k >= 1 && k <= st.doc.pages) renderPage(k);
  const el = $r(`${st.mode === 'pdf' ? '.rpage' : '.fpage'}[data-page="${page}"]`);
  if (!el) return;
  let top = el.offsetTop + frac * el.offsetHeight;
  if (anchor && st.mode === 'flow') {
    const want = anchor.replace(/\s+/g, ' ').slice(0, 60);
    const blk = [...el.querySelectorAll('p,h2,h3,.frow')].find((b) => b.textContent.replace(/\s+/g, ' ').includes(want));
    if (blk) top = blk.offsetTop;
  }
  st.scroll.scrollTop = Math.max(0, top - REF);
  // Placeholders above may grow as they fill; correct once more after layout settles.
  setTimeout(() => {
    if (!st || !el.isConnected || quote) return;
    let t2 = el.offsetTop + frac * el.offsetHeight;
    if (anchor && st.mode === 'flow') { const want = anchor.replace(/\s+/g, ' ').slice(0, 60); const blk = [...el.querySelectorAll('p,h2,h3,.frow')].find((b) => b.textContent.replace(/\s+/g, ' ').includes(want)); if (blk) t2 = blk.offsetTop; }
    st.scroll.scrollTop = Math.max(0, t2 - REF);
  }, 350);
  if (quote) { st.flash = { page, quote, prefix, nid }; flashQuote(); }
  setTimeout(() => { if (st && !st.restoring) trackPosition(); }, 400);
}
function flashQuote() {
  const f = st.flash;
  if (!f) return;
  const el = $r(`${st.mode === 'pdf' ? '.rpage' : '.fpage'}[data-page="${f.page}"]`);
  if (!el) return;
  let target = f.nid ? el.querySelector(`[data-nid="${f.nid}"]`) : null;
  if (!target) {
    const root = st.mode === 'pdf' ? el.querySelector('.textLayer') : el;
    if (!root) return; // page not rendered yet: renderPage() calls back
    const r = findQuote(root, f.quote, f.prefix);
    if (!r) { st.flash = null; return; }
    if (st.mode === 'flow') { const ms = markRange(r, { class: 'flash' }); target = ms[0]; setTimeout(() => ms.forEach((m) => m.isConnected && m.replaceWith(...m.childNodes)), 2600); }
    else {
      const layer = el.querySelector('.hl-layer');
      for (const [x, y, w, h] of rectsOf(r, el)) { const d = document.createElement('div'); d.className = 'hlr flash'; d.style.cssText = `left:${x * el.clientWidth}px;top:${y * el.clientHeight}px;width:${w * el.clientWidth}px;height:${h * el.clientHeight}px`; layer.appendChild(d); target ||= d; setTimeout(() => d.remove(), 2600); }
    }
  } else { target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 2600); }
  if (target) st.scroll.scrollTop += target.getBoundingClientRect().top - st.scroll.getBoundingClientRect().top - st.scroll.clientHeight / 3;
  st.flash = null;
}

function onData() {
  if (!st) return;
  if (!st.doc) { tryLoad(); return; }
  const d = getDoc(st.id);
  if (!d) return;
  if ((d.textVer || 1) !== (st.doc.textVer || 1)) { st.doc = d; textOf(d).then((t) => { st.text = t; if (st.mode === 'flow') { const pos = currentPos(); buildView().then(() => goTo(pos.page, { frac: pos.frac, quiet: true })); } }); }
  st.doc = d;
  // Notes changed (here or on another device): repaint what is on screen.
  const sig = notesOf(d.id).map((n) => n.id + (n.updatedAt || '')).join();
  if (sig !== st.noteSig) { st.noteSig = sig; repaintAll(); if (st.panel === 'notes') renderPanel(); }
  const p = progOf(d.id);
  if (p) {
    st.pinned = !!p.pinned;
    $r('.rd-pin')?.classList.toggle('on', st.pinned);
    // Read further on another device while this one was open: offer to jump there.
    if (p.dev !== deviceId && p.at > (st.saved?.at || '') && p.page !== st.page) {
      const bar = $r('#rdRemote');
      bar.hidden = false;
      bar.innerHTML = `On another device you're on page <b>${p.page}</b>. <button class="btn sm primary" data-ract="remote" data-v="${p.page}" data-f="${p.frac || 0}">Go there</button> <button class="btn sm ghost" data-ract="remote-stay">Stay here</button>`;
      st.saved = { page: p.page, frac: p.frac, at: p.at, mode: p.mode };
    }
  }
}

function tick() {
  if (!st?.doc || document.hidden) return;
  if (Date.now() - st.lastActivity < 90000) addReading(st.doc.id, 15);
}

/* ---------- side panel: contents, search, notes, look, AI ---------- */
function togglePanel(name) {
  st.panel = st.panel === name ? null : name;
  renderPanel();
}
export function renderPanel() {
  const pan = $r('#rdPanel');
  if (!st.panel) { pan.hidden = true; st.root.classList.remove('has-panel'); return; }
  pan.hidden = false;
  st.root.classList.add('has-panel');
  const close = `<button class="icon-btn" data-ract="panel" data-v="${st.panel}" aria-label="Close">${ic('x', 16)}</button>`;
  const d = st.doc;
  if (st.panel === 'toc') {
    const toc = d.toc?.length ? d.toc : (st.text.pages || []).flatMap((p, i) => (p.b || []).filter((b) => b[0] === 'h' && b[2] === 1).slice(0, 3).map((b) => ({ t: b[1], p: i + 1, l: 1 })));
    pan.innerHTML = `<div class="rp-head"><b>Contents</b>${close}</div>
      ${toc.length ? `<div class="rp-list">${toc.map((t) => `<button class="toc-item l${t.l}${t.p <= st.page ? ' past' : ''}" data-ract="go" data-v="${t.p}"><span>${esc(t.t)}</span><small>${t.p}</small></button>`).join('')}</div>` : '<p class="muted small">This document has no table of contents. Use search or the page number at the top to move around.</p>'}`;
  } else if (st.panel === 'search') {
    pan.innerHTML = `<div class="rp-head"><b>Search in document</b>${close}</div>
      <input class="input" id="rdQ" placeholder="Word or phrase" value="${esc(st.q || '')}" autocomplete="off"><div class="rp-list" id="rdQRes"></div>`;
    const q = $r('#rdQ');
    q.addEventListener('input', () => { st.q = q.value; runSearch(); });
    setTimeout(() => q.focus(), 30);
    runSearch();
  } else if (st.panel === 'notes') {
    const f = st.noteFilter || 'all';
    const all = notesOf(d.id).sort((a, b) => (a.page || 0) - (b.page || 0) || (a.at || '').localeCompare(b.at || ''));
    const list = all.filter((n) => f === 'all' || n.kind === f);
    pan.innerHTML = `<div class="rp-head"><b>Highlights &amp; notes</b>${close}</div>
      <div class="chips">${[['all', 'All'], ['highlight', 'Highlights'], ['note', 'Notes'], ['bookmark', 'Bookmarks'], ['ai', 'AI'], ['card', 'Cards']].map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-ract="nf" data-v="${k}">${l} <span class="muted">${k === 'all' ? all.length : all.filter((n) => n.kind === k).length}</span></button>`).join('')}</div>
      <div class="row rp-tools"><button class="btn sm" data-ract="newnote">${ic('plus', 14)} Note on page ${st.page}</button><button class="btn sm ghost" data-ract="export">${ic('download', 14)} Export</button></div>
      <div class="rp-list">${list.length ? list.map(noteRow).join('') : '<p class="muted small">Select text to highlight it or add a note. Press B to bookmark a page.</p>'}</div>`;
  } else if (st.panel === 'look') {
    const p = readerPrefs();
    pan.innerHTML = `<div class="rp-head"><b>Reading settings</b>${close}</div>
      <div class="look">
        <label>Theme</label><div class="themes">${Object.entries(THEMES).map(([k, [bg, fg]]) => `<button data-ract="pref" data-k="theme" data-v="${k}" class="${p.theme === k ? 'on' : ''}" style="background:${bg};color:${fg}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}<button data-ract="pref" data-k="theme" data-v="custom" class="${p.theme === 'custom' ? 'on' : ''}" style="background:${p.bg || '#e9f1e6'};color:${p.fg || '#223'}">Custom</button></div>
        ${p.theme === 'custom' ? `<div class="row small">Background <input type="color" data-rchange="bg" value="${p.bg || '#e9f1e6'}"> Text <input type="color" data-rchange="fg" value="${p.fg || '#222233'}"></div>` : ''}
        <label>Text view</label>
        <div class="row"><select class="input sm" data-rchange="font">${R.opts([['serif', 'Serif'], ['sans', 'Sans'], ['readable', 'Easy to read'], ['mono', 'Monospace']], p.font)}</select>
          <span class="stepper"><button data-ract="step" data-k="size" data-v="-1" aria-label="Smaller">A−</button><b>${p.size}</b><button data-ract="step" data-k="size" data-v="1" aria-label="Bigger">A+</button></span></div>
        <div class="row"><span class="small muted">Line spacing</span><span class="stepper"><button data-ract="step" data-k="lh" data-v="-0.1">−</button><b>${(+p.lh).toFixed(1)}</b><button data-ract="step" data-k="lh" data-v="0.1">+</button></span></div>
        <div class="row"><span class="small muted">Margins</span><div class="seg">${['narrow', 'normal', 'wide'].map((m) => `<button data-ract="pref" data-k="margin" data-v="${m}" class="${p.margin === m ? 'on' : ''}">${m}</button>`).join('')}</div></div>
        <div class="row"><span class="small muted">Alignment</span><div class="seg">${[['left', 'Left'], ['justify', 'Justify']].map(([k, l]) => `<button data-ract="pref" data-k="align" data-v="${k}" class="${p.align === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="check-line small"><input type="checkbox" data-rchange="autoOrig" ${p.autoOrig !== false ? 'checked' : ''}> Show tables and charts as the original page</label>
        ${d.kind === 'pdf' ? `<label>Page view</label>
        <div class="row"><span class="small muted">Zoom</span><span class="stepper"><button data-ract="step" data-k="zoom" data-v="-0.1">−</button><b>${Math.round((p.zoom || 1) * 100)}%</b><button data-ract="step" data-k="zoom" data-v="0.1">+</button></span></div>
        <label class="check-line small"><input type="checkbox" data-rchange="pdfDark" ${p.pdfDark ? 'checked' : ''}> Dark pages (invert colours)</label>
        <label class="check-line small"><input type="checkbox" data-rchange="defText" ${p.defMode === 'flow' ? 'checked' : ''}> Open new documents in Text view</label>` : ''}
        <p class="muted small">Keys: H highlight · U underline · N note · B bookmark · F full screen · Ctrl+F search · ← → pages</p>
      </div>`;
  } else if (st.panel === 'ai') {
    pan.innerHTML = `<div class="rp-head"><b>✨ Ask AI</b>${close}</div>${aiPanelHTML(st)}`;
    aiWire(st, pan);
  }
}
const noteRow = (n) => `<div class="nrow" data-nid="${n.id}">
  <button class="nrow-main" data-ract="gonote" data-v="${n.id}">
    <span class="nrow-meta"><i class="dot" style="background:${n.kind === 'highlight' || n.quote ? COLORS[n.color] || COLORS.yellow : 'var(--muted)'}"></i>${n.kind === 'bookmark' ? '🔖 ' : n.kind === 'ai' ? '✨ ' : n.kind === 'card' ? '🃏 ' : ''}p. ${n.page || '–'}${n.tags?.length ? ` · ${n.tags.map((t) => '#' + esc(t)).join(' ')}` : ''}</span>
    ${n.kind === 'card' ? `<span class="nrow-q"><b>Q:</b> ${esc(n.q)}</span>` : n.quote ? `<span class="nrow-q${n.style === 'underline' ? ' ul' : ''}">${esc(n.quote.length > 220 ? n.quote.slice(0, 220) + '…' : n.quote)}</span>` : ''}
    ${n.note ? `<span class="nrow-n${n.kind === 'ai' ? ' ai' : ''}">${n.kind === 'ai' ? '<em class="ai-tag">AI</em> ' : ''}${esc(n.note.length > 300 ? n.note.slice(0, 300) + '…' : n.note)}</span>` : ''}
  </button>
  <span class="nrow-act"><button class="icon-btn" data-ract="editnote" data-v="${n.id}" aria-label="Edit">${ic('pen', 13)}</button><button class="icon-btn" data-ract="delnote" data-v="${n.id}" aria-label="Delete">${ic('trash', 13)}</button></span>
</div>`;

function runSearch() {
  const box = $r('#rdQRes');
  if (!box) return;
  const q = (st.q || '').trim();
  if (q.length < 2) { box.innerHTML = '<p class="muted small">Type at least 2 letters.</p>'; return; }
  const needle = q.toLowerCase().replace(/\s+/g, ' ');
  const res = [];
  st.text.pages.forEach((pg, i) => {
    const t = (pg.t || '').replace(/\s+/g, ' ');
    const low = t.toLowerCase();
    for (let at = low.indexOf(needle); at >= 0 && res.length < 300; at = low.indexOf(needle, at + needle.length)) res.push({ p: i + 1, at, t });
  });
  box.innerHTML = res.length ? `<p class="muted small">${res.length >= 300 ? '300+' : res.length} match${res.length === 1 ? '' : 'es'}</p>` + res.map((r) => {
    const s = Math.max(0, r.at - 60), e = Math.min(r.t.length, r.at + needle.length + 60);
    return `<button class="srow" data-ract="gosearch" data-v="${r.p}" data-q="${esc(r.t.slice(r.at, r.at + needle.length))}"><small>p. ${r.p}</small><span>${s ? '…' : ''}${esc(r.t.slice(s, r.at))}<b>${esc(r.t.slice(r.at, r.at + needle.length))}</b>${esc(r.t.slice(r.at + needle.length, e))}…</span></button>`;
  }).join('') : '<p class="muted small">No matches.</p>';
}

/* ---------- popover for a clicked highlight ---------- */
function showNotePop(nid, x, y) {
  const n = R.S.get('rnotes', nid);
  if (!n) return;
  const pop = $r('#rdPop');
  const box = st.root.getBoundingClientRect();
  pop.innerHTML = `<div class="pop-colors">${Object.entries(COLORS).map(([k, c]) => `<button data-ract="recolor" data-v="${k}" data-nid="${n.id}" style="background:${c}" class="${n.color === k ? 'on' : ''}" aria-label="${k}"></button>`).join('')}</div>
    ${n.note ? `<p class="pop-note">${esc(n.note)}</p>` : ''}
    <div class="row"><button class="btn sm" data-ract="editnote" data-v="${n.id}">${ic('pen', 13)} ${n.note ? 'Edit note' : 'Add note'}</button><button class="btn sm ghost" data-ract="explainq" data-v="${n.id}">✨ Explain</button><button class="btn sm ghost" data-ract="delnote" data-v="${n.id}">${ic('trash', 13)}</button></div>`;
  pop.hidden = false;
  pop.style.left = Math.max(8, Math.min(box.width - 300, x - box.left - 140)) + 'px';
  pop.style.top = Math.min(box.height - 160, y - box.top + 14) + 'px';
}

/* ---------- actions ---------- */
async function setMode(m) {
  if (m === st.mode) return;
  const pos = currentPos();
  st.mode = m;
  st.root.querySelectorAll('[data-ract=mode]').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
  setStatus('Switching…');
  await buildView();
  setStatus('');
  goTo(pos.page, { frac: pos.frac, quiet: true });
  R.S.put('rprog', { ...(progOf(st.doc.id) || { id: st.doc.id, page: pos.page, frac: pos.frac }), mode: m, id: st.doc.id });
}
function toggleBookmark() {
  const ex = notesOf(st.doc.id).find((n) => n.kind === 'bookmark' && n.page === st.page);
  if (ex) { R.S.remove('rnotes', ex); R.toast(`Bookmark on page ${st.page} removed`); }
  else {
    const t = (st.text.pages[st.page - 1]?.t || '').replace(/\s+/g, ' ').trim();
    R.S.put('rnotes', { docId: st.doc.id, docTitle: st.doc.title, kind: 'bookmark', page: st.page, note: '', context: t.slice(0, 120), tags: [], at: R.S.nowISO() });
    R.toast(`Page ${st.page} bookmarked`);
  }
  if (st.panel === 'notes') renderPanel();
}
function togglePin() {
  const pos = currentPos();
  st.pinned = !st.pinned;
  const at = R.S.nowISO();
  R.S.put('rprog', { id: st.doc.id, page: pos.page, frac: pos.frac, anchor: pos.anchor || null, mode: st.mode, pinned: st.pinned, pct: st.pct || 0, at, dev: deviceId });
  st.saved = { page: pos.page, frac: pos.frac, at, mode: st.mode };
  $r('.rd-pin').classList.toggle('on', st.pinned);
  R.toast(st.pinned ? `Your place is kept at page ${pos.page} on every device until you unpin it` : 'Unpinned — your place follows your reading again');
}
async function exportMenu() {
  const list = notesOf(st.doc.id);
  R.openModal('Export highlights & notes', `<p class="muted small">${list.length} item${list.length === 1 ? '' : 's'} from “${esc(st.doc.title)}”.</p>
    <div class="exp-grid">
      <button type="button" class="btn" data-act="rdExp" data-v="md">Markdown (.md)</button>
      <button type="button" class="btn" data-act="rdExp" data-v="txt">Plain text (.txt)</button>
      <button type="button" class="btn" data-act="rdExp" data-v="print">Print / save as PDF</button>
      ${st.doc.kind === 'pdf' ? '<button type="button" class="btn" data-act="rdExp" data-v="annot">PDF with my highlights inside</button>' : ''}
    </div>`, () => {}, 'Done');
}
export async function exportDoc(kind, d = st?.doc) {
  const list = notesOf(d.id);
  const name = d.title.replace(/[\\/:*?"<>|]/g, '_');
  if (kind === 'md') R.download(`${name} - notes.md`, new Blob([notesMarkdown(list, { title: d.title })], { type: 'text/markdown' }));
  else if (kind === 'txt') R.download(`${name} - notes.txt`, new Blob([notesText(list, { title: d.title })], { type: 'text/plain' }));
  else if (kind === 'print') printNotes(list, { title: d.title });
  else if (kind === 'annot') { R.toast('Writing your highlights into the PDF…'); const n = await annotatedPdf(d); R.toast(`Saved a copy with ${n} annotation${n === 1 ? '' : 's'}`); }
}
function jumpPrompt() {
  R.openModal('Go to page', R.field(`Page (1–${st.doc.pages})`, `<input class="input" type="number" name="p" min="1" max="${st.doc.pages}" value="${st.page}">`), (v) => goTo(+v.p || 1), 'Go');
}
async function startOcr() {
  const bar = $r('#rdOcr');
  try {
    await runOcr(getDoc(st.doc.id), (m) => { if (bar) bar.innerHTML = esc(m) + ' <span class="muted small">(keep this open)</span>'; });
    if (bar) bar.remove();
  } catch (e) { if (bar) bar.textContent = e.message; }
}
async function toggleFull() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await st.root.requestFullscreen(); } catch { st.root.classList.toggle('rd-zen'); }
}
function setStatus(msg, bad) {
  const s = $r('#rdStatus');
  if (!s) return;
  s.hidden = !msg; s.textContent = msg || ''; s.classList.toggle('bad', !!bad);
}

const ACTS = {
  mode: (b) => setMode(b.dataset.v),
  panel: (b) => togglePanel(b.dataset.v),
  bookmark: () => toggleBookmark(),
  pin: () => togglePin(),
  full: () => toggleFull(),
  jump: () => jumpPrompt(),
  ocr: () => startOcr(),
  go: (b) => { goTo(+b.dataset.v); if (innerWidth < 820) togglePanel(st.panel); },
  gosearch: (b) => { goTo(+b.dataset.v, { quote: b.dataset.q }); if (innerWidth < 820) togglePanel(st.panel); },
  gonote: (b) => { const n = R.S.get('rnotes', b.dataset.v); if (n) { goTo(n.page || 1, { quote: n.quote, prefix: n.prefix, nid: n.id }); if (innerWidth < 820) togglePanel(st.panel); } },
  nf: (b) => { st.noteFilter = b.dataset.v; renderPanel(); },
  newnote: () => editNote({ docId: st.doc.id, docTitle: st.doc.title, kind: 'note', page: st.page, note: '', tags: [], at: R.S.nowISO() }, true),
  editnote: (b) => { const n = R.S.get('rnotes', b.dataset.v); $r('#rdPop').hidden = true; if (n) editNote(n); },
  delnote: (b) => { const n = R.S.get('rnotes', b.dataset.v); $r('#rdPop').hidden = true; if (n && confirm('Delete this ' + (n.kind === 'highlight' ? 'highlight' : 'note') + '?')) { R.S.remove('rnotes', n); repaintPage(n.page); if (st.panel === 'notes') renderPanel(); } },
  recolor: (b) => { const n = R.S.get('rnotes', b.dataset.nid); if (n) { R.S.update('rnotes', n.id, { color: b.dataset.v }); $r('#rdPop').hidden = true; repaintPage(n.page); } },
  hl: (b) => { const v = b.dataset.v; createFromSelection('highlight', v === 'underline' ? st.lastColor || 'yellow' : (st.lastColor = v), v === 'underline' ? 'underline' : 'highlight'); },
  selnote: () => { const n = createFromSelection('note', st.lastColor || 'yellow'); if (n) editNote(n, true); },
  copy: () => { if (st.sel) { R.copyText(st.sel.range.toString()); $r('#rdSel').hidden = true; } },
  explain: () => { if (!st.sel) return; const text = st.sel.range.toString(); const page = st.sel.page; $r('#rdSel').hidden = true; st.panel = 'ai'; renderPanel(); AI_ACTS.run(st, 'explain', { text, page }); },
  explainq: (b) => { const n = R.S.get('rnotes', b.dataset.v); $r('#rdPop').hidden = true; if (n) { st.panel = 'ai'; renderPanel(); AI_ACTS.run(st, 'explain', { text: n.quote, page: n.page }); } },
  export: () => exportMenu(),
  origimg: (b) => showOriginalImage(+b.dataset.v),
  remote: (b) => { $r('#rdRemote').hidden = true; goTo(+b.dataset.v, { frac: +b.dataset.f || 0 }); },
  'remote-stay': () => { $r('#rdRemote').hidden = true; commitPosition(true); },
  pref: (b) => keepPlace(() => { saveReaderPrefs({ [b.dataset.k]: b.dataset.v }); applyTheme(); renderPanel(); }),
  step: (b) => {
    const p = readerPrefs(), k = b.dataset.k, dv = +b.dataset.v;
    const lim = { size: [12, 34], lh: [1.1, 2.4], zoom: [0.5, 3] }[k];
    const v = Math.round(Math.min(lim[1], Math.max(lim[0], (+p[k] || (k === 'zoom' ? 1 : 0)) + dv)) * 10) / 10;
    if (k === 'zoom') { saveReaderPrefs({ [k]: v }); renderPanel(); if (st.mode === 'pdf') rebuildKeep(); return; }
    keepPlace(() => { saveReaderPrefs({ [k]: v }); applyTheme(); renderPanel(); });
  },
  ...Object.fromEntries(Object.entries(AI_ACTS).filter(([k]) => k !== 'run').map(([k, f]) => [k, (b) => f(st, b)])),
};
// Font, size, spacing or margin changes re-flow the text: stay on the same sentence.
function keepPlace(fn) {
  const pos = st.mode === 'flow' ? currentPos() : null;
  fn();
  if (pos) setTimeout(() => goTo(pos.page, { frac: pos.frac, anchor: pos.anchor, quiet: true }), 30);
}
async function rebuildKeep() { const pos = currentPos(); await buildView(); goTo(pos.page, { frac: pos.frac, quiet: true }); }
const CHANGES = {
  font: (el) => keepPlace(() => { saveReaderPrefs({ font: el.value }); applyTheme(); }),
  bg: (el) => { saveReaderPrefs({ bg: el.value, theme: 'custom' }); applyTheme(); },
  fg: (el) => { saveReaderPrefs({ fg: el.value, theme: 'custom' }); applyTheme(); },
  pdfDark: (el) => { saveReaderPrefs({ pdfDark: el.checked }); applyTheme(); },
  autoOrig: (el) => saveReaderPrefs({ autoOrig: el.checked }),
  defText: (el) => saveReaderPrefs({ defMode: el.checked ? 'flow' : 'pdf' }),
};

function wireRoot(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ract]');
    if (b) { e.preventDefault(); ACTS[b.dataset.ract]?.(b, e); return; }
    const m = e.target.closest('mark.hl, .hl-pin');
    if (m && getSelection().isCollapsed) { showNotePop(m.dataset.nid, e.clientX, e.clientY); return; }
    // Original-page view: highlight boxes sit under the text, so find them by position.
    const pg = e.target.closest('.rpage');
    if (pg && getSelection().isCollapsed) {
      const hit = [...pg.querySelectorAll('.hlr[data-nid]')].find((h) => { const r = h.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      if (hit) { showNotePop(hit.dataset.nid, e.clientX, e.clientY); return; }
    }
    if (!e.target.closest('#rdPop')) $r('#rdPop').hidden = true;
  });
  root.addEventListener('change', (e) => { const el = e.target.closest('[data-rchange]'); if (el) CHANGES[el.dataset.rchange]?.(el); });
  root.addEventListener('mouseup', () => setTimeout(onSelection, 10));
  root.addEventListener('touchend', () => setTimeout(onSelection, 250));
  root.addEventListener('pointermove', (e) => { st && (st.lastActivity = Date.now()); if (document.fullscreenElement || root.classList.contains('rd-zen')) { root.classList.toggle('show-bars', e.clientY < 70 || e.clientY > innerHeight - 50); } });
}
document.addEventListener('selectionchange', () => { if (st && !getSelection().isCollapsed) { clearTimeout(st.selT); st.selT = setTimeout(onSelection, 400); } });
document.addEventListener('keydown', (e) => {
  if (!st?.doc || document.querySelector('#modal')?.open) return;
  st.lastActivity = Date.now();
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); st.panel = 'search'; renderPanel(); return; }
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (!$r('#rdSel').hidden) { $r('#rdSel').hidden = true; getSelection().removeAllRanges(); } else if (st.panel) togglePanel(st.panel); else if (st.root.classList.contains('rd-zen')) st.root.classList.remove('rd-zen'); }
  else if (k === 'h' && st.sel) createFromSelection('highlight', st.lastColor || 'yellow');
  else if (k === 'u' && st.sel) createFromSelection('highlight', st.lastColor || 'yellow', 'underline');
  else if (k === 'n') { if (st.sel) { const n = createFromSelection('note', st.lastColor || 'yellow'); if (n) editNote(n, true); } else ACTS.newnote(); }
  else if (k === 'b') toggleBookmark();
  else if (k === 'f') toggleFull();
  else if (k === '/') { e.preventDefault(); st.panel = 'search'; renderPanel(); }
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (st.mode === 'pdf' || e.key === 'PageDown') { e.preventDefault(); goTo(st.page + 1); } }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (st.mode === 'pdf' || e.key === 'PageUp') { e.preventDefault(); goTo(st.page - (st.frac > 0.05 && st.mode === 'pdf' ? 0 : 1)); } }
  else return;
});
window.addEventListener('pb-ai-key', () => { if (st?.panel === 'ai') renderPanel(); });
window.addEventListener('resize', () => { if (st?.doc && st.mode === 'pdf') { clearTimeout(st.rsT); st.rsT = setTimeout(rebuildKeep, 400); } });
window.addEventListener('online', () => { const s = st && $r('#rdSync'); if (s) s.textContent = 'Back online — synced'; });
window.addEventListener('offline', () => { const s = st && $r('#rdSync'); if (s) s.textContent = 'Offline — saving on this device'; });
