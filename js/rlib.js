// Library / Reader core: data, file + text storage, PDF / EPUB processing, the reflow ("Text") builder,
// OCR for scanned pages, quote anchors, offline cache, exports, backup and reading statistics.
//
// Everything is private to the signed-in person (their own space):
//   rdocs   one item per book / document: title, author, pages, fileId (the original), textId (processed text), cover ...
//   rprog   one item per document (single bucket): where the person is { page, frac, anchor, mode, pinned, at, dev }
//   rnotes  highlights, notes, bookmarks, AI notes and flashcards, each tied to a document + page + quoted text
//   rstats  one item per day (single bucket): reading seconds, pages, seconds per document
// Files (original + processed text) live as zfile_ documents in the same private space, in 900 KB pieces.
export const R = {};
export function initRlib(ctx) { Object.assign(R, ctx); }

export const MAX_MB = 50;
export const docs = () => R.S.all('rdocs');
export const getDoc = (id) => R.S.get('rdocs', id);
export const progOf = (id) => R.S.get('rprog', id);
export const notesOf = (id) => R.S.all('rnotes').filter((n) => n.docId === id);
export const allNotes = () => R.S.all('rnotes');
export const readerPrefs = () => ({ font: 'serif', size: 19, lh: 1.65, margin: 'normal', align: 'left', theme: 'sepia', pdfDark: false, zoom: 1, ...(R.S.get('settings', 'reader') || {}) });
export const saveReaderPrefs = (patch) => R.S.put('settings', { ...(R.S.get('settings', 'reader') || {}), ...patch, id: 'reader' });
export const COLORS = { yellow: '#ffd54a', green: '#7ee0a1', blue: '#79b8ff', pink: '#ff8fb3', purple: '#c3a6ff' };

// A note clicked in the Library: the reader opens at it instead of at the saved place.
let pendingJump = null;
export const setJump = (j) => { pendingJump = j; };
export const takeJump = (docId) => { const j = pendingJump && pendingJump.docId === docId ? pendingJump : null; pendingJump = null; return j; };

export const deviceId = (() => {
  try { let d = localStorage.getItem('tracker.device'); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem('tracker.device', d); } return d; }
  catch { return 'dev'; }
})();

/* ---------- script loading ---------- */
const LIBS = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  tess: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  zip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
};
const loaded = {};
export function script(src) {
  return (loaded[src] ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: () => { delete loaded[src]; reject(new Error('Could not load a reader component. Check the internet connection.')); } });
    document.head.appendChild(s);
  }));
}
export async function pdfjs() {
  await script(LIBS.pdf);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  return window.pdfjsLib;
}

