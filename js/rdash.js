// Library page (#/read): continue reading, recent, the library itself, collections, every highlight / note /
// bookmark / flashcard across documents, reading statistics and history, uploads, backup and settings.
import {
  R, initRlib, docs, getDoc, progOf, allNotes, COLORS, importFile, importCompanyDoc, fmtSize, fmtMins, isOffline, makeOffline, dropOffline,
  runOcr, ocrRunning, deleteDoc, notesMarkdown, notesText, printNotes, backup, restore, fileDataUrl, setJump,
} from './rlib.js';
import { syncReader, exportDoc, editNote } from './rview.js';
import { keyModal, aiKey } from './rai.js';

export function initReader(ctx) { initRlib(ctx); }
export { syncReader };

export const rUI = { tab: 'home', q: '', status: 'all', col: 'all', sort: 'recent', nq: '', nkind: 'all', ndoc: 'all', ncolor: 'all', ngroup: 'doc', queue: [], offline: new Set(), study: false };
const esc = (s) => R.esc(s);
const ic = (n, s) => R.ic(n, s);
const STATUS = [['reading', 'Reading'], ['unread', 'Not started'], ['finished', 'Finished']];
const collections = () => [...new Set([...(R.S.get('settings', 'reader')?.collections || []), ...docs().flatMap((d) => d.collections || [])])].sort();
const byRecent = (a, b) => (b.lastOpened || b.addedAt || '').localeCompare(a.lastOpened || a.addedAt || '');
const pageLabel = (d) => (d.kind === 'epub' ? 'chapter' : 'page');
const posText = (d) => { const p = progOf(d.id); return p ? `${pageLabel(d)[0].toUpperCase() + pageLabel(d).slice(1)} ${p.page} of ${d.pages} · ${p.pct ?? d.pct ?? 0}%${p.pinned ? ' · 📌 kept' : ''}` : `${d.pages} ${pageLabel(d)}s · not started`; };
const cover = (d, cls = '') => (d.cover ? `<img class="cover ${cls}" src="${d.cover}" alt="" loading="lazy">` : `<span class="cover ph ${cls}">${d.kind === 'epub' ? 'EPUB' : 'PDF'}</span>`);
const open = (d) => `#/read/${d.id}`;

