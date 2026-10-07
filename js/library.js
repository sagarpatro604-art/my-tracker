// Company documents: a shared, categorised library of PDFs and other files. Either partner uploads,
// both can open and download. Details live in the company space (collection 'docs'), categories in
// csettings 'library', and each file in its own zfile_ documents (fetched only when opened).
let X;
export function initLibrary(ctx) { X = ctx; }

const DEFAULT_CATS = ['Research reports', 'Company documents', 'Legal & compliance', 'Finance & taxes', 'Presentations', 'Other'];
const MAX_MB = 25;
const ACCEPT = 'application/pdf,image/*,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.ppt,.pptx,.txt,.md,.zip,.json';
export const libUI = { cat: 'all', q: '', sort: 'new', busy: null };

const settings = () => X.S.get('csettings', 'library') || {};
const cats = () => (settings().categories?.length ? settings().categories : DEFAULT_CATS);
const saveCats = (list) => X.S.put('csettings', { ...settings(), id: 'library', categories: list });
const docs = () => X.S.all('docs');
const size = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const ext = (name) => (String(name).match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();
const KIND = { pdf: ['PDF', '#e5615e'], doc: ['DOC', '#4c9aff'], docx: ['DOC', '#4c9aff'], xls: ['XLS', '#4cbf87'], xlsx: ['XLS', '#4cbf87'], xlsm: ['XLS', '#4cbf87'], csv: ['CSV', '#4cbf87'], ppt: ['PPT', '#e0a83a'], pptx: ['PPT', '#e0a83a'], zip: ['ZIP', '#94a3b8'], txt: ['TXT', '#94a3b8'], md: ['TXT', '#94a3b8'], json: ['JSON', '#94a3b8'] };
const kindOf = (d) => (/^image\//.test(d.type) ? ['IMG', '#c084fc'] : KIND[ext(d.name)] || [ext(d.name).toUpperCase() || 'FILE', '#94a3b8']);
const badge = (d) => { const [t, c] = kindOf(d); return `<span class="doc-badge" style="background:${c}22;color:${c}">${t}</span>`; };
const viewable = (d) => /pdf/.test(d.type) || /^image\//.test(d.type) || ext(d.name) === 'pdf';
const who = (id) => X.userOf(id)?.name || id || '—';
const readAs = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });

/* ---------- views ---------- */
export function libraryShelfCard() {
  const ds = docs();
  const latest = ds.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return `<a class="shelf-card" href="#/docs">
      <span class="shelf-ic">${X.ic('file', 22)}</span>
      <span class="grow"><b>Documents</b><small>Shared PDFs and files, sorted by category · upload and download</small>
        <span class="shelf-stats"><span><b>${ds.length}</b> file${ds.length === 1 ? '' : 's'}</span><span><b>${new Set(ds.map((d) => d.category)).size}</b> categor${new Set(ds.map((d) => d.category)).size === 1 ? 'y' : 'ies'}</span></span>
        ${latest ? `<small>Latest: ${X.esc(latest.title)} · ${X.fmtDate(latest.createdAt.slice(0, 10))}</small>` : ''}</span>${X.ic('arrowR', 18)}</a>`;
}