/* ---------- small helpers ---------- */
export async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r[how](file); });
function b64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const bytesFromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const encodeJSON = (obj) => b64FromBytes(new TextEncoder().encode(JSON.stringify(obj)));
const decodeJSON = (b64) => JSON.parse(new TextDecoder().decode(bytesFromB64(b64)));
export const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
export const fmtMins = (secs) => { const m = Math.round((secs || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
export const todayKey = () => R.today();

/* ---------- offline cache (Cache Storage, per device) ---------- */
const CACHE = 'pb-reader-v1';
const ckey = (id) => `${location.origin}/__pbreader/${id}`;
async function cacheGet(id) { try { const c = await caches.open(CACHE); const r = await c.match(ckey(id)); return r ? await r.text() : null; } catch { return null; } }
async function cachePut(id, text) { try { const c = await caches.open(CACHE); await c.put(ckey(id), new Response(text)); } catch {} }
async function cacheDel(id) { try { const c = await caches.open(CACHE); await c.delete(ckey(id)); } catch {} }
export async function isOffline(d) { try { const c = await caches.open(CACHE); return !!(await c.match(ckey(d.fileId))) && !!(await c.match(ckey(d.textId))); } catch { return false; } }

// The original file as an ArrayBuffer: from this device's cache, else downloaded (and cached).
export async function fileBytes(d, onProgress) {
  let s = await cacheGet(d.fileId);
  if (!s) {
    const f = await R.S.getFile(d.fileId, onProgress, d.fileSp || 'me');
    if (!f) throw new Error('The file is missing from storage.');
    s = f.data;
    cachePut(d.fileId, s);
  }
  return (await fetch(s)).arrayBuffer();
}
export async function fileDataUrl(d) {
  let s = await cacheGet(d.fileId);
  if (!s) { const f = await R.S.getFile(d.fileId, null, d.fileSp || 'me'); if (!f) throw new Error('The file is missing from storage.'); s = f.data; cachePut(d.fileId, s); }
  return s;
}
const textMem = new Map();
export async function textOf(d) {
  const k = `${d.textId}@${d.textVer || 1}`;
  if (textMem.has(k)) return textMem.get(k);
  let s = await cacheGet(k);
  if (!s) {
    const f = await R.S.getFile(d.textId, null, 'me');
    if (!f) throw new Error('The processed text is missing. Re-process the document from its menu.');
    s = f.data;
    cachePut(k, s);
  }
  const t = decodeJSON(s);
  textMem.set(k, t);
  return t;
}
async function saveText(textId, ver, text) {
  const s = encodeJSON(text);
  await R.S.putFile(textId, { data: s, type: 'application/json', name: 'text.json' }, null, 'me');
  const k = `${textId}@${ver}`;
  textMem.set(k, text);
  await cachePut(k, s);
}
export async function makeOffline(d) { await fileBytes(d); await textOf(d); }
export async function dropOffline(d) { await cacheDel(d.fileId); await cacheDel(`${d.textId}@${d.textVer || 1}`); }

/* ---------- reflow: PDF text items -> lines -> paragraphs / headings / rows ---------- */
function itemsOf(tc) {
  return tc.items.filter((i) => typeof i.str === 'string' && i.str.trim()).map((i) => {
    const [a, b, c, d2, e, f] = i.transform;
    const h = Math.hypot(c, d2) || i.height || 10;
    return { s: i.str, x: e, y: f, h, w: i.width || i.str.length * h * 0.5, rot: Math.abs(b) > Math.abs(a) };
  }).filter((i) => !i.rot);
}
// Two-column pages: find an empty vertical gutter in the middle and read the left column first.
function splitColumns(items, pageW) {
  if (items.length < 40) return [items];
  let best = null;
  for (let gx = pageW * 0.3; gx <= pageW * 0.7; gx += pageW / 60) {
    const cross = items.filter((i) => i.x < gx && i.x + i.w > gx).length;
    const left = items.filter((i) => i.x + i.w <= gx).length;
    const right = items.filter((i) => i.x >= gx).length;
    if (left > items.length * 0.25 && right > items.length * 0.25 && cross <= items.length * 0.03 && (!best || cross < best.cross)) best = { gx, cross };
  }
  if (!best) return [items];
  return [items.filter((i) => i.x + i.w / 2 < best.gx), items.filter((i) => i.x + i.w / 2 >= best.gx)];
}
function toLines(items) {
  const sorted = items.slice().sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const it of sorted) {
    let L = null;
    for (let k = lines.length - 1; k >= Math.max(0, lines.length - 3); k--) if (Math.abs(lines[k].y - it.y) < 0.45 * Math.max(it.h, lines[k].h)) { L = lines[k]; break; }
    if (!L) { L = { y: it.y, h: it.h, items: [] }; lines.push(L); }
    L.items.push(it);
    L.h = Math.max(L.h, it.h);
  }
  return lines.map((L) => {
    L.items.sort((p, q) => p.x - q.x);
    let text = '', bigGaps = 0, prevEnd = null;
    for (const it of L.items) {
      if (prevEnd != null) {
        const gap = it.x - prevEnd;
        if (gap > 2 * L.h) { bigGaps++; text += '\t'; }
        else if (gap > 0.15 * L.h && !text.endsWith(' ') && !it.s.startsWith(' ')) text += ' ';
      }
      text += it.s;
      prevEnd = it.x + it.w;
    }
    return { text: text.replace(/ {2,}/g, ' ').trim(), x: L.items[0].x, x2: prevEnd, y: L.y, h: L.h, cells: bigGaps };
  }).filter((l) => l.text);
}
const median = (xs) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const BULLET = /^([•▪●◦‣\-–—*]|\(?\d{1,2}[.)]|\(?[a-z][.)]|[ivx]{1,4}[.)])\s+/i;
function toBlocks(lines, docSize) {
  const blocks = [];
  const gaps = [];
  for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0) gaps.push(g); }
  const lineGap = median(gaps) || 14;
  const maxX2 = Math.max(...lines.map((l) => l.x2 || 0));
  let cur = null;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], prev = lines[i - 1];
    if (l.cells >= 2) { flush(); blocks.push(['row', l.text]); continue; }
    const big = l.h >= docSize * 1.2 && l.text.length < 140;
    const gap = prev ? prev.y - l.y : 0;
    const newPara = !cur || cur[0] === 'h' !== big || gap > lineGap * 1.45 || Math.abs(l.h - (cur._h || l.h)) > l.h * 0.15 || BULLET.test(l.text)
      || (prev && prev.x2 < maxX2 - 4 * l.h && /[.:!?)"”]$/.test(prev.text));
    if (newPara) {
      flush();
      cur = [big ? 'h' : BULLET.test(l.text) ? 'li' : 'p', l.text];
      cur._h = l.h;
      if (big) cur.push(l.h >= docSize * 1.6 ? 1 : 2);
      continue;
    }
    if (/[A-Za-z]-$/.test(cur[1]) && /^[a-z]/.test(l.text)) cur[1] = cur[1].slice(0, -1) + l.text;
    else cur[1] += ' ' + l.text;
  }
  flush();
  return blocks.map((b) => { delete b._h; return b; });
}