/* ---------- views ---------- */
export function viewLibraryHome() {
  const t = rUI.tab;
  const tabs = [['home', 'Home'], ['lib', 'My library'], ['notes', 'Notes & highlights'], ['stats', 'Stats & history']];
  const body = t === 'lib' ? viewLib() : t === 'notes' ? viewNotes() : t === 'stats' ? viewStats() : viewHome();
  queueMicrotask(checkOffline);
  return `${R.banner()}
  <header class="page-head"><div><p class="eyebrow">Private to you · synced across your devices</p><h1>Library</h1></div>
    <div class="row"><button class="icon-btn" data-act="rdSettings" title="Library settings" aria-label="Library settings">${ic('sliders', 18)}</button>
    <label class="btn primary">${ic('upload', 16)} Upload PDF / EPUB<input type="file" multiple accept="application/pdf,.pdf,application/epub+zip,.epub" data-change="rdUpload" hidden></label></div></header>
  ${queueHTML()}
  <div class="chips rd-tabs">${tabs.map(([k, l]) => `<button class="chip ${t === k ? 'active' : ''}" data-act="rdTab" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="doc-drop" data-drop="reader"><span>${ic('upload', 16)} Drop PDFs or EPUBs to add them to your library</span></div>
  ${body}`;
}

function queueHTML() {
  if (!rUI.queue.length) return '';
  return `<section class="card rq">${rUI.queue.map((q) => `<div class="rq-row ${q.state}"><b>${esc(q.name)}</b><span class="muted small">${esc(q.msg || '')}</span>${q.state === 'done' && q.id ? `<a class="btn sm" href="#/read/${q.id}">Open</a>` : ''}</div>`).join('')}
    ${rUI.queue.some((q) => q.state === 'busy' || q.state === 'wait') ? '<p class="muted small">Keep this page open until the uploads finish.</p>' : `<button class="link-btn" data-act="rdClearQ">Hide</button>`}</section>`;
}

function viewHome() {
  const all = docs();
  if (!all.length) return `<section class="card rd-empty">${ic('book', 34)}<h2>Your reading room</h2>
    <p>Upload PDFs (books, annual reports, research) or EPUBs. Read them as the original pages or as comfortable text, highlight, take notes, and pick up on any device exactly where you stopped.</p>
    <label class="btn primary">${ic('upload', 16)} Upload your first document<input type="file" multiple accept="application/pdf,.pdf,application/epub+zip,.epub" data-change="rdUpload" hidden></label></section>`;
  const recent = all.filter((d) => d.lastOpened).sort(byRecent);
  const cur = recent[0];
  const week = weekStats();
  const notes = allNotes();
  return `${cur ? `<a class="card rd-continue" href="${open(cur)}">${cover(cur, 'lg')}<span class="grow"><span class="eyebrow">Continue reading</span><b class="rc-title">${esc(cur.title)}</b><span class="muted">${esc(cur.author || '')}</span>
      <span class="rc-pos">${esc(posText(cur))}</span><span class="pbar"><i style="width:${progOf(cur.id)?.pct ?? cur.pct ?? 0}%"></i></span></span><span class="btn primary">Continue ${ic('arrowR', 16)}</span></a>` : ''}
  <section class="stats">
    ${R.stat('Read today', fmtMins(R.S.get('rstats', R.today())?.secs || 0))}
    ${R.stat('This week', fmtMins(week.secs), `${week.pages} pages`)}
    ${R.stat('Streak', `${streak()} day${streak() === 1 ? '' : 's'}`)}
    ${R.stat('Library', `${all.length}`, `${all.filter((d) => d.status === 'finished').length} finished`)}
    ${R.stat('Notes', `${notes.length}`, `${notes.filter((n) => n.kind === 'highlight').length} highlights`)}
  </section>
  ${recent.length > 1 ? `<section class="card"><div class="card-head"><h2>Recently opened</h2><button class="link-btn" data-act="rdTab" data-v="lib">All ${all.length}</button></div>
    <div class="rd-shelf">${recent.slice(1, 9).map(mini).join('')}</div></section>` : ''}
  ${all.some((d) => !d.lastOpened) ? `<section class="card"><div class="card-head"><h2>Not started</h2></div><div class="rd-shelf">${all.filter((d) => !d.lastOpened).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 8).map(mini).join('')}</div></section>` : ''}
  ${notes.length ? `<section class="card"><div class="card-head"><h2>Latest highlights</h2><button class="link-btn" data-act="rdTab" data-v="notes">All notes</button></div>${notes.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 4).map(noteItem).join('')}</section>` : ''}`;
}
const mini = (d) => `<a class="rd-mini" href="${open(d)}" title="${esc(d.title)}">${cover(d)}<b>${esc(d.title)}</b><span class="pbar"><i style="width:${progOf(d.id)?.pct ?? d.pct ?? 0}%"></i></span><small class="muted">${esc(posText(d))}</small></a>`;

function viewLib() {
  const q = rUI.q.trim().toLowerCase();
  let list = docs().filter((d) => (rUI.status === 'all' || d.status === rUI.status) && (rUI.col === 'all' || (d.collections || []).includes(rUI.col))
    && (!q || `${d.title} ${d.author} ${d.name} ${(d.collections || []).join(' ')}`.toLowerCase().includes(q)));
  const sorters = { recent: byRecent, added: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''), title: (a, b) => a.title.localeCompare(b.title), progress: (a, b) => (progOf(b.id)?.pct ?? 0) - (progOf(a.id)?.pct ?? 0), size: (a, b) => b.size - a.size };
  list = list.sort(sorters[rUI.sort] || byRecent);
  const cols = collections();
  return `<div class="chips">${[['all', 'All'], ...STATUS].map(([k, l]) => `<button class="chip ${rUI.status === k ? 'active' : ''}" data-act="rdStatus" data-v="${k}">${l} <span class="muted">${k === 'all' ? docs().length : docs().filter((d) => d.status === k).length}</span></button>`).join('')}</div>
  <div class="toolbar">
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search title, author, collection" value="${esc(rUI.q)}" data-input="rdQ"></label>
    <select class="input sm" data-change="rdCol" aria-label="Collection"><option value="all">All collections</option>${R.opts(cols, rUI.col)}</select>
    <select class="input sm" data-change="rdSort" aria-label="Sort">${R.opts([['recent', 'Recently opened'], ['added', 'Recently added'], ['title', 'Title A–Z'], ['progress', 'Progress'], ['size', 'Size']], rUI.sort)}</select>
    <button class="btn sm ghost" data-act="rdCols">${ic('sliders', 14)} Collections</button>
  </div>
  ${list.length ? `<section class="rd-grid">${list.map(docCard).join('')}</section>` : `<section class="card">${R.empty(docs().length ? 'Nothing matches.' : 'No documents yet — upload a PDF or EPUB.')}</section>`}`;
}
const docCard = (d) => {
  const p = progOf(d.id);
  const pct = p?.pct ?? d.pct ?? 0;
  return `<article class="rd-card">
  <a href="${open(d)}" class="rd-card-cover">${cover(d)}</a>
  <div class="rd-card-body">
    <a href="${open(d)}" class="rd-card-title">${esc(d.title)}</a>
    <span class="muted small">${esc(d.author || '')}</span>
    <span class="small">${esc(posText(d))}</span>
    <span class="pbar"><i style="width:${pct}%"></i></span>
    <span class="muted small">${d.pages} ${pageLabel(d)}s · ${fmtSize(d.size || 0)}${d.lastOpened ? ` · opened ${R.fmtDate(d.lastOpened.slice(0, 10))}` : ''}</span>
    <span class="rd-badges">${(d.collections || []).map((c) => `<span class="tag">${esc(c)}</span>`).join('')}${rUI.offline.has(d.id) ? '<span class="tag ok">Offline ✓</span>' : ''}${d.ocr && d.ocr.done < d.ocr.need.length ? `<span class="tag warn">${d.ocr.need.length - d.ocr.done} scanned pages to read</span>` : ''}${d.fileSp === 'co' ? '<span class="tag">Company doc</span>' : ''}</span>
  </div>
  <button class="icon-btn rd-card-menu" data-act="rdMenu" data-id="${d.id}" aria-label="More for ${esc(d.title)}">⋯</button>
</article>`;
};

function filteredNotes() {
  const q = rUI.nq.trim().toLowerCase();
  return allNotes().filter((n) => (rUI.nkind === 'all' || n.kind === rUI.nkind) && (rUI.ndoc === 'all' || n.docId === rUI.ndoc) && (rUI.ncolor === 'all' || n.color === rUI.ncolor)
    && (!q || `${n.quote} ${n.note} ${n.q} ${n.a} ${(n.tags || []).join(' ')} ${n.docTitle}`.toLowerCase().includes(q)));
}
function viewNotes() {
  const all = allNotes();
  const list = filteredNotes();
  const docOpts = [...new Map(all.map((n) => [n.docId, getDoc(n.docId)?.title || n.docTitle || 'General'])).entries()];
  if (rUI.study && rUI.nkind === 'card') return studyView(list);
  let groups;
  if (rUI.ngroup === 'tag') { const m = new Map(); for (const n of list) for (const t of n.tags?.length ? n.tags : ['(no tag)']) (m.get(t) || m.set(t, []).get(t)).push(n); groups = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }
  else if (rUI.ngroup === 'col') { const m = new Map(); for (const n of list) for (const c of getDoc(n.docId)?.collections?.length ? getDoc(n.docId).collections : ['(no collection)']) (m.get(c) || m.set(c, []).get(c)).push(n); groups = [...m.entries()]; }
  else if (rUI.ngroup === 'doc') { const m = new Map(); for (const n of list) { const k = getDoc(n.docId)?.title || n.docTitle || 'General notes'; (m.get(k) || m.set(k, []).get(k)).push(n); } groups = [...m.entries()]; }
  else groups = [['', list.sort((a, b) => (b.at || '').localeCompare(a.at || ''))]];
  return `<div class="chips">${[['all', 'All'], ['highlight', 'Highlights'], ['note', 'Notes'], ['bookmark', 'Bookmarks'], ['ai', 'AI notes'], ['card', 'Flashcards']].map(([k, l]) => `<button class="chip ${rUI.nkind === k ? 'active' : ''}" data-act="rdNKind" data-v="${k}">${l} <span class="muted">${k === 'all' ? all.length : all.filter((n) => n.kind === k).length}</span></button>`).join('')}</div>
  <div class="toolbar">
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search notes, highlights, tags" value="${esc(rUI.nq)}" data-input="rdNQ"></label>
    <select class="input sm" data-change="rdNDoc" aria-label="Document"><option value="all">All documents</option>${R.opts(docOpts, rUI.ndoc)}</select>
    <select class="input sm" data-change="rdNColor" aria-label="Colour"><option value="all">Any colour</option>${R.opts(Object.keys(COLORS), rUI.ncolor)}</select>
    <select class="input sm" data-change="rdNGroup" aria-label="Group by">${R.opts([['doc', 'Group: document'], ['tag', 'Group: tag'], ['col', 'Group: collection'], ['none', 'No grouping (newest)']], rUI.ngroup)}</select>
    <span class="spacer"></span>
    ${rUI.nkind === 'card' && list.length ? '<button class="btn sm primary" data-act="rdStudy">Study cards</button>' : ''}
    <button class="btn sm" data-act="rdNewNote">${ic('plus', 14)} Note</button>
    <button class="btn sm ghost" data-act="rdExpAll">${ic('download', 14)} Export</button>
  </div>
  ${list.length ? groups.map(([g, ns]) => `<section class="card">${g ? `<div class="card-head"><h2>${esc(g)}</h2><span class="muted small">${ns.length}</span></div>` : ''}${ns.sort((a, b) => rUI.ngroup === 'none' ? 0 : (a.page || 0) - (b.page || 0)).map(noteItem).join('')}</section>`).join('')
    : `<section class="card">${R.empty(all.length ? 'Nothing matches.' : 'Highlights and notes you make while reading appear here, from every document.')}</section>`}`;
}
const noteItem = (n) => {
  const d = getDoc(n.docId);
  return `<div class="rn-item">
    <button class="rn-main" data-act="rdGoNote" data-id="${n.id}">
      <span class="rn-meta"><i class="dot" style="background:${n.quote || n.kind === 'highlight' ? COLORS[n.color] || COLORS.yellow : 'var(--muted)'}"></i>${n.kind === 'bookmark' ? '🔖 Bookmark · ' : n.kind === 'ai' ? '<em class="ai-tag">AI</em> ' : n.kind === 'card' ? '🃏 ' : ''}${esc(d?.title || n.docTitle || 'General')}${n.page ? ` · p. ${n.page}` : ''}${n.docGone ? ' · (document removed)' : ''}${n.tags?.length ? ` · ${n.tags.map((t) => '#' + esc(t)).join(' ')}` : ''}</span>
      ${n.kind === 'card' ? `<span class="rn-q"><b>Q:</b> ${esc(n.q)}<br><b>A:</b> ${esc(n.a)}</span>` : n.quote ? `<span class="rn-q${n.style === 'underline' ? ' ul' : ''}">${esc(n.quote.length > 400 ? n.quote.slice(0, 400) + '…' : n.quote)}</span>` : n.context ? `<span class="muted small">${esc(n.context)}…</span>` : ''}
      ${n.note ? `<span class="rn-n">${esc(n.note.length > 600 ? n.note.slice(0, 600) + '…' : n.note)}</span>` : ''}
    </button>
    <span class="nrow-act"><button class="icon-btn" data-act="rdEditNote" data-id="${n.id}" aria-label="Edit">${ic('pen', 14)}</button><button class="icon-btn" data-act="rdDelNote" data-id="${n.id}" aria-label="Delete">${ic('trash', 14)}</button></span>
  </div>`;
};
function studyView(list) {
  const i = Math.min(rUI.studyI || 0, list.length - 1);
  const c = list[i];
  return `<section class="card study"><div class="card-head"><h2>Flashcards · ${i + 1} of ${list.length}</h2><button class="link-btn" data-act="rdStudy">Close</button></div>
    <button class="study-card ${rUI.showA ? 'show' : ''}" data-act="rdFlip"><span class="q">${esc(c.q)}</span><span class="a">${esc(c.a)}<small class="muted"> — ${esc(getDoc(c.docId)?.title || c.docTitle || '')}, p. ${c.page}</small></span><small class="muted hint">${rUI.showA ? '' : 'Tap to show the answer'}</small></button>
    <div class="row"><button class="btn" data-act="rdStudyMove" data-v="-1" ${i === 0 ? 'disabled' : ''}>Previous</button><span class="spacer"></span><button class="btn primary" data-act="rdStudyMove" data-v="1" ${i >= list.length - 1 ? 'disabled' : ''}>Next</button></div></section>`;
}

/* ---------- stats ---------- */
function weekStats() {
  let secs = 0, pages = 0;
  for (let i = 0; i < 7; i++) { const s = R.S.get('rstats', R.addDays(R.today(), -i)); secs += s?.secs || 0; pages += s?.pages || 0; }
  return { secs, pages };
}
function streak() {
  let n = 0;
  for (let d = R.today(), first = true; ; d = R.addDays(d, -1), first = false) {
    const s = R.S.get('rstats', d);
    if ((s?.secs || 0) >= 60) n++;
    else if (!first) break;
    if (n > 3650) break;
  }
  return n;
}
function viewStats() {
  const stats = R.S.all('rstats').sort((a, b) => b.id.localeCompare(a.id));
  const total = stats.reduce((t, s) => t + (s.secs || 0), 0), pages = stats.reduce((t, s) => t + (s.pages || 0), 0);
  const days = Array.from({ length: 14 }, (_, i) => { const d = R.addDays(R.today(), i - 13); return { d, s: R.S.get('rstats', d)?.secs || 0 }; });
  const max = Math.max(60, ...days.map((x) => x.s));
  const perDoc = new Map();
  for (const s of stats) for (const [id, v] of Object.entries(s.docs || {})) perDoc.set(id, (perDoc.get(id) || 0) + v);
  const top = [...perDoc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<section class="stats">
    ${R.stat('Total reading', fmtMins(total))}${R.stat('Pages read', pages)}${R.stat('Finished', docs().filter((d) => d.status === 'finished').length)}${R.stat('Streak', `${streak()} days`)}${R.stat('This week', fmtMins(weekStats().secs))}
  </section>
  <div class="grid2">
    <section class="card"><div class="card-head"><h2>Last 14 days</h2></div>
      <div class="rbars">${days.map((x) => `<div class="rbar" title="${R.fmtDate(x.d)}: ${fmtMins(x.s)}"><i style="height:${Math.round((x.s / max) * 100)}%"></i><small>${x.d.slice(8)}</small></div>`).join('')}</div></section>
    <section class="card"><div class="card-head"><h2>Most read</h2></div>
      ${top.length ? top.map(([id, s]) => `<div class="kv"><span>${esc(getDoc(id)?.title || '(removed)')}</span><b>${fmtMins(s)}</b></div>`).join('') : R.empty('Reading time appears after your first session.')}</section>
  </div>
  <section class="card"><div class="card-head"><h2>Reading history</h2></div>
    ${stats.length ? stats.slice(0, 30).map((s) => `<div class="kv"><span><b>${R.fmtDate(s.id)}</b> <span class="muted small">${Object.entries(s.docs || {}).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${esc(getDoc(id)?.title || '(removed)')} (${fmtMins(v)})`).join(' · ')}</span></span><b class="tnum">${fmtMins(s.secs)} · ${s.pages || 0} p.</b></div>`).join('') : R.empty('No reading yet.')}</section>`;
}

/* ---------- offline badges ---------- */
let checking = false;
async function checkOffline() {
  if (checking || rUI.tab !== 'lib') return;
  checking = true;
  const before = [...rUI.offline].join();
  const next = new Set();
  for (const d of docs()) if (await isOffline(d)) next.add(d.id);
  rUI.offline = next;
  checking = false;
  if ([...next].join() !== before) R.render();
}

/* ---------- uploads ---------- */
async function enqueue(files) {
  const list = [...files].filter(Boolean);
  if (!list.length) return;
  for (const f of list) rUI.queue.push({ file: f, name: f.name, state: 'wait', msg: 'Waiting…' });
  R.render();
  if (rUI.running) return;
  rUI.running = true;
  for (const q of rUI.queue) {
    if (q.state !== 'wait') continue;
    q.state = 'busy';
    const upd = (m) => { q.msg = m; const rows = document.querySelectorAll('.rq-row'); const i = rUI.queue.indexOf(q); if (rows[i]) rows[i].querySelector('.muted').textContent = m; };
    try {
      const col = rUI.col !== 'all' ? rUI.col : null;
      const r = await importFile(q.file, { collection: col, onStatus: upd });
      if (r.dup) { q.state = 'done'; q.id = r.dup.id; q.msg = 'Already in your library'; }
      else { q.state = 'done'; q.id = r.doc.id; q.msg = r.doc.ocr ? `Added · ${r.doc.ocr.need.length} scanned pages will be read when you open it` : 'Added'; }
    } catch (e) { q.state = 'err'; q.msg = e.message || String(e); }
    delete q.file;
    R.render();
  }
  rUI.running = false;
}

/* ---------- menus & modals ---------- */
function docMenu(d) {
  const p = progOf(d.id);
  R.openModal(d.title, `
    <div class="rd-menu-head">${cover(d)}<div><p class="small">${esc(d.author || '')}</p><p class="muted small">${d.pages} ${pageLabel(d)}s · ${fmtSize(d.size || 0)} · ${esc(d.name || '')}<br>Added ${R.fmtDate((d.addedAt || '').slice(0, 10))}${p ? ` · at ${pageLabel(d)} ${p.page}${p.pinned ? ' (kept)' : ''}` : ''}</p></div></div>
    <div class="form-grid">
      ${R.field('Title', `<input class="input" name="title" value="${esc(d.title)}" required>`)}
      ${R.field('Author', `<input class="input" name="author" value="${esc(d.author || '')}">`)}
      ${R.field('Status', `<select class="input" name="status">${R.opts(STATUS, d.status || 'unread')}</select>`)}
      ${R.field('Collections (comma separated)', `<input class="input" name="cols" value="${esc((d.collections || []).join(', '))}" list="rdColList"><datalist id="rdColList">${collections().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
    </div>
    <div class="rd-menu-acts">
      <a class="btn sm" href="${open(d)}">${ic('book', 14)} Open</a>
      <button type="button" class="btn sm" data-act="rdDl" data-id="${d.id}">${ic('download', 14)} Download original</button>
      <button type="button" class="btn sm" data-act="rdOffline" data-id="${d.id}">${rUI.offline.has(d.id) ? 'Remove offline copy' : 'Keep offline on this device'}</button>
      ${d.ocr && d.ocr.done < d.ocr.need.length ? `<button type="button" class="btn sm" data-act="rdOcr" data-id="${d.id}">Read ${d.ocr.need.length - d.ocr.done} scanned pages</button>` : ''}
      <button type="button" class="btn sm" data-act="rdExpDoc" data-id="${d.id}" data-v="md">Notes → Markdown</button>
      <button type="button" class="btn sm" data-act="rdExpDoc" data-id="${d.id}" data-v="print">Notes → PDF</button>
      ${d.kind === 'pdf' ? `<button type="button" class="btn sm" data-act="rdExpDoc" data-id="${d.id}" data-v="annot">PDF with highlights</button>` : ''}
      ${p ? `<button type="button" class="btn sm ghost" data-act="rdResetPos" data-id="${d.id}">Start again from page 1</button>` : ''}
      <button type="button" class="btn sm ghost" data-act="rdDelete" data-id="${d.id}">${ic('trash', 14)} Remove from library</button>
    </div>`,
  (v) => {
    R.S.update('rdocs', d.id, { title: v.title.trim() || d.title, author: v.author.trim(), status: v.status, collections: v.cols.split(',').map((c) => c.trim()).filter(Boolean) });
    R.toast('Saved');
  }, 'Save');
}
function settingsModal() {
  const p = R.S.get('settings', 'reader') || {};
  R.openModal('Library settings', `
    <h4>AI</h4><p class="small muted">${aiKey() ? 'Your Gemini key is saved (private to you).' : 'No AI key yet — the reader works fully without one.'}</p>
    <button type="button" class="btn sm" data-act="rdAiKey">${aiKey() ? 'Change / remove AI key' : 'Add a free Gemini AI key'}</button>
    <h4>Opening documents</h4>
    <label class="check-line small"><input type="checkbox" name="defText" ${p.defMode === 'flow' ? 'checked' : ''}> Open PDFs in Text view (instead of the original pages)</label>
    <h4>Backup</h4><p class="small muted">Reading positions, bookmarks, highlights, notes and statistics (not the files themselves — download those from each document's menu).</p>
    <div class="row"><button type="button" class="btn sm" data-act="rdBackup">${ic('download', 14)} Download backup</button><label class="btn sm">${ic('upload', 14)} Restore from backup<input type="file" accept=".json,application/json" data-change="rdRestore" hidden></label></div>`,
  (v) => R.S.put('settings', { ...p, id: 'reader', defMode: v.defText === 'on' ? 'flow' : 'pdf' }), 'Save');
}
function colsModal() {
  R.openModal('Collections', `<p class="small muted">One per line. Collections group your documents (e.g. Annual reports, Books, Sector research). Renaming a line renames it on every document.</p>
    <textarea class="input" name="cols" rows="8">${esc(collections().join('\n'))}</textarea>`,
  (v) => {
    const old = collections();
    const next = [...new Set(v.cols.split('\n').map((s) => s.trim()).filter(Boolean))];
    const renames = old.map((o, i) => (!next.includes(o) && next[i] && !old.includes(next[i]) ? [o, next[i]] : null)).filter(Boolean);
    for (const d of docs()) {
      let cs = (d.collections || []).map((c) => renames.find((r) => r[0] === c)?.[1] || c).filter((c) => next.includes(c));
      if (cs.join() !== (d.collections || []).join()) R.S.update('rdocs', d.id, { collections: cs });
    }
    R.S.put('settings', { ...(R.S.get('settings', 'reader') || {}), id: 'reader', collections: next });
    if (!next.includes(rUI.col)) rUI.col = 'all';
  }, 'Save');
}
function exportAllModal() {
  const list = filteredNotes();
  R.openModal('Export notes', `<p class="small muted">${list.length} item${list.length === 1 ? '' : 's'} (the current filters).</p>
    <div class="exp-grid"><button type="button" class="btn" data-act="rdExpAllGo" data-v="md">Markdown (.md)</button><button type="button" class="btn" data-act="rdExpAllGo" data-v="txt">Plain text (.txt)</button><button type="button" class="btn" data-act="rdExpAllGo" data-v="print">Print / save as PDF</button></div>`, () => {}, 'Done');
}