export function viewLibrary() {
  const all = docs();
  const q = libUI.q.trim().toLowerCase();
  const cs = cats();
  const count = (c) => all.filter((d) => d.category === c).length;
  let list = all.filter((d) => (libUI.cat === 'all' || d.category === libUI.cat) && (!q || `${d.title} ${d.name} ${d.notes} ${d.category}`.toLowerCase().includes(q)));
  list = list.sort(libUI.sort === 'name' ? (a, b) => a.title.localeCompare(b.title) : libUI.sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const used = all.reduce((t, d) => t + (d.size || 0), 0);
  const orphan = all.filter((d) => !cs.includes(d.category)).length;
  return `${X.banner()}
  <header class="page-head"><div><p class="eyebrow"><a href="#/company">Company shelf</a> / shared by Sagar &amp; Bhuvan</p><h1>Documents</h1></div>
    <div class="row"><label class="btn primary">${X.ic('upload', 16)} Upload files<input type="file" multiple accept="${ACCEPT}" data-change="libPick" hidden></label></div></header>
  ${libUI.busy ? `<div class="banner"><b>${X.esc(libUI.busy)}</b> — keep this page open until it finishes.</div>` : ''}
  <div class="chips lib-cats">
    <button class="chip ${libUI.cat === 'all' ? 'active' : ''}" data-act="libCat" data-v="all">All <span class="muted">${all.length}</span></button>
    ${cs.map((c) => `<button class="chip ${libUI.cat === c ? 'active' : ''}" data-act="libCat" data-v="${X.esc(c)}">${X.esc(c)} <span class="muted">${count(c)}</span></button>`).join('')}
    ${orphan ? `<button class="chip ${libUI.cat === '__none' ? 'active' : ''}" data-act="libCat" data-v="__none">No category <span class="muted">${orphan}</span></button>` : ''}
    <button class="chip ghost" data-act="libCats">${X.ic('sliders', 14)} Categories</button>
  </div>
  <div class="toolbar">
    <label class="search">${X.ic('search', 16)}<input class="input" placeholder="Search documents" value="${X.esc(libUI.q)}" data-input="libQ"></label>
    <select class="input sm" data-change="libSort" aria-label="Sort">${X.opts([['new', 'Newest first'], ['name', 'Name A–Z'], ['size', 'Largest first']], libUI.sort)}</select>
    <span class="spacer"></span><span class="muted small">${all.length} file${all.length === 1 ? '' : 's'} · ${size(used)} of the free 1 GB</span>
  </div>
  <div class="doc-drop" data-drop="docs"><span>${X.ic('upload', 16)} Drop files to upload them${libUI.cat !== 'all' && libUI.cat !== '__none' ? ` to “${X.esc(libUI.cat)}”` : ''}</span></div>
  ${(libUI.cat === '__none' ? all.filter((d) => !cs.includes(d.category)) : list).length ? `<section class="doc-grid">${(libUI.cat === '__none' ? all.filter((d) => !cs.includes(d.category)) : list).map(card).join('')}</section>`
    : `<section class="card">${X.empty(all.length ? 'Nothing matches.' : 'No documents yet. Press “Upload files” or drop PDFs here — Bhuvan and you can both download them.')}</section>`}`;
}

const card = (d) => `<article class="doc-card">
  <div class="doc-top">${badge(d)}<span class="muted small">${size(d.size || 0)}</span></div>
  <button class="doc-title" data-act="${viewable(d) ? 'libView' : 'libDl'}" data-id="${d.id}" title="${viewable(d) ? 'Open' : 'Download'}">${X.esc(d.title)}</button>
  <span class="muted small doc-cat">${X.esc(d.category || 'No category')}</span>
  ${d.notes ? `<p class="doc-notes">${X.esc(d.notes)}</p>` : ''}
  <div class="doc-foot">${X.avatar(d.uploadedBy)}<span class="muted small grow">${X.esc(who(d.uploadedBy))} · ${X.fmtDate((d.createdAt || '').slice(0, 10))}</span>
    ${viewable(d) ? `<button class="icon-btn" data-act="libView" data-id="${d.id}" aria-label="Open" title="Open">${X.ic('expand', 15)}</button>` : ''}
    <button class="icon-btn" data-act="libDl" data-id="${d.id}" aria-label="Download" title="Download">${X.ic('download', 15)}</button>
    <button class="icon-btn" data-act="libEdit" data-id="${d.id}" aria-label="Edit" title="Rename, move or delete">${X.ic('pen', 15)}</button></div>
</article>`;

/* ---------- upload ---------- */
let picked = [];
function openUpload(files) {
  const big = files.filter((f) => f.size > MAX_MB * 1024 * 1024);
  picked = files.filter((f) => f.size <= MAX_MB * 1024 * 1024);
  if (big.length) X.toast(`Too big (over ${MAX_MB} MB): ${big.map((f) => f.name).join(', ')}`);
  if (!picked.length) return;
  const cur = libUI.cat !== 'all' && libUI.cat !== '__none' ? libUI.cat : cats()[0];
  X.openModal(`Upload ${picked.length} file${picked.length > 1 ? 's' : ''}`, `
    ${X.field('Category', `<select class="input" name="category">${X.opts(cats(), cur)}</select>`)}
    <div class="up-list">${picked.map((f, i) => `<div class="up-row">${badge({ name: f.name, type: f.type })}<input class="input" name="title${i}" value="${X.esc(f.name.replace(/\.[^.]+$/, ''))}" aria-label="Title for ${X.esc(f.name)}"><span class="muted small nowrap">${size(f.size)}</span></div>`).join('')}</div>
    ${X.field('Note (optional)', `<input class="input" name="notes" placeholder="e.g. Q2 results deck, shared by the broker">`)}`,
  (v) => upload(picked.map((f, i) => ({ file: f, title: (v['title' + i] || '').trim() || f.name })), v.category, (v.notes || '').trim()), 'Upload');
}

async function upload(items, category, notes) {
  let done = 0;
  const failed = [];
  for (const [i, { file, title }] of items.entries()) {
    const label = `Uploading ${items.length > 1 ? `${i + 1} of ${items.length}: ` : ''}${file.name}`;
    libUI.busy = label; X.render();
    try {
      const data = await readAs(file);
      const fileId = X.S.uid();
      await X.S.putFile(fileId, { data, type: file.type || 'application/octet-stream', name: file.name }, (p) => { libUI.busy = `${label} · ${Math.round(p * 100)}%`; const b = document.querySelector('.banner b'); if (b) b.textContent = libUI.busy; });
      X.S.put('docs', { title, name: file.name, type: file.type || '', size: file.size, category, notes: notes || null, fileId, uploadedBy: X.ME() });
      done++;
    } catch (err) { failed.push(`${file.name} (${err.message || err})`); }
  }
  libUI.busy = null;
  X.render();
  X.toast(failed.length ? `Uploaded ${done}. Failed: ${failed.join(', ')}` : `Uploaded ${done} file${done > 1 ? 's' : ''} to ${category}`);
}

/* ---------- open / download / edit ---------- */
async function fetchFile(d) {
  X.toast(`Opening ${d.title}…`);
  const f = await X.S.getFile(d.fileId, (p) => X.toast(`Loading ${d.title} · ${Math.round(p * 100)}%`)).catch((e) => { X.toast(e.message); return null; });
  if (!f) X.toast('This file could not be found.');
  return f;
}
const toBlob = async (f) => (await fetch(f.data)).blob();

async function viewDoc(id) {
  const d = X.S.get('docs', id);
  if (!d) return;
  const f = await fetchFile(d);
  if (!f) return;
  const url = URL.createObjectURL(await toBlob(f));
  const dlg = document.querySelector('#modal');
  dlg.classList.add('sheet');
  dlg.innerHTML = `<div class="sheet-wrap"><header class="sheet-head"><b>${X.esc(d.title)}</b><span class="muted small">${X.esc(d.category)} · ${size(d.size || 0)}</span><span class="spacer"></span>
    <a class="btn sm" href="${url}" download="${X.esc(d.name)}">${X.ic('download', 14)} Download</a><button class="icon-btn" data-act="closeModal" aria-label="Close">${X.ic('x')}</button></header>
    <div class="bill-view">${/^image\//.test(f.type) ? `<img src="${url}" alt="${X.esc(d.title)}">` : `<iframe src="${url}" title="${X.esc(d.title)}"></iframe>`}</div></div>`;
  if (!dlg.open) dlg.showModal();
  dlg.addEventListener('close', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
}

async function downloadDoc(id) {
  const d = X.S.get('docs', id);
  if (!d) return;
  const f = await fetchFile(d);
  if (f) { X.download(d.name || d.title, await toBlob(f)); X.toast(`Downloaded ${d.name}`); }
}

function editDoc(id) {
  const d = X.S.get('docs', id);
  if (!d) return;
  X.openModal('Edit document', `
    ${X.field('Title', `<input class="input" name="title" value="${X.esc(d.title)}" required>`)}
    ${X.field('Category', `<select class="input" name="category">${X.opts(cats().includes(d.category) ? cats() : [d.category, ...cats()], d.category)}</select>`)}
    ${X.field('Note', `<input class="input" name="notes" value="${X.esc(d.notes || '')}">`)}
    <p class="muted small">${X.esc(d.name)} · ${size(d.size || 0)} · uploaded by ${X.esc(who(d.uploadedBy))} on ${X.fmtDate((d.createdAt || '').slice(0, 10))}</p>
    <div class="row"><button type="button" class="btn sm ghost" data-act="libDel" data-id="${d.id}">${X.ic('trash', 14)} Delete for both of us</button></div>`,
  (v) => { X.S.put('docs', { ...d, title: v.title.trim() || d.title, category: v.category, notes: v.notes.trim() || null }); X.toast('Saved'); });
}

function manageCats() {
  const cs = cats();
  X.openModal('Document categories', `
    <p class="muted small">One per line. Rename a line to rename the category everywhere; files in a removed category show under “No category”.</p>
    <textarea class="input" name="cats" rows="${Math.max(6, cs.length + 2)}">${X.esc(cs.join('\n'))}</textarea>`,
  (v) => {
    const next = [...new Set(v.cats.split('\n').map((s) => s.trim()).filter(Boolean))];
    if (!next.length) { X.toast('Keep at least one category'); return; }
    // Same position, new name = a rename: move the files along with it.
    const moved = [];
    cs.forEach((old, i) => { if (!next.includes(old) && next[i] && !cs.includes(next[i])) moved.push([old, next[i]]); });
    for (const [from, to] of moved) for (const d of docs().filter((x) => x.category === from)) X.S.put('docs', { ...d, category: to });
    saveCats(next);
    if (!next.includes(libUI.cat)) libUI.cat = 'all';
    X.toast(moved.length ? `Saved · renamed ${moved.map((m) => `“${m[0]}” → “${m[1]}”`).join(', ')}` : 'Categories saved');
  });
}

/* ---------- handlers merged into app.js ---------- */
export const LIB_ACTS = {
  libCat: (el) => { libUI.cat = el.dataset.v; X.render(); },
  libCats: () => manageCats(),
  libView: (el) => viewDoc(el.dataset.id),
  libDl: (el) => downloadDoc(el.dataset.id),
  libEdit: (el) => editDoc(el.dataset.id),
  libDel: async (el) => {
    const d = X.S.get('docs', el.dataset.id);
    if (!d || !confirm(`Delete “${d.title}”? It goes for both of you and can't be brought back.`)) return;
    X.closeModal();
    X.S.remove('docs', d);
    await X.S.deleteFile(d.fileId).catch(() => {});
    X.toast('Deleted');
  },
};
export const LIB_CHANGES = {
  libPick: (el) => { const fs = [...(el.files || [])]; el.value = ''; if (libUI.busy) { X.toast('Wait for the current upload to finish'); return; } openUpload(fs); },
  libSort: (el) => { libUI.sort = el.value; X.render(); },
};
export const LIB_INPUTS = {
  libQ: (el) => { libUI.q = el.value; const pos = el.selectionStart; X.render(); const n = document.querySelector('[data-input=libQ]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } },
};

// Drop files anywhere on the Documents page.
export function wireLibraryDrop() {
  let depth = 0;
  const on = () => !!document.querySelector('[data-drop=docs]');
  document.addEventListener('dragenter', (e) => { if (!on()) return; depth++; document.body.classList.add('dragging-docs'); e.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging-docs'); } });
  document.addEventListener('dragover', (e) => { if (on()) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!on()) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging-docs');
    if (libUI.busy) { X.toast('Wait for the current upload to finish'); return; }
    openUpload([...(e.dataTransfer?.files || [])]);
  });
}