/* ---------- processing a PDF ---------- */
async function outlineToc(pdf) {
  const out = [];
  let ol = null;
  try { ol = await pdf.getOutline(); } catch {}
  const walk = async (items, lvl) => {
    for (const it of items || []) {
      let page = null;
      try {
        const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
        if (dest?.[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
      } catch {}
      if (it.title) out.push({ t: it.title.trim(), p: page, l: lvl });
      if (lvl < 3) await walk(it.items, lvl + 1);
    }
  };
  await walk(ol, 1);
  return out.filter((x) => x.p);
}
async function coverFrom(page) {
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 180 / vp0.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise; // 'print': no animation frames, works in a background tab
  return c.toDataURL('image/jpeg', 0.6);
}
export async function processPdf(buf, onStatus) {
  const lib = await pdfjs();
  let pdf;
  try { pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; }
  catch (e) { throw new Error(/password/i.test(e?.message || e?.name) ? 'This PDF is password-protected. Remove the password and upload again.' : "This PDF can't be opened — it may be damaged."); }
  let meta = {};
  try { meta = (await pdf.getMetadata())?.info || {}; } catch {}
  const n = pdf.numPages;
  const raw = [];
  const sizes = [];
  for (let p = 1; p <= n; p++) {
    if (p % 10 === 1) onStatus?.(`Reading the text… page ${p} of ${n}`);
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    raw.push({ items: itemsOf(tc), w: vp.width, h: vp.height });
    sizes.push(...raw[p - 1].items.map((i) => i.h));
    page.cleanup();
  }
  const docSize = median(sizes) || 10;
  const pages = raw.map((r) => {
    const cols = splitColumns(r.items, r.w);
    const lines = cols.flatMap(toLines);
    const t = lines.map((l) => l.text.replace(/\t/g, '  ')).join('\n');
    const pg = { sz: [Math.round(r.w), Math.round(r.h)], t, b: toBlocks(lines, docSize) };
    const chars = t.replace(/\s/g, '').length;
    const rows = pg.b.filter((b) => b[0] === 'row').length;
    if (chars < 25) pg.f = 'scan';
    else if (rows >= 4 && rows >= pg.b.length * 0.25) pg.f = 'tbl';
    return pg;
  });
  onStatus?.('Making the cover…');
  const cover = await coverFrom(await pdf.getPage(1)).catch(() => null);
  const toc = await outlineToc(pdf);
  const firstHeading = pages.slice(0, 3).flatMap((p) => p.b).find((b) => b[0] === 'h')?.[1];
  pdf.destroy();
  return {
    title: (meta.Title || '').trim() || firstHeading || '', author: (meta.Author || '').trim(), pages: n, cover, toc,
    text: { v: 1, kind: 'pdf', pages },
    needOcr: pages.map((p, i) => (p.f === 'scan' ? i + 1 : 0)).filter(Boolean),
  };
}

/* ---------- processing an EPUB (each spine chapter becomes a "page") ---------- */
export async function processEpub(buf, onStatus) {
  await script(LIBS.zip);
  let zip;
  try { zip = await window.JSZip.loadAsync(buf); } catch { throw new Error("This EPUB can't be opened — it may be damaged."); }
  const read = async (p) => { const f = zip.file(p); if (!f) throw new Error('This EPUB is missing ' + p); return f.async('string'); };
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const container = xml(await read('META-INF/container.xml'));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no table of contents file.');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = xml(await read(opfPath));
  const manifest = Object.fromEntries([...opf.querySelectorAll('manifest > item')].map((i) => [i.getAttribute('id'), { href: i.getAttribute('href'), type: i.getAttribute('media-type'), props: i.getAttribute('properties') || '' }]));
  const spine = [...opf.querySelectorAll('spine > itemref')].map((r) => manifest[r.getAttribute('idref')]).filter((m) => m && /html/.test(m.type));
  const title = opf.querySelector('metadata title, metadata dc\\:title')?.textContent?.trim() || '';
  const author = opf.querySelector('metadata creator, metadata dc\\:creator')?.textContent?.trim() || '';
  const pages = [];
  const toc = [];
  for (const [i, m] of spine.entries()) {
    if (i % 5 === 0) onStatus?.(`Reading chapter ${i + 1} of ${spine.length}…`);
    const path = decodeURIComponent(base + m.href);
    let doc;
    try { doc = new DOMParser().parseFromString(await read(path), 'application/xhtml+xml'); if (doc.querySelector('parsererror')) throw 0; }
    catch { doc = new DOMParser().parseFromString(await read(path), 'text/html'); }
    const b = [];
    for (const el of doc.body?.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,tr,figcaption,dt,dd') || []) {
      if (el.closest('li,blockquote,tr') && el.closest('li,blockquote,tr') !== el && /^(P|LI)$/.test(el.tagName)) continue;
      const tx = el.textContent.replace(/\s+/g, ' ').trim();
      if (!tx) continue;
      const tag = el.tagName.toLowerCase();
      if (/^h\d$/.test(tag)) { b.push(['h', tx, +tag[1] <= 1 ? 1 : 2]); if (+tag[1] <= 2) toc.push({ t: tx, p: i + 1, l: +tag[1] }); }
      else if (tag === 'li') b.push(['li', tx]);
      else if (tag === 'tr') b.push(['row', [...el.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('\t')]);
      else b.push(['p', tx]);
    }
    if (!b.length) continue;
    pages.push({ t: b.map((x) => x[1]).join('\n'), b });
  }
  if (!pages.length) throw new Error('No readable text was found in this EPUB.');
  let cover = null;
  const coverItem = Object.values(manifest).find((m) => /cover-image/.test(m.props)) || Object.values(manifest).find((m) => /image/.test(m.type) && /cover/i.test(m.href));
  if (coverItem) {
    try {
      const blob = await zip.file(decodeURIComponent(base + coverItem.href)).async('blob');
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
      const c = document.createElement('canvas'); const k = 180 / img.naturalWidth;
      c.width = 180; c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cover = c.toDataURL('image/jpeg', 0.6);
    } catch {}
  }
  return { title, author, pages: pages.length, cover, toc: toc.length ? toc : pages.map((p, i) => ({ t: (p.b.find((x) => x[0] === 'h')?.[1] || `Chapter ${i + 1}`).slice(0, 80), p: i + 1, l: 1 })), text: { v: 1, kind: 'epub', pages }, needOcr: [] };
}

/* ---------- import ---------- */
export async function importFile(file, { collection, onStatus } = {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isEpub = file.type === 'application/epub+zip' || /\.epub$/i.test(file.name);
  if (!isPdf && !isEpub) throw new Error(`${file.name}: only PDF and EPUB files can be read here.`);
  if (file.size > MAX_MB * 1048576) throw new Error(`${file.name} is over ${MAX_MB} MB.`);
  onStatus?.('Checking the file…');
  const buf = await file.arrayBuffer();
  const fp = await sha256(buf);
  const dup = docs().find((d) => d.fp === fp);
  if (dup) return { dup };
  const info = isPdf ? await processPdf(buf, onStatus) : await processEpub(buf, onStatus);
  const id = R.S.uid(), fileId = R.S.uid(), textId = R.S.uid();
  onStatus?.('Uploading…');
  const data = await readAs(file, 'readAsDataURL');
  await R.S.putFile(fileId, { data, type: file.type || (isPdf ? 'application/pdf' : 'application/epub+zip'), name: file.name }, (p) => onStatus?.(`Uploading… ${Math.round(p * 100)}%`), 'me');
  cachePut(fileId, data);
  onStatus?.('Saving the text…');
  await saveText(textId, 1, info.text);
  const d = R.S.put('rdocs', {
    id, kind: isPdf ? 'pdf' : 'epub', title: info.title || file.name.replace(/\.(pdf|epub)$/i, ''), author: info.author || '', name: file.name, size: file.size,
    pages: info.pages, fileId, textId, textVer: 1, fp, cover: info.cover, toc: info.toc.slice(0, 400), collections: collection ? [collection] : [],
    status: 'unread', ocr: info.needOcr.length ? { need: info.needOcr, done: 0 } : null, addedAt: R.S.nowISO(),
  });
  return { doc: d };
}

// A company Documents PDF opened in the reader: processed into this person's library without copying the file.
export async function importCompanyDoc(cd, onStatus) {
  const dup = docs().find((d) => d.fileId === cd.fileId);
  if (dup) return { dup };
  const f = await R.S.getFile(cd.fileId, (p) => onStatus?.(`Loading… ${Math.round(p * 100)}%`), 'co');
  if (!f) throw new Error('The file is missing.');
  const buf = await (await fetch(f.data)).arrayBuffer();
  const info = await processPdf(buf, onStatus);
  const textId = R.S.uid();
  await saveText(textId, 1, info.text);
  cachePut(cd.fileId, f.data);
  const d = R.S.put('rdocs', {
    kind: 'pdf', title: cd.title || info.title, author: info.author || '', name: cd.name, size: cd.size, pages: info.pages, fileId: cd.fileId, fileSp: 'co',
    textId, textVer: 1, fp: await sha256(buf), cover: info.cover, toc: info.toc.slice(0, 400), collections: ['Company documents'], status: 'unread',
    ocr: info.needOcr.length ? { need: info.needOcr, done: 0 } : null, addedAt: R.S.nowISO(),
  });
  return { doc: d };
}

/* ---------- OCR for scanned pages (in the browser, saved as it goes, resumable) ---------- */
let ocrBusy = null;
export const ocrRunning = () => ocrBusy;
export async function runOcr(d, onStatus) {
  if (ocrBusy) throw new Error('Another document is being read already.');
  if (!d.ocr?.need?.length) return;
  ocrBusy = d.id;
  try {
    await script(LIBS.tess);
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await fileBytes(d)) }).promise;
    const text = structuredClone(await textOf(d));
    const worker = await window.Tesseract.createWorker('eng');
    let done = d.ocr.done || 0, sinceSave = 0;
    const todo = d.ocr.need.slice(done);
    for (const p of todo) {
      onStatus?.(`Reading scanned page ${p} (${done + 1} of ${d.ocr.need.length})…`);
      const page = await pdf.getPage(p);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2.5, 2000 / vp0.width) });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise;
      const { data } = await worker.recognize(c);
      const W = c.width, H = c.height;
      const pg = text.pages[p - 1];
      pg.t = data.text || '';
      pg.w = (data.words || []).filter((w) => w.confidence > 30).map((w) => [w.text, +(w.bbox.x0 / W).toFixed(4), +(w.bbox.y0 / H).toFixed(4), +((w.bbox.x1 - w.bbox.x0) / W).toFixed(4), +((w.bbox.y1 - w.bbox.y0) / H).toFixed(4)]);
      pg.b = (data.paragraphs || []).map((pa) => ['p', pa.text.replace(/\s+/g, ' ').trim()]).filter((x) => x[1]);
      pg.f = 'ocr';
      done++; sinceSave++;
      if (sinceSave >= 8 || done === d.ocr.need.length) {
        const ver = (getDoc(d.id)?.textVer || 1) + 1;
        await saveText(d.textId, ver, text);
        R.S.update('rdocs', d.id, { textVer: ver, ocr: { need: d.ocr.need, done } });
        sinceSave = 0;
      }
    }
    await worker.terminate();
    pdf.destroy();
    onStatus?.('Scanned pages are readable now.');
  } finally { ocrBusy = null; }
}