/* ---------- handlers merged into app.js ---------- */
export const READ_ACTS = {
  rdTab: (el) => { rUI.tab = el.dataset.v; rUI.study = false; R.render(); },
  rdStatus: (el) => { rUI.status = el.dataset.v; R.render(); },
  rdClearQ: () => { rUI.queue = rUI.queue.filter((q) => q.state === 'busy' || q.state === 'wait'); R.render(); },
  rdMenu: (el) => { const d = getDoc(el.dataset.id); if (d) docMenu(d); },
  rdSettings: () => settingsModal(),
  rdAiKey: () => { R.closeModal(); keyModal(); },
  rdCols: () => colsModal(),
  rdBackup: () => backup(),
  rdDl: async (el) => { const d = getDoc(el.dataset.id); if (!d) return; R.toast('Preparing the download…'); try { R.download(d.name || d.title, await (await fetch(await fileDataUrl(d))).blob()); } catch (e) { R.toast(e.message); } },
  rdOffline: async (el) => {
    const d = getDoc(el.dataset.id); if (!d) return;
    if (rUI.offline.has(d.id)) { await dropOffline(d); rUI.offline.delete(d.id); R.toast('Offline copy removed from this device'); }
    else { R.toast('Saving for offline reading…'); try { await makeOffline(d); rUI.offline.add(d.id); R.toast('Available offline on this device ✓'); } catch (e) { R.toast(e.message); } }
    R.closeModal(); R.render();
  },
  rdOcr: async (el) => {
    const d = getDoc(el.dataset.id); if (!d) return;
    R.closeModal();
    if (ocrRunning()) { R.toast('Already reading scanned pages — please wait'); return; }
    const q = { name: `${d.title} — scanned pages`, state: 'busy', msg: 'Starting…' };
    rUI.queue.push(q); R.render();
    try { await runOcr(d, (m) => { q.msg = m; const rows = document.querySelectorAll('.rq-row'); const i = rUI.queue.indexOf(q); if (rows[i]) rows[i].querySelector('.muted').textContent = m; }); q.state = 'done'; q.msg = 'Scanned pages are readable now'; }
    catch (e) { q.state = 'err'; q.msg = e.message; }
    R.render();
  },
  rdExpDoc: (el) => { const d = getDoc(el.dataset.id); if (d) exportDoc(el.dataset.v, d).catch((e) => R.toast(e.message)); },
  rdExp: (el) => { const m = location.hash.match(/read\/([^/?]+)/); const d = m && getDoc(m[1]); if (d) exportDoc(el.dataset.v, d).catch((e) => R.toast(e.message)); },
  rdResetPos: (el) => { const p = progOf(el.dataset.id); if (p) R.S.remove('rprog', p); R.closeModal(); R.toast('It will open at the beginning'); },
  rdDelete: async (el) => {
    const d = getDoc(el.dataset.id); if (!d) return;
    const n = allNotes().filter((x) => x.docId === d.id).length;
    if (!confirm(`Remove “${d.title}” from your library?${d.fileSp === 'co' ? ' (The company copy stays in Documents.)' : ''}`)) return;
    const keep = n ? confirm(`Keep its ${n} highlight${n === 1 ? '' : 's'} and note${n === 1 ? '' : 's'}? (OK = keep them in Notes, Cancel = delete them too)`) : false;
    R.closeModal();
    await deleteDoc(d, keep);
    R.toast('Removed');
  },
  rdGoNote: (el) => {
    const n = R.S.get('rnotes', el.dataset.id);
    if (!n) return;
    if (!getDoc(n.docId)) { R.toast('That document is no longer in your library'); return; }
    setJump({ docId: n.docId, page: n.page || 1, quote: n.quote, prefix: n.prefix, nid: n.id });
    location.hash = `#/read/${n.docId}`;
  },
  rdEditNote: (el) => { const n = R.S.get('rnotes', el.dataset.id); if (n) editNote(n); },
  rdDelNote: (el) => { const n = R.S.get('rnotes', el.dataset.id); if (n && confirm('Delete this item?')) R.S.remove('rnotes', n); },
  rdNKind: (el) => { rUI.nkind = el.dataset.v; rUI.study = false; R.render(); },
  rdNewNote: () => {
    const ds = docs().sort(byRecent);
    R.openModal('New note', `${R.field('Document', `<select class="input" name="doc"><option value="">General (no document)</option>${R.opts(ds.map((d) => [d.id, d.title]), rUI.ndoc !== 'all' ? rUI.ndoc : '')}</select>`)}
      ${R.field('Note', '<textarea class="input" name="note" rows="5" required></textarea>')}
      <div class="form-grid">${R.field('Page (optional)', '<input class="input" type="number" min="1" name="page">')}${R.field('Tags', '<input class="input" name="tags" placeholder="comma separated">')}</div>`,
    (v) => { const d = getDoc(v.doc); R.S.put('rnotes', { docId: v.doc || '', docTitle: d?.title || 'General', kind: 'note', page: +v.page || null, note: v.note.trim(), tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), at: R.S.nowISO() }); }, 'Save note');
  },
  rdExpAll: () => exportAllModal(),
  rdExpAllGo: (el) => {
    const list = filteredNotes(), v = el.dataset.v;
    if (v === 'md') R.download(`notes-${R.today()}.md`, new Blob([notesMarkdown(list, { title: 'My notes' })], { type: 'text/markdown' }));
    else if (v === 'txt') R.download(`notes-${R.today()}.txt`, new Blob([notesText(list, { title: 'My notes' })], { type: 'text/plain' }));
    else printNotes(list, { title: 'My notes' });
  },
  rdStudy: () => { rUI.study = !rUI.study; rUI.studyI = 0; rUI.showA = false; R.render(); },
  rdFlip: () => { rUI.showA = !rUI.showA; R.render(); },
  rdStudyMove: (el) => { rUI.studyI = Math.max(0, (rUI.studyI || 0) + +el.dataset.v); rUI.showA = false; R.render(); },
  rdFromCo: async (el) => {
    const cd = R.S.get('docs', el.dataset.id);
    if (!cd) return;
    const ex = docs().find((d) => d.fileId === cd.fileId);
    if (ex) { location.hash = `#/read/${ex.id}`; return; }
    R.toast('Preparing it for reading…');
    try { const r = await importCompanyDoc(cd, (m) => R.toast(m)); location.hash = `#/read/${(r.doc || r.dup).id}`; }
    catch (e) { R.toast(e.message); }
  },
};
export const READ_CHANGES = {
  rdUpload: (el) => { const fs = [...(el.files || [])]; el.value = ''; enqueue(fs); },
  rdCol: (el) => { rUI.col = el.value; R.render(); },
  rdSort: (el) => { rUI.sort = el.value; R.render(); },
  rdNDoc: (el) => { rUI.ndoc = el.value; R.render(); },
  rdNColor: (el) => { rUI.ncolor = el.value; R.render(); },
  rdNGroup: (el) => { rUI.ngroup = el.value; R.render(); },
  rdRestore: async (el) => {
    const f = el.files?.[0]; el.value = '';
    if (!f) return;
    try { const c = await restore(f); R.closeModal(); R.toast(`Restored: ${c.rprog || 0} positions, ${c.rnotes || 0} notes, ${c.rstats || 0} days`); }
    catch (e) { R.toast(e.message); }
  },
};
const keepFocus = (key, sel) => (el) => { rUI[key] = el.value; const pos = el.selectionStart; R.render(); const n = document.querySelector(sel); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
export const READ_INPUTS = { rdQ: keepFocus('q', '[data-input=rdQ]'), rdNQ: keepFocus('nq', '[data-input=rdNQ]') };

export function wireReaderDrop() {
  let depth = 0;
  const on = () => !!document.querySelector('[data-drop=reader]') && !document.querySelector('#reader');
  document.addEventListener('dragenter', (e) => { if (!on()) return; depth++; document.body.classList.add('dragging-docs'); e.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging-docs'); } });
  document.addEventListener('dragover', (e) => { if (on()) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (!on()) return; e.preventDefault(); depth = 0; document.body.classList.remove('dragging-docs'); enqueue(e.dataTransfer?.files || []); });
}