/* ---------- quote anchors: find saved text again in any rendering ---------- */
// Matching ignores spaces and case, so the same passage is found in the original-page text layer
// (which splits words oddly) and in the Text view (which joins lines).
export function findQuote(root, quote, prefix = '', approx = null) {
  if (!root || !quote) return null;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('.no-anchor') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let flat = '';
  const map = [];
  for (let n; (n = walker.nextNode());) {
    const s = n.nodeValue;
    for (let i = 0; i < s.length; i++) if (!/\s/.test(s[i])) { flat += s[i].toLowerCase(); map.push([n, i]); }
    nodes.push(n);
  }
  const q = quote.replace(/\s+/g, '').toLowerCase();
  if (!q) return null;
  const pre = (prefix || '').replace(/\s+/g, '').toLowerCase().slice(-24);
  let at = -1, best = Infinity;
  for (let i = flat.indexOf(q); i >= 0; i = flat.indexOf(q, i + 1)) {
    let score = 0;
    if (pre && flat.slice(Math.max(0, i - pre.length), i) !== pre) score += 1000;
    if (approx != null) score += Math.abs(i - approx);
    if (score < best) { best = score; at = i; }
    if (!pre && approx == null) break;
  }
  if (at < 0) return null;
  const [sn, so] = map[at], [en, eo] = map[at + q.length - 1];
  const r = document.createRange();
  r.setStart(sn, so); r.setEnd(en, eo + 1);
  return r;
}
// Context of a selection inside a page element: the quote plus a little text before and after.
export function selectionAnchor(pageEl, range) {
  const quote = range.toString().replace(/\s+/g, ' ').trim();
  const before = document.createRange(); before.setStart(pageEl, 0); before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange(); after.setStart(range.endContainer, range.endOffset); after.setEnd(pageEl, pageEl.childNodes.length);
  const pre = before.toString().replace(/\s+/g, ' ');
  return { quote, prefix: pre.slice(-40), suffix: after.toString().replace(/\s+/g, ' ').slice(0, 40), approx: pre.replace(/\s+/g, '').length };
}
// Wrap a range in <mark> elements (one per text node it touches).
export function markRange(range, attrs) {
  const out = [];
  const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n; (n = walker.nextNode());) if (range.intersectsNode(n)) texts.push(n);
  for (const n of texts) {
    let s = 0, e = n.nodeValue.length;
    if (n === range.startContainer) s = range.startOffset;
    if (n === range.endContainer) e = range.endOffset;
    if (e <= s || !n.nodeValue.slice(s, e).trim()) continue;
    const r = document.createRange(); r.setStart(n, s); r.setEnd(n, e);
    const m = document.createElement('mark');
    Object.entries(attrs).forEach(([k, v]) => m.setAttribute(k, v));
    try { r.surroundContents(m); out.push(m); } catch {}
  }
  return out;
}

/* ---------- reading statistics ---------- */
let pending = { secs: 0, pages: 0, docs: {} }, flushTimer = null;
export function addReading(docId, secs, pages = 0) {
  pending.secs += secs; pending.pages += pages;
  pending.docs[docId] = (pending.docs[docId] || 0) + secs;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushStats, 60000);
}
export function flushStats() {
  clearTimeout(flushTimer);
  if (!pending.secs && !pending.pages) return;
  const k = todayKey();
  const cur = R.S.get('rstats', k) || { id: k, secs: 0, pages: 0, docs: {} };
  const docsMap = { ...(cur.docs || {}) };
  for (const [id, s] of Object.entries(pending.docs)) docsMap[id] = (docsMap[id] || 0) + s;
  R.S.put('rstats', { ...cur, secs: (cur.secs || 0) + pending.secs, pages: (cur.pages || 0) + pending.pages, docs: docsMap });
  for (const [id, s] of Object.entries(pending.docs)) { const d = getDoc(id); if (d) R.S.update('rdocs', id, { readSecs: (d.readSecs || 0) + s }); }
  pending = { secs: 0, pages: 0, docs: {} };
}
window.addEventListener('pagehide', flushStats);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushStats(); });

/* ---------- exports ---------- */
const KIND_LABEL = { highlight: 'Highlight', note: 'Note', bookmark: 'Bookmark', ai: 'AI note', card: 'Flashcard' };
export function notesMarkdown(list, { title = 'Notes' } = {}) {
  const byDoc = new Map();
  for (const n of list) (byDoc.get(n.docId) || byDoc.set(n.docId, []).get(n.docId)).push(n);
  let md = `# ${title}\n\n_Exported from Playbook on ${new Date().toLocaleString()}_\n`;
  for (const [docId, ns] of byDoc) {
    const d = getDoc(docId);
    md += `\n## ${d?.title || ns[0].docTitle || 'Untitled'}${d?.author ? ` — ${d.author}` : ''}\n`;
    for (const n of ns.sort((a, b) => (a.page || 0) - (b.page || 0) || (a.at || '').localeCompare(b.at || ''))) {
      md += `\n**${KIND_LABEL[n.kind] || 'Note'}${n.page ? ` · p. ${n.page}` : ''}${n.color && n.kind === 'highlight' ? ` · ${n.color}` : ''}${n.tags?.length ? ` · #${n.tags.join(' #')}` : ''}**\n`;
      if (n.kind === 'card') md += `\nQ: ${n.q}\n\nA: ${n.a}\n`;
      if (n.quote) md += `\n> ${n.quote.replace(/\n/g, '\n> ')}\n`;
      if (n.note) md += `\n${n.kind === 'ai' ? '_(AI-generated)_ ' : ''}${n.note}\n`;
    }
  }
  return md;
}
export const notesText = (list, opts) => notesMarkdown(list, opts).replace(/^#+ /gm, '').replace(/\*\*/g, '').replace(/^> /gm, '  "').replace(/_\(AI-generated\)_/g, '(AI-generated)');
export function printNotes(list, opts) {
  const md = notesMarkdown(list, opts);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const html = esc(md).replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>').replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/_(.*?)_/g, '<i>$1</i>').replace(/\n\n/g, '<br><br>');
  const w = window.open('', '_blank');
  if (!w) { R.toast('Allow pop-ups to print or save as PDF'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(opts?.title || 'Notes')}</title><style>body{font:15px/1.6 Georgia,serif;max-width:720px;margin:32px auto;padding:0 16px;color:#222}h1{font-size:26px}h2{margin-top:28px;border-bottom:1px solid #ddd}blockquote{margin:6px 0;padding:4px 12px;border-left:4px solid #e8c547;background:#fffbe6}</style>${html}<script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}
// The original PDF with highlights and notes written in as real PDF annotations (opens in any PDF reader).
export async function annotatedPdf(d) {
  await script(LIBS.pdflib);
  const { PDFDocument, PDFName, PDFString } = window.PDFLib;
  const pdf = await PDFDocument.load(await fileBytes(d), { ignoreEncryption: true });
  const pages = pdf.getPages();
  const hex = (c) => { const h = (COLORS[c] || COLORS.yellow).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  let n = 0;
  for (const note of notesOf(d.id)) {
    const page = pages[(note.page || 1) - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    if (note.kind === 'highlight' && note.rects?.length) {
      const quads = [], xs = [], ys = [];
      for (const [x, y, w, h] of note.rects) {
        const x1 = x * W, x2 = (x + w) * W, y1 = H - y * H, y2 = H - (y + h) * H;
        quads.push(x1, y1, x2, y1, x1, y2, x2, y2); xs.push(x1, x2); ys.push(y1, y2);
      }
      const annot = pdf.context.obj({
        Type: 'Annot', Subtype: note.style === 'underline' ? 'Underline' : 'Highlight', Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        QuadPoints: quads, C: hex(note.color), CA: 0.45, F: 4, Contents: PDFString.of(note.note || note.quote || ''), T: PDFString.of(R.meName()),
      });
      page.node.addAnnot(pdf.context.register(annot)); n++;
    } else if (note.note || note.kind === 'bookmark') {
      const annot = pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [W - 40, H - 40 - (n % 10) * 22, W - 20, H - 20 - (n % 10) * 22], Name: PDFName.of('Comment'), C: hex(note.color || 'yellow'), F: 4, Contents: PDFString.of(`${note.quote ? `"${note.quote}"\n\n` : ''}${note.note || 'Bookmark'}`), T: PDFString.of(R.meName()) });
      page.node.addAnnot(pdf.context.register(annot)); n++;
    }
  }
  const bytes = await pdf.save();
  R.download(`${d.title.replace(/[\\/:*?"<>|]/g, '_')} (annotated).pdf`, new Blob([bytes], { type: 'application/pdf' }));
  return n;
}

/* ---------- backup / restore (progress, notes, statistics, document details; not the files) ---------- */
export function backup() {
  const out = { kind: 'playbook-library-backup', v: 1, at: R.S.nowISO(), docs: docs().map(({ cover, ...d }) => d), prog: R.S.all('rprog'), notes: allNotes(), stats: R.S.all('rstats') };
  R.download(`library-backup-${R.today()}.json`, new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
}
export async function restore(file) {
  const j = JSON.parse(await file.text());
  if (j.kind !== 'playbook-library-backup') throw new Error('This is not a Library backup file.');
  const strip = ({ _b, ...x }) => x;
  const newer = (col, list) => list.filter((x) => { const cur = R.S.get(col, x.id); return !cur || (x.updatedAt || '') > (cur.updatedAt || ''); }).map(strip);
  const counts = {};
  for (const [col, list] of [['rprog', j.prog || []], ['rnotes', j.notes || []], ['rstats', j.stats || []], ['rdocs', (j.docs || []).filter((d) => getDoc(d.id))]]) {
    const xs = newer(col, list);
    if (xs.length) await R.S.putMany(col, xs);
    counts[col] = xs.length;
  }
  return counts;
}

export async function deleteDoc(d, keepNotes) {
  if (!keepNotes) for (const n of notesOf(d.id)) R.S.remove('rnotes', n);
  else for (const n of notesOf(d.id)) if (!n.docTitle) R.S.update('rnotes', n.id, { docTitle: d.title, docGone: true });
  const p = progOf(d.id); if (p) R.S.remove('rprog', p);
  R.S.remove('rdocs', d);
  await dropOffline(d);
  if (d.fileSp !== 'co') await R.S.deleteFile(d.fileId, 'me').catch(() => {});
  await R.S.deleteFile(d.textId, 'me').catch(() => {});
}
