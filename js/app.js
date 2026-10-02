import * as S from './store.js';
import { INSTA } from './config.js';
import { parseTracker, exportExcel } from './excel.js';

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const weekStart = (s) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (s) => { if (!s) return ''; const d = parseYmd(s); return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
const relDate = (s) => {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return `${DAY[parseYmd(s).getDay()]}, ${fmtDate(s)}`;
};
const fmtTime = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; };
const fmtDT = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${fmtDate(ymd(d))}, ${fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes()))}`; };
const pct = (a, b) => (b ? Math.round((a * 100) / b) : null);
const num = (n) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const vals = (f) => Object.fromEntries(new FormData(f));
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const opts = (list, cur) => list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === (cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  todo: '<rect x="3" y="4" width="6" height="6" rx="1.5"/><path d="m3 17 2 2 4-4"/><path d="M13 7h8M13 13h8M13 19h8"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.8 1.2 2.7 2.5 2.7Z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
};
const ic = (n, s = 18) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const CONTENT_TYPES = ['Stock Market Daily', 'News Breakdown', 'Concept Explainer', 'Storytelling Backup', 'Meme / Trend'];
const IDEA_STATUSES = ['Backlog', 'In progress', 'Ready', 'Scheduled', 'Posted'];
const BOOK_STATUSES = [['reading', 'Reading'], ['want', 'Want to read'], ['paused', 'Paused'], ['finished', 'Finished']];
const PRIOS = [['high', 'High'], ['med', 'Medium'], ['low', 'Low']];
const PRIO_RANK = { high: 0, med: 1, low: 2 };
const THOUGHT_CATS = ['LinkedIn posts', 'Instagram scripts', 'Ideas', 'Instagram inspo', 'Scripting ideas'];
const lastThoughtCat = () => { try { return localStorage.getItem('tracker.thoughtCat') || 'Ideas'; } catch { return 'Ideas'; } };

const ui = { taskFilter: 'today', taskQ: '', thoughtQ: '', thoughtCat: 'all', bookFilter: 'reading', ideaFilter: 'all', ideaQ: '', expanded: new Set() };

/* ---------------- toast, clipboard, modal ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied to clipboard');
}
function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

let modalSubmit = null;
function openModal(title, body, onSubmit, submitLabel = 'Save') {
  const dlg = $('#modal');
  dlg.innerHTML = `<form class="modal-form" data-form="modal">
    <header><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-act="closeModal" aria-label="Close">${ic('x')}</button></header>
    <div class="modal-body">${body}</div>
    <footer><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></footer>
  </form>`;
  modalSubmit = onSubmit;
  dlg.showModal();
  setTimeout(() => dlg.querySelector('input:not([type=hidden]),textarea')?.focus(), 30);
}
const closeModal = () => { $('#modal').close(); modalSubmit = null; };
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;

/* ---------------- derived data ---------------- */
const prefs = () => S.get('settings', 'prefs') || {};
const contentTypes = () => prefs().contentTypes?.length ? prefs().contentTypes : CONTENT_TYPES;

function sortTasks(list) {
  return list.slice().sort((a, b) =>
    (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') ||
    (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

function accuracy(tasks) {
  const t = today();
  const byDue = new Map();
  for (const x of tasks) if (x.due) (byDue.get(x.due) || byDue.set(x.due, []).get(x.due)).push(x);
  const range = (from) => {
    let total = 0, done = 0;
    for (const [d, xs] of byDue) if (d >= from && d <= t) { total += xs.length; done += xs.filter((x) => x.done).length; }
    return { total, done, pct: pct(done, total) };
  };
  const dueDone = tasks.filter((x) => x.due && x.due <= t && x.done);
  const onTime = dueDone.filter((x) => x.doneAt && ymd(new Date(x.doneAt)) <= x.due).length;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(t, -i);
    const xs = byDue.get(d) || [];
    const done = xs.filter((x) => x.done).length;
    days.push({ d, total: xs.length, done, pct: pct(done, xs.length) });
  }
  // Perfect days: every task due that day got done. Days with no tasks don't break the streak; today only counts once complete.
  let perfect = 0;
  const first = [...byDue.keys()].sort()[0];
  for (let d = t; first && d >= first; d = addDays(d, -1)) {
    const xs = byDue.get(d);
    if (!xs) continue;
    const all = xs.every((x) => x.done);
    if (all) perfect++;
    else if (d !== t) break;
  }
  return { today: range(t), week: range(weekStart(t)), month: range(t.slice(0, 8) + '01'), all: range('0000-00-00'), onTime: pct(onTime, dueDone.length), days, perfect };
}

function instaStats() {
  const t = today();
  const start = prefs().instaStart || INSTA.trackingStart;
  const all = S.all('reels').filter((r) => r.date).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const reels = all.filter((r) => !r.kind || r.kind === 'reel');
  const byDay = new Map();
  for (const r of reels) (byDay.get(r.date) || byDay.set(r.date, []).get(r.date)).push(r);
  let posted = 0, missed = 0, longest = 0, run = 0;
  for (let d = start; d <= t; d = addDays(d, 1)) {
    if (byDay.has(d)) { posted++; run++; longest = Math.max(longest, run); }
    else if (d < t) { missed++; run = 0; }
  }
  let streak = 0;
  for (let d = byDay.has(t) ? t : addDays(t, -1); d >= start && byDay.has(d); d = addDays(d, -1)) streak++;
  const ws = weekStart(t);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const state = byDay.has(d) ? 'posted' : d < start ? 'none' : d < t ? 'missed' : d === t ? 'today' : 'future';
    return { d, reels: byDay.get(d) || [], state };
  });
  const withPlays = reels.filter((r) => typeof r.plays === 'number');
  const totalPlays = withPlays.reduce((s, r) => s + r.plays, 0);
  const byType = {};
  for (const r of withPlays) { const k = r.contentType || 'Untagged'; (byType[k] ||= { n: 0, plays: 0 }); byType[k].n++; byType[k].plays += r.plays; }
  return {
    start, all, reels, byDay, posted, missed, streak, longest, week,
    consistency: pct(posted, posted + missed),
    weekPosted: week.filter((w) => w.state === 'posted').length,
    weekSoFar: week.filter((w) => w.d <= t && w.d >= start).length,
    monthPosted: [...byDay.keys()].filter((d) => d.slice(0, 7) === t.slice(0, 7)).length,
    totalPlays, avgPlays: withPlays.length ? Math.round(totalPlays / withPlays.length) : null,
    byType, best: withPlays.slice().sort((a, b) => b.plays - a.plays)[0],
    sync: S.get('settings', 'instaSync'),
  };
}

/* ---------------- shared components ---------------- */
const stat = (label, value, sub = '', tone = '') => `<div class="stat ${tone}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
const empty = (msg) => `<div class="empty">${msg}</div>`;
const pctText = (p) => (p == null ? '—' : p + '%');
const toneFor = (p) => (p == null ? '' : p >= 80 ? 'good' : p >= 50 ? 'warn' : 'bad');

function taskRow(x) {
  const t = today();
  const over = !x.done && x.due && x.due < t;
  const meta = [];
  if (x.due) meta.push(`<span class="${over ? 'bad' : ''}">${ic('calendar', 13)} ${over ? `Overdue ${daysBetween(x.due, t)}d · ` : ''}${relDate(x.due)}</span>`);
  if (x.time) meta.push(`<span>${ic('clock', 13)} ${fmtTime(x.time)}</span>`);
  if (x.category) meta.push(`<span class="tag">${esc(x.category)}</span>`);
  if (x.done && x.doneAt) meta.push(`<span class="good">${ic('check', 13)} Done ${fmtDT(x.doneAt)}</span>`);
  return `<div class="task ${x.done ? 'is-done' : ''} prio-${x.priority || 'med'}">
    <button class="chk" data-act="toggleTask" data-id="${x.id}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}">${ic('check', 14)}</button>
    <button class="task-main" data-act="editTask" data-id="${x.id}"><span class="task-title">${esc(x.title)}</span>${meta.length ? `<span class="meta">${meta.join('')}</span>` : ''}</button>
    <button class="icon-btn" data-act="delTask" data-id="${x.id}" aria-label="Delete task">${ic('trash', 16)}</button>
  </div>`;
}

function weekStrip(ig) {
  return `<div class="week">${ig.week.map((w) => {
    const d = parseYmd(w.d);
    const tip = w.reels.map((r) => r.caption).filter(Boolean).join(' / ');
    return `<div class="wd ${w.state}" title="${esc(tip || w.state)}"><span class="wd-name">${DAY[d.getDay()]}</span><span class="wd-dot">${w.state === 'posted' ? ic('check', 14) : w.state === 'missed' ? ic('x', 14) : ''}</span><span class="wd-date">${d.getDate()}</span></div>`;
  }).join('')}</div>`;
}

function accuracyBars(acc) {
  return `<div class="bars">${acc.days.map((d) => {
    const dt = parseYmd(d.d);
    const h = d.pct == null ? 4 : Math.max(6, d.pct);
    return `<div class="bar-col" title="${DAY[dt.getDay()]} ${fmtDate(d.d)}: ${d.total ? `${d.done}/${d.total} done` : 'no tasks'}"><div class="bar-track"><div class="bar ${d.pct == null ? 'none' : toneFor(d.pct)}" style="height:${h}%"></div></div><span>${DAY[dt.getDay()][0]}</span></div>`;
  }).join('')}</div>`;
}

function thoughtCard(x) {
  const long = (x.text || '').length > 420 || (x.text || '').split('\n').length > 8;
  return `<article class="thought ${x.pinned ? 'pinned' : ''}">
    <div class="thought-text ${long && !ui.expanded.has(x.id) ? 'clamp' : ''}">${esc(x.text)}</div>
    ${long ? `<button class="link-btn" data-act="expand" data-id="${x.id}">${ui.expanded.has(x.id) ? 'Show less' : 'Show more'}</button>` : ''}
    <div class="thought-foot">
      ${x.category ? `<span class="tag cat">${esc(x.category)}</span>` : ''}
      <span class="muted small">${x.pinned ? ic('pin', 13) + ' ' : ''}${DAY[new Date(x.createdAt).getDay()]}, ${fmtDT(x.createdAt)}${x.editedAt ? ` · edited ${fmtDT(x.editedAt)}` : ''}</span>
      <span class="spacer"></span>
      <button class="btn sm" data-act="copyThought" data-id="${x.id}">${ic('copy', 15)} Copy</button>
      <button class="icon-btn" data-act="pinThought" data-id="${x.id}" aria-label="${x.pinned ? 'Unpin' : 'Pin'}">${ic('pin', 16)}</button>
      <button class="icon-btn" data-act="editThought" data-id="${x.id}" aria-label="Edit">${ic('pen', 16)}</button>
      <button class="icon-btn" data-act="delThought" data-id="${x.id}" aria-label="Delete">${ic('trash', 16)}</button>
    </div>
  </article>`;
}
const sortedThoughts = () => S.all('thoughts').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));

function bookProgress(b) {
  if (b.status === 'finished') return 100;
  return b.totalPages ? Math.min(100, Math.round(((b.currentPage || 0) * 100) / b.totalPages)) : null;
}

function banner() {
  if (S.status.error) return `<div class="banner bad">Sync problem: ${esc(S.status.error)}. Your changes are kept and will retry. See <a href="#/settings">Settings</a>.</div>`;
  if (S.status.mode === 'local') return `<div class="banner">Saving on this device only. Connect Firebase in <a href="#/settings">Settings</a> to sync across your devices.</div>`;
  return '';
}

/* ---------------- views ---------------- */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night hustle' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const clockText = () => { const d = new Date(); return fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes())); };
const longDate = () => { const d = new Date(); return `${DAY_LONG[d.getDay()]}, ${d.getDate()} ${MON_LONG[d.getMonth()]} ${d.getFullYear()}`; };

function viewDashboard() {
  const t = today();
  const tasks = S.all('tasks');
  const todays = tasks.filter((x) => x.due === t);
  const doneToday = todays.filter((x) => x.done).length;
  const overdue = tasks.filter((x) => !x.done && x.due && x.due < t);
  const acc = accuracy(tasks);
  const ig = instaStats();
  const reading = S.all('books').filter((b) => b.status === 'reading');
  const focus = sortTasks([...overdue, ...todays, ...tasks.filter((x) => !x.due && !x.done)]);
  const thoughts = sortedThoughts().slice(0, 3);

  return `${banner()}
  <header class="page-head">
    <div><p class="eyebrow" id="dateLine">${longDate()}</p><h1>${greeting()}</h1></div>
    <div class="clock" id="clock">${clockText()}</div>
  </header>
  <section class="stats">
    ${stat('Done today', `${doneToday}<small>/${todays.length}</small>`, todays.length ? `${todays.length - doneToday} left` : 'No tasks for today', todays.length && doneToday === todays.length ? 'good' : '')}
    ${stat('Overdue', overdue.length, overdue.length ? 'Needs attention' : 'All clear', overdue.length ? 'bad' : 'good')}
    ${stat('Week accuracy', pctText(acc.week.pct), `${acc.week.done}/${acc.week.total} tasks`, toneFor(acc.week.pct))}
    ${stat('Reels this week', `${ig.weekPosted}<small>/${ig.weekSoFar}</small>`, `${ig.weekSoFar - ig.weekPosted} day${ig.weekSoFar - ig.weekPosted === 1 ? '' : 's'} missed`, ig.weekPosted === ig.weekSoFar ? 'good' : ig.weekSoFar - ig.weekPosted > 2 ? 'bad' : 'warn')}
    ${stat('Posting streak', `${ig.streak}<small> days</small>`, `Best: ${ig.longest} days`)}
    ${stat('Reading', reading.length, reading[0] ? esc(reading[0].title) : 'Add a book')}
  </section>

  <div class="grid2">
    <section class="card">
      <div class="card-head"><h2>Focus list</h2><a class="link-btn" href="#/tasks">All tasks →</a></div>
      <form class="inline-add" data-form="addTask"><input class="input" name="title" placeholder="Add a task for today…" autocomplete="off" required><input type="hidden" name="due" value="${t}"><button class="btn primary" aria-label="Add task">${ic('plus')}</button></form>
      <div class="task-list">${focus.length ? focus.slice(0, 8).map(taskRow).join('') : empty('Nothing planned. Add your first task above.')}</div>
      ${focus.length > 8 ? `<a class="link-btn more" href="#/tasks">+ ${focus.length - 8} more</a>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>Accuracy board</h2><span class="muted small">tasks done on their due day</span></div>
      <div class="acc-grid">
        ${[['Today', acc.today], ['This week', acc.week], ['This month', acc.month], ['All time', acc.all]].map(([l, r]) => `<div class="acc ${toneFor(r.pct)}"><div class="acc-val">${pctText(r.pct)}</div><div class="acc-label">${l}</div><div class="acc-sub">${r.done}/${r.total}</div></div>`).join('')}
      </div>
      ${accuracyBars(acc)}
      <div class="acc-foot"><span>${ic('clock', 14)} On-time: <b>${pctText(acc.onTime)}</b></span><span>${ic('flame', 14)} Perfect-day streak: <b>${acc.perfect}</b></span></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Instagram this week</h2><a class="link-btn" href="#/insta">Details →</a></div>
      ${weekStrip(ig)}
      <div class="mini-stats">
        <div><b>${ig.monthPosted}</b><span>reels this month</span></div>
        <div><b>${pctText(ig.consistency)}</b><span>consistency</span></div>
        <div><b>${num(ig.avgPlays)}</b><span>avg plays</span></div>
      </div>
      <p class="muted small">${ig.sync?.lastRun ? `Auto-updated ${fmtDT(ig.sync.lastRun)}` : 'Auto-update not connected yet'}</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Quick thought</h2><a class="link-btn" href="#/thoughts">All thoughts →</a></div>
      <form data-form="addThought" class="compose small-compose">
        <textarea class="input" name="text" rows="3" placeholder="Write it down… (Ctrl+Enter saves)" data-input="draft">${esc(localStorage.getItem('tracker.draft') || '')}</textarea>
        <div class="row"><select class="input sm" name="category" aria-label="Category">${opts(THOUGHT_CATS, lastThoughtCat())}</select><span class="spacer"></span><button class="btn primary">Save</button></div>
      </form>
      <div class="thought-list compact">${thoughts.map(thoughtCard).join('') || empty('Your thoughts show up here, ready to copy on any device.')}</div>
    </section>

    ${myBookCard()}

    <section class="card span2">
      <div class="card-head"><h2>Currently reading</h2><a class="link-btn" href="#/books">Bookshelf →</a></div>
      ${reading.length ? `<div class="reading-list">${reading.map((b) => { const p = bookProgress(b); return `<div class="reading"><div class="spine" style="--h:${hue(b.title)}"></div><div class="grow"><div class="book-title">${esc(b.title)}</div><div class="muted small">${esc(b.author || '')}${b.totalPages ? ` · page ${b.currentPage || 0} of ${b.totalPages}` : ''}</div><div class="progress"><span style="width:${p ?? 0}%"></span></div></div><b class="tnum">${p == null ? '' : p + '%'}</b></div>`; }).join('')}</div>` : empty('No book in progress. Add one on the Bookshelf.')}
    </section>
  </div>`;
}

function taskBuckets(tasks) {
  const t = today();
  return {
    today: tasks.filter((x) => x.due === t),
    upcoming: tasks.filter((x) => !x.done && x.due && x.due > t),
    overdue: tasks.filter((x) => !x.done && x.due && x.due < t),
    anytime: tasks.filter((x) => !x.done && !x.due),
    done: tasks.filter((x) => x.done),
    all: tasks,
  };
}
const TASK_FILTERS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['anytime', 'No date'], ['done', 'Done'], ['all', 'All']];

function taskListHTML() {
  const groups = taskBuckets(S.all('tasks'));
  let list = groups[ui.taskFilter] || [];
  const q = ui.taskQ.trim().toLowerCase();
  if (q) list = list.filter((x) => `${x.title} ${x.category || ''} ${x.notes || ''}`.toLowerCase().includes(q));
  if (!list.length) return empty(q ? 'No tasks match your search.' : { today: 'No tasks for today yet.', upcoming: 'Nothing scheduled ahead.', overdue: 'Nothing overdue. Nice.', anytime: 'No undated tasks.', done: 'Nothing completed yet.', all: 'No tasks yet. Add one above.' }[ui.taskFilter]);
  if (ui.taskFilter === 'done') {
    list = list.slice().sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 300);
    return groupBy(list, (x) => (x.doneAt ? ymd(new Date(x.doneAt)) : ''), (k) => (k ? `Completed ${relDate(k)}` : 'Completed'));
  }
  list = sortTasks(list);
  if (ui.taskFilter === 'today' || ui.taskFilter === 'overdue' || ui.taskFilter === 'anytime') return list.map(taskRow).join('');
  return groupBy(list, (x) => x.due || '', (k) => (k ? relDate(k) : 'No date'));
}
function groupBy(list, keyFn, labelFn) {
  const out = [];
  let last = null;
  for (const x of list) {
    const k = keyFn(x);
    if (k !== last) { out.push(`<div class="group-label">${esc(labelFn(k))}</div>`); last = k; }
    out.push(taskRow(x));
  }
  return out.join('');
}

function viewTasks() {
  const tasks = S.all('tasks');
  const groups = taskBuckets(tasks);
  const cats = [...new Set(tasks.map((x) => x.category).filter(Boolean))];
  const t = today();
  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">${groups.today.filter((x) => !x.done).length} left today · ${groups.overdue.length} overdue</p><h1>To-Do</h1></div></header>
  <form class="card quick-add" data-form="addTask">
    <input class="input grow" name="title" placeholder="What needs doing?" autocomplete="off" required>
    <input class="input" type="date" name="due" value="${t}" aria-label="Due date">
    <input class="input" type="time" name="time" aria-label="Time">
    <select class="input" name="priority" aria-label="Priority">${opts(PRIOS, 'med')}</select>
    <input class="input" name="category" placeholder="Category" list="cats" autocomplete="off">
    <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <button class="btn primary">${ic('plus')} Add</button>
  </form>
  <div class="toolbar">
    <div class="chips">${TASK_FILTERS.map(([k, l]) => `<button class="chip ${ui.taskFilter === k ? 'active' : ''}" data-act="taskFilter" data-v="${k}">${l}${k !== 'all' && k !== 'done' ? ` <span class="count">${groups[k].length}</span>` : ''}</button>`).join('')}</div>
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search tasks" value="${esc(ui.taskQ)}" data-input="taskQ"></label>
  </div>
  <div class="card task-list" id="taskList">${taskListHTML()}</div>`;
}

function calendarHTML(ig) {
  const t = today();
  const out = [];
  for (let m = ig.start.slice(0, 7); m <= t.slice(0, 7);) {
    const [y, mo] = m.split('-').map(Number);
    const off = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
    const days = new Date(y, mo, 0).getDate();
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="cal-h">${d}</span>`).join('') + '<span></span>'.repeat(off);
    for (let d = 1; d <= days; d++) {
      const ds = `${m}-${pad(d)}`;
      const rs = ig.byDay.get(ds);
      const state = rs ? 'posted' : ds < ig.start ? 'pre' : ds < t ? 'missed' : ds === t ? 'today' : 'future';
      const tip = rs ? rs.map((r) => `${r.caption || 'Reel'}${r.plays != null ? ` — ${num(r.plays)} plays` : ''}`).join('\n') : state === 'missed' ? 'Missed' : '';
      cells += rs?.[0]?.url
        ? `<a class="cal-d posted" href="${esc(rs[0].url)}" target="_blank" rel="noopener" title="${esc(tip)}">${d}</a>`
        : `<span class="cal-d ${state}" title="${esc(tip)}">${d}</span>`;
    }
    out.push(`<div class="cal"><div class="cal-title">${MON_LONG[mo - 1]} ${y}</div><div class="cal-grid">${cells}</div></div>`);
    const nx = new Date(y, mo, 1);
    m = `${nx.getFullYear()}-${pad(nx.getMonth() + 1)}`;
  }
  return out.reverse().join('');
}

function viewInsta() {
  const ig = instaStats();
  const types = Object.entries(ig.byType).map(([k, v]) => ({ k, n: v.n, avg: Math.round(v.plays / v.n) })).sort((a, b) => b.avg - a.avg);
  const maxAvg = Math.max(1, ...types.map((x) => x.avg));
  const ct = contentTypes();
  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">@${esc(INSTA.username)} · tracking since ${fmtDate(ig.start)}</p><h1>Instagram</h1></div>
    <div class="sync-pill ${ig.sync?.ok === false ? 'bad' : ''}">${ig.sync?.lastRun ? `${ig.sync.ok === false ? 'Last update failed' : 'Auto-updated'} ${fmtDT(ig.sync.lastRun)}` : 'Auto-update not connected'}</div></header>
  <section class="stats">
    ${stat('This week', `${ig.weekPosted}<small>/${ig.weekSoFar}</small>`, 'reels posted')}
    ${stat('This month', ig.monthPosted, 'reels posted')}
    ${stat('Consistency', pctText(ig.consistency), `${ig.posted} posted · ${ig.missed} missed`, toneFor(ig.consistency))}
    ${stat('Current streak', `${ig.streak}<small> days</small>`, `Longest: ${ig.longest} days`)}
    ${stat('Total plays', num(ig.totalPlays), `Avg ${num(ig.avgPlays)} per reel`)}
    ${stat('Best reel', num(ig.best?.plays), esc(ig.best?.caption?.slice(0, 40) || '—'))}
  </section>
  <div class="grid2">
    <section class="card"><div class="card-head"><h2>This week</h2></div>${weekStrip(ig)}
      <form class="manual-mark" data-form="manualReel">
        <span class="muted small">Posted but not showing yet? Mark it:</span>
        <input class="input" type="date" name="date" value="${today()}" required>
        <input class="input grow" name="caption" placeholder="Topic" autocomplete="off">
        <button class="btn">${ic('check', 16)} Mark posted</button>
      </form>
    </section>
    <section class="card"><div class="card-head"><h2>Average plays by content type</h2></div>
      ${types.length ? `<div class="hbars">${types.map((x) => `<div class="hbar"><span class="hbar-label">${esc(x.k)} <span class="muted">(${x.n})</span></span><div class="hbar-track"><div style="width:${Math.round((x.avg * 100) / maxAvg)}%"></div></div><b class="tnum">${num(x.avg)}</b></div>`).join('')}</div>` : empty('Tag your reels with a content type below to compare them.')}
    </section>
  </div>
  <section class="card"><div class="card-head"><h2>Posting calendar</h2><span class="legend"><i class="lg posted"></i>Posted <i class="lg missed"></i>Missed</span></div><div class="cals">${calendarHTML(ig)}</div></section>
  <section class="card"><div class="card-head"><h2>All posts</h2><span class="muted small">${ig.all.length} total</span></div>
    ${ig.all.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Topic</th><th>Type</th><th class="r">Plays</th><th class="r">Views</th><th class="r">Comments</th><th></th></tr></thead><tbody>
    ${ig.all.map((r) => `<tr class="${r.kind && r.kind !== 'reel' ? 'dim' : ''}">
      <td class="nowrap">${fmtDate(r.date)}<div class="muted small">${fmtTime(r.time)}</div></td>
      <td class="cap">${esc(r.caption || '')}${r.kind && r.kind !== 'reel' ? ` <span class="tag">${esc(r.kind)}</span>` : ''}</td>
      <td><select class="input sm" data-change="reelType" data-id="${esc(r.id)}" aria-label="Content type"><option value="">—</option>${opts(ct, r.contentType)}</select></td>
      <td class="r tnum">${num(r.plays)}</td><td class="r tnum">${num(r.views)}</td><td class="r tnum">${num(r.comments)}</td>
      <td class="nowrap">${r.url ? `<a class="icon-btn" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="Open on Instagram">${ic('link', 16)}</a>` : ''}${r.source === 'manual' ? `<button class="icon-btn" data-act="delReel" data-id="${esc(r.id)}" aria-label="Remove">${ic('trash', 16)}</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : empty('No posts yet. Import your Excel file in Settings, or wait for the nightly auto-update.')}
  </section>`;
}

function thoughtListHTML() {
  const q = ui.thoughtQ.trim().toLowerCase();
  const list = sortedThoughts().filter((x) =>
    (ui.thoughtCat === 'all' || (x.category || 'Uncategorised') === ui.thoughtCat) && (!q || (x.text || '').toLowerCase().includes(q)));
  return list.length ? list.map(thoughtCard).join('') : empty(q ? 'No thoughts match.' : ui.thoughtCat !== 'all' ? `Nothing in ${esc(ui.thoughtCat)} yet.` : 'Nothing saved yet. Whatever you write here can be copied from any device.');
}
const catPicker = (cur) => `<div class="cat-pick" role="radiogroup" aria-label="Category">${THOUGHT_CATS.map((c) => `<label class="chip"><input type="radio" name="category" value="${esc(c)}" ${c === cur ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div>`;
function viewThoughts() {
  const all = S.all('thoughts');
  const count = (c) => all.filter((x) => (x.category || 'Uncategorised') === c).length;
  const cats = [...THOUGHT_CATS, ...(count('Uncategorised') ? ['Uncategorised'] : [])];
  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">${all.length} saved · date &amp; time saved automatically · copy from any device</p><h1>Thoughts</h1></div></header>
  <form data-form="addThought" class="card compose">
    ${catPicker(lastThoughtCat())}
    <textarea class="input" name="text" rows="5" placeholder="Write anything — a LinkedIn post, a script, an idea… (Ctrl+Enter saves)" data-input="draft">${esc(localStorage.getItem('tracker.draft') || '')}</textarea>
    <div class="row"><button type="button" class="btn ghost" data-act="pasteThought">${ic('clip', 16)} Paste &amp; save</button><span class="spacer"></span><button class="btn primary">Save</button></div>
  </form>
  <div class="toolbar">
    <div class="chips">${[['all', 'All', all.length], ...cats.map((c) => [c, c, count(c)])].map(([k, l, n]) => `<button class="chip ${ui.thoughtCat === k ? 'active' : ''}" data-act="thoughtCat" data-v="${esc(k)}">${esc(l)} <span class="count">${n}</span></button>`).join('')}</div>
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search thoughts" value="${esc(ui.thoughtQ)}" data-input="thoughtQ"></label>
  </div>
  <div class="thought-list" id="thoughtList">${thoughtListHTML()}</div>`;
}

/* ---------------- My Book (pushed from Sector Scope after the close) ---------------- */
const inr = (n) => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
const sInr = (n) => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + inr(Math.abs(n)));
const sPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}%`);
const sign = (n) => (n > 0 ? 'good' : n < 0 ? 'bad' : '');
const seriesRet = (pts) => (pts?.length > 1 && pts[0].v ? ((pts[pts.length - 1].v / pts[0].v) - 1) * 100 : null);
const LINE_COLORS = ['#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#64748b'];

function lineChart(series) {
  const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.d)))].sort();
  if (dates.length < 2) return empty('The chart appears after two sessions.');
  const W = 640, H = 230, L = 40, R = 10, T = 12, B = 24;
  const lines = series.map((s) => {
    const base = s.pts[0]?.v;
    const m = new Map(s.pts.map((p) => [p.d, base ? (p.v / base) * 100 : null]));
    return { ...s, vals: dates.map((d) => m.get(d) ?? null) };
  });
  const vals = lines.flatMap((l) => l.vals).filter((v) => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const x = (i) => L + (i * (W - L - R)) / (dates.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const path = (l) => l.vals.map((v, i) => (v == null ? '' : `${i && l.vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const xl = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth of 100 since the start">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join('')}
    ${y(100) > T && y(100) < H - B ? `<line x1="${L}" x2="${W - R}" y1="${y(100)}" y2="${y(100)}" class="base"/>` : ''}
    ${xl.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}">${fmtDate(dates[i])}</text>`).join('')}
    ${lines.slice().reverse().map((l) => `<path d="${path(l)}" fill="none" style="stroke:${l.color}" stroke-width="${l.bold ? 2.6 : 1.6}" ${l.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
  </svg>
  <div class="chart-legend">${lines.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)} <b class="${sign(seriesRet(l.pts))}">${sPct(seriesRet(l.pts))}</b></span>`).join('')}</div>`;
}

function myBookCard() {
  const s = S.get('mybook', 'mybook');
  if (!s) return '';
  const b = s.book || {}, p = s.portfolio || {};
  const dayRs = (b.positions || []).reduce((a, x) => a + (x.day_rs || 0), 0);
  const movers = (b.positions || []).slice().sort((a, c) => (c.day_pct ?? 0) - (a.day_pct ?? 0));
  const mv = (x) => (x ? `<span>${esc(x.sym)} <b class="${sign(x.day_pct)}">${sPct(x.day_pct)}</b></span>` : '');
  return `<section class="card">
      <div class="card-head"><h2>My Book</h2><a class="link-btn" href="#/mybook">Details →</a></div>
      <div class="mini-stats">
        <div><b>${inr(b.nav)}</b><span>book NAV</span></div>
        <div><b class="${sign(b.pnl)}">${sPct(b.pnl_pct)}</b><span>book P&amp;L</span></div>
        <div><b class="${sign(dayRs)}">${sInr(dayRs)}</b><span>last session</span></div>
      </div>
      <div class="kv"><span>Total portfolio</span><b class="tnum">${inr(p.nav)} <span class="${sign(p.pnl)}">(${sPct(p.pnl_pct)})</span></b></div>
      <div class="kv"><span>Best / worst today</span><b class="movers">${mv(movers[0])} ${mv(movers[movers.length - 1])}</b></div>
      <p class="muted small">Close of ${fmtDate(s.asOf)} · next review ${fmtDate(b.next_review?.review)}</p>
    </section>`;
}

function viewMyBook() {
  const s = S.get('mybook', 'mybook');
  if (!s) return `${banner()}<header class="page-head"><div><p class="eyebrow">From Sector Scope</p><h1>My Book</h1></div></header>
    <div class="card">${empty('No data yet. Your PC sends it from Sector Scope every weekday after the close (4:30 PM and 8:30 PM).')}</div>`;
  const b = s.book || {}, p = s.portfolio || {}, g = s.gap || {}, t = s.twin || {};
  const pos = (b.positions || []).slice().sort((a, c) => (c.pnl_pct ?? 0) - (a.pnl_pct ?? 0));
  const dayRs = pos.reduce((a, x) => a + (x.day_rs || 0), 0);
  const dayPct = b.nav ? (dayRs * 100) / (b.nav - dayRs) : null;
  const tot = pos.reduce((a, x) => ({ inv: a.inv + (x.invested || 0), val: a.val + (x.value || 0), pnl: a.pnl + (x.pnl || 0) }), { inv: 0, val: 0, pnl: 0 });
  const nb = b.next_review || {};
  const zone = (z) => (z ? `<span class="zone ${z === 'hold' ? 'ok' : z === 'on notice' ? 'warn' : 'bad'}">${esc(z)}</span>` : '');
  const mtfPct = p.mtf_cap ? Math.round(((p.mtf_margin_used || 0) * 100) / p.mtf_cap) : null;
  const chart = lineChart([
    { label: 'My Book', pts: b.nav_history || [], color: 'var(--accent)', bold: true },
    { label: 'Paper twin', pts: t.nav_history || [], color: '#94a3b8', dash: true },
    ...(b.benchmarks || []).map((x, i) => ({ label: x.label, pts: x.series || [], color: LINE_COLORS[i % LINE_COLORS.length] })),
  ]);
  const perfRows = (rows) => rows.map((r) => `<tr><td>${esc(r.period)}</td><td class="r tnum">${inr(r.nav)}</td><td class="r tnum ${sign(r.ret_pct)}">${sPct(r.ret_pct)}</td><td class="r tnum ${sign(r.n500_ret_pct)}">${sPct(r.n500_ret_pct)}</td><td class="r tnum ${sign((r.ret_pct ?? 0) - (r.n500_ret_pct ?? 0))}">${r.ret_pct != null && r.n500_ret_pct != null ? sPct(r.ret_pct - r.n500_ret_pct).replace('%', ' pp') : '—'}</td></tr>`).join('');
  const tradeList = (xs) => (xs || []).map((x) => `${esc(x.ticker)}${x.qty ? ` ×${x.qty}` : ''}`).join(', ') || '—';

  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">Sector Scope · close of ${fmtDate(s.asOf)} · updated ${fmtDT(s.syncedAt)}</p><h1>My Book</h1></div>
    <div class="sync-pill">${esc(b.name || 'My Book')}</div></header>

  <h2 class="section-title">Total portfolio</h2>
  <section class="stats">
    ${stat('Portfolio NAV', inr(p.nav), `Money put in ${inr(p.contributed)}`)}
    ${stat('Total P&amp;L', `<span class="${sign(p.pnl)}">${sInr(p.pnl)}</span>`, sPct(p.pnl_pct))}
    ${stat('Time-weighted', `<span class="${sign(p.twr_pct)}">${sPct(p.twr_pct)}</span>`, 'return since start')}
    ${stat('Free cash', inr(p.cash), `${p.contributed ? Math.round((p.cash * 100) / p.contributed) : '—'}% of money in`)}
    ${stat('MTF margin used', inr(p.mtf_margin_used), `${mtfPct ?? '—'}% of ${inr(p.mtf_cap)} limit`, mtfPct > 90 ? 'bad' : mtfPct > 70 ? 'warn' : '')}
  </section>

  <h2 class="section-title">My Book · 12 weekly</h2>
  <section class="stats">
    ${stat('Book NAV', inr(b.nav), `Started ${fmtDate(b.started)} with ${inr(b.capital)}`)}
    ${stat('Book P&amp;L', `<span class="${sign(b.pnl)}">${sInr(b.pnl)}</span>`, sPct(b.pnl_pct))}
    ${stat('Last session', `<span class="${sign(dayRs)}">${sInr(dayRs)}</span>`, sPct(dayPct))}
    ${stat('vs paper twin', `<span class="${sign(g.gap_pp)}">${g.gap_pp == null ? '—' : `${g.gap_pp > 0 ? '+' : ''}${g.gap_pp.toFixed(2)} pp`}</span>`, `Twin ${sPct(t.pnl_pct)} · gap ${sInr(g.gap_rs)}`)}
    ${stat('Next review', fmtDate(nb.review) || '—', `${b.reviews_applied ?? 0} reviews done · last ${fmtDate(b.last_review)}`)}
  </section>

  <section class="card"><div class="card-head"><h2>Growth of ₹100</h2><span class="muted small">My Book vs its paper twin and the indices, since ${fmtDate(b.started)}</span></div>${chart}</section>

  <section class="card"><div class="card-head"><h2>Holdings · ${pos.length}</h2><span class="muted small">Cash in book ${inr(b.cash)} · ranks as of ${fmtDate(b.ranks_as_of)} (hold ≤ ${b.buffer_rank || 24})</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Stock</th><th class="r">Qty</th><th class="r">Avg</th><th class="r">Last</th><th class="r">Value</th><th class="r">P&amp;L</th><th class="r">P&amp;L %</th><th class="r">Day</th><th class="r">Weight</th><th class="r">Rank</th></tr></thead>
      <tbody>${pos.map((x) => `<tr>
        <td><b>${esc(x.sym)}</b>${x.stale ? ' <span class="tag">stale</span>' : ''}<div class="muted small">since ${fmtDate(x.entry_date)}</div></td>
        <td class="r tnum">${x.qty}</td><td class="r tnum">${x.entry?.toLocaleString('en-IN')}</td><td class="r tnum">${x.last?.toLocaleString('en-IN')}</td>
        <td class="r tnum">${inr(x.value)}</td><td class="r tnum ${sign(x.pnl)}">${sInr(x.pnl)}</td><td class="r tnum ${sign(x.pnl_pct)}">${sPct(x.pnl_pct)}</td>
        <td class="r tnum ${sign(x.day_pct)}">${sPct(x.day_pct)}</td><td class="r tnum">${x.weight_pct?.toFixed(1)}%</td>
        <td class="r nowrap">${x.rank ?? '—'}${x.rank_prev != null && x.rank != null && x.rank_prev !== x.rank ? ` <span class="muted small">${x.rank < x.rank_prev ? '▲' : '▼'}${Math.abs(x.rank - x.rank_prev)}</span>` : ''} ${zone(x.rank_zone)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="r tnum">${inr(tot.val)}</td><td class="r tnum ${sign(tot.pnl)}">${sInr(tot.pnl)}</td><td class="r tnum ${sign(tot.pnl)}">${sPct(tot.inv ? (tot.pnl * 100) / tot.inv : null)}</td><td class="r tnum ${sign(dayRs)}">${sPct(dayPct)}</td><td></td><td></td></tr></tfoot>
    </table></div>
  </section>

  ${(p.positions || []).length ? `<section class="card"><div class="card-head"><h2>Other positions · manual &amp; MTF</h2><span class="muted small">Borrowed ${inr(p.manual?.borrowed)} · own equity ${inr(p.manual?.equity)}</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Stock</th><th class="r">Qty</th><th class="r">Buy</th><th class="r">Last</th><th class="r">Value</th><th class="r">Own money</th><th class="r">P&amp;L</th><th class="r">On own money</th><th class="r">Day</th></tr></thead>
      <tbody>${p.positions.map((x) => `<tr>
        <td><b>${esc(x.sym)}</b> ${x.mtf ? `<span class="tag">MTF ${x.leverage}x</span>` : ''}<div class="muted small">${fmtDate(x.date)}</div></td>
        <td class="r tnum">${x.qty}</td><td class="r tnum">${x.entry?.toLocaleString('en-IN')}</td><td class="r tnum">${x.last?.toLocaleString('en-IN')}</td>
        <td class="r tnum">${inr(x.value)}</td><td class="r tnum">${inr(x.equity)}</td><td class="r tnum ${sign(x.pnl)}">${sInr(x.pnl)}</td>
        <td class="r tnum ${sign(x.pnl_pct)}">${sPct(x.pnl_pct)}</td><td class="r tnum ${sign(x.day_pct)}">${sPct(x.day_pct)}</td>
      </tr>`).join('')}</tbody></table></div>
  </section>` : ''}

  <div class="grid2">
    <section class="card"><div class="card-head"><h2>Benchmarks since start</h2><span class="muted small">Total portfolio vs indices</span></div>
      <div class="hbars">${[{ label: 'My portfolio (TWR)', ret_pct: p.twr_pct, me: true }, ...(p.benchmarks || [])].map((x) => `<div class="kv ${x.me ? 'me' : ''}"><span>${esc(x.label)}</span><b class="tnum ${sign(x.ret_pct)}">${sPct(x.ret_pct)}</b></div>`).join('')}</div>
    </section>
    <section class="card"><div class="card-head"><h2>Weekly &amp; monthly</h2><span class="muted small">Total portfolio vs Nifty 500</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Period</th><th class="r">NAV</th><th class="r">Return</th><th class="r">Nifty 500</th><th class="r">vs it</th></tr></thead>
      <tbody>${perfRows([...(p.weekly || [])].reverse())}${(p.monthly || []).length ? `<tr><td colspan="5" class="group-cell">Monthly</td></tr>${perfRows([...(p.monthly || [])].reverse())}` : ''}</tbody></table></div>
    </section>
  </div>

  <div class="grid2">
    <section class="card"><div class="card-head"><h2>Reviews</h2><span class="muted small">${esc(b.rules?.review_rule || '')}</span></div>
      ${(b.log || []).slice().reverse().map((e) => `<div class="log-row"><div class="row"><b>${fmtDate(e.date)}</b><span class="tag">${esc(e.reason || '')}</span></div><div class="small"><span class="bad">Sold:</span> ${tradeList(e.sold)}</div><div class="small"><span class="good">Bought:</span> ${tradeList(e.bought)}</div></div>`).join('') || empty('No reviews yet.')}
    </section>
    <section class="card"><div class="card-head"><h2>Ledger</h2><span class="muted small">Manual, MTF and deposits</span></div>
      ${(p.ledger || []).map((e) => `<div class="log-row row small"><b class="nowrap">${fmtDate(e.date)}</b><span class="tag">${esc(e.type)}</span><span>${e.type === 'deposit' ? `${inr(e.amount)}${e.note ? ' · ' + esc(e.note) : ''}` : `${esc(e.sym || '')} ${e.qty ?? ''} @ ${e.price ?? ''}${e.mtf ? ` · MTF ${e.leverage}x` : ''}`}</span></div>`).join('') || empty('No entries.')}
    </section>
  </div>
  <p class="muted small">${esc(b.rules?.signal ? `Signal: ${b.rules.signal}. ` : '')}${esc(b.rules?.universe || '')}. ${esc(p.note || '')} Prices are ${esc(s.priceSource || 'end-of-day')}; nothing here changes during market hours.</p>`;
}

function viewBooks() {
  const books = S.all('books');
  const year = String(new Date().getFullYear());
  const by = (s) => books.filter((b) => b.status === s);
  let list = ui.bookFilter === 'all' ? books : by(ui.bookFilter);
  list = list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">${books.length} books on the shelf</p><h1>Bookshelf</h1></div><button class="btn primary" data-act="addBook">${ic('plus')} Add book</button></header>
  <section class="stats">
    ${stat('Reading now', by('reading').length)}
    ${stat(`Finished in ${year}`, books.filter((b) => b.status === 'finished' && (b.finishedAt || '').startsWith(year)).length)}
    ${stat('Want to read', by('want').length)}
    ${stat('Paused', by('paused').length)}
  </section>
  <div class="toolbar"><div class="chips">${[...BOOK_STATUSES, ['all', 'All']].map(([k, l]) => `<button class="chip ${ui.bookFilter === k ? 'active' : ''}" data-act="bookFilter" data-v="${k}">${l} <span class="count">${k === 'all' ? books.length : by(k).length}</span></button>`).join('')}</div></div>
  <div class="book-grid">${list.length ? list.map(bookCard).join('') : empty('No books here yet.')}</div>`;
}
function bookCard(b) {
  const p = bookProgress(b);
  const label = Object.fromEntries(BOOK_STATUSES)[b.status] || b.status;
  return `<article class="book card">
    <div class="spine tall" style="--h:${hue(b.title)}"></div>
    <div class="book-body">
      <div class="book-top"><div><div class="book-title">${esc(b.title)}</div><div class="muted small">${esc(b.author || 'Unknown author')}</div></div><span class="chip st-${b.status}">${label}</span></div>
      ${b.status !== 'want' ? `<div class="progress"><span style="width:${p ?? 0}%"></span></div>
      <div class="row small">${b.status === 'finished' ? `<span>Finished ${b.finishedAt ? fmtDate(b.finishedAt) : ''}</span>` : `<span>Page</span><input class="input page-input" type="number" min="0" ${b.totalPages ? `max="${b.totalPages}"` : ''} value="${b.currentPage || 0}" data-change="bookPage" data-id="${b.id}" aria-label="Current page"><span>${b.totalPages ? `of ${b.totalPages}` : ''}</span>`}<span class="spacer"></span><b class="tnum">${p == null ? '' : p + '%'}</b></div>` : ''}
      <div class="muted small">${b.startedAt ? `Started ${fmtDate(b.startedAt)}` : ''}</div>
      <div class="stars">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= (b.rating || 0) ? 'on' : ''}" data-act="rateBook" data-id="${b.id}" data-v="${n}" aria-label="Rate ${n}">${ic('star', 16)}</button>`).join('')}</div>
      ${b.notes ? `<p class="book-notes">${esc(b.notes)}</p>` : ''}
      <div class="row actions">
        ${b.status !== 'reading' && b.status !== 'finished' ? `<button class="btn sm" data-act="bookStatus" data-id="${b.id}" data-v="reading">Start reading</button>` : ''}
        ${b.status === 'reading' ? `<button class="btn sm" data-act="bookStatus" data-id="${b.id}" data-v="finished">${ic('check', 15)} Finished</button><button class="btn sm ghost" data-act="bookStatus" data-id="${b.id}" data-v="paused">Pause</button>` : ''}
        <span class="spacer"></span>
        <button class="icon-btn" data-act="editBook" data-id="${b.id}" aria-label="Edit">${ic('pen', 16)}</button>
        <button class="icon-btn" data-act="delBook" data-id="${b.id}" aria-label="Delete">${ic('trash', 16)}</button>
      </div>
    </div>
  </article>`;
}

function ideaListHTML() {
  const q = ui.ideaQ.trim().toLowerCase();
  let list = S.all('ideas');
  if (ui.ideaFilter !== 'all') list = list.filter((x) => (x.status || 'Backlog') === ui.ideaFilter);
  if (q) list = list.filter((x) => `${x.title} ${x.script || ''} ${x.notes || ''} ${x.type || ''}`.toLowerCase().includes(q));
  list.sort((a, b) => (b.planDate || '').localeCompare(a.planDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!list.length) return empty('No ideas here.');
  return list.map((x) => `<div class="idea">
    <button class="idea-main" data-act="editIdea" data-id="${esc(x.id)}">
      <span class="idea-title">${esc(x.title)}</span>
      <span class="meta">${x.type ? `<span class="tag">${esc(x.type)}</span>` : ''}${x.priority ? `<span>${esc(x.priority)} priority</span>` : ''}${x.planDate ? `<span>${ic('calendar', 13)} ${fmtDate(x.planDate)}</span>` : ''}${x.script ? `<span>${ic('pen', 13)} script</span>` : ''}</span>
    </button>
    ${x.link ? `<a class="icon-btn" href="${esc(x.link)}" target="_blank" rel="noopener" aria-label="Open reference">${ic('link', 16)}</a>` : ''}
    ${x.script ? `<button class="icon-btn" data-act="copyScript" data-id="${esc(x.id)}" aria-label="Copy script">${ic('copy', 16)}</button>` : ''}
    <select class="input sm" data-change="ideaStatus" data-id="${esc(x.id)}" aria-label="Status">${opts(IDEA_STATUSES, x.status || 'Backlog')}</select>
    <button class="icon-btn" data-act="delIdea" data-id="${esc(x.id)}" aria-label="Delete">${ic('trash', 16)}</button>
  </div>`).join('');
}
function viewIdeas() {
  const ideas = S.all('ideas');
  const count = (s) => ideas.filter((x) => (x.status || 'Backlog') === s).length;
  return `${banner()}
  <header class="page-head"><div><p class="eyebrow">${count('Backlog')} in backlog · ${count('Posted')} posted</p><h1>Content ideas</h1></div><button class="btn primary" data-act="addIdea">${ic('plus')} New idea</button></header>
  <div class="toolbar">
    <div class="chips">${[['all', 'All'], ...IDEA_STATUSES.map((s) => [s, s])].map(([k, l]) => `<button class="chip ${ui.ideaFilter === k ? 'active' : ''}" data-act="ideaFilter" data-v="${esc(k)}">${l} <span class="count">${k === 'all' ? ideas.length : count(k)}</span></button>`).join('')}</div>
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search ideas & scripts" value="${esc(ui.ideaQ)}" data-input="ideaQ"></label>
  </div>
  <div class="card idea-list" id="ideaList">${ideaListHTML()}</div>`;
}

function rulesText(key) {
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /vaults/{vault}/buckets/{bucket} {
      allow read, write: if vault == '${key || 'YOUR_KEY'}';
    }
  }
}`;
}
function deviceLink() {
  return `${location.origin}${location.pathname}#k=${S.status.key}`;
}

function viewSettings() {
  const p = prefs();
  const theme = localStorage.getItem('tracker.theme') || 'auto';
  const cloud = S.status.mode === 'cloud';
  return `<header class="page-head"><div><p class="eyebrow">Sync, import, backup</p><h1>Settings</h1></div></header>
  <section class="card">
    <div class="card-head"><h2>Sync across devices</h2><span class="sync-pill ${cloud ? (S.status.error ? 'bad' : 'good') : ''}">${cloud ? (S.status.error ? 'Error' : S.status.connected ? 'Connected' : 'Connecting / offline') : 'This device only'}</span></div>
    ${cloud ? `
      <p>Open this secret link once on each phone or laptop and bookmark it. No login needed — but anyone with this link can see your data, so keep it private.</p>
      <div class="copy-row"><input class="input grow mono" readonly value="${esc(deviceLink())}" aria-label="Device link"><button class="btn" data-act="copyLink">${ic('copy', 16)} Copy link</button></div>
      <details><summary>Firestore security rules (paste once in Firebase console)</summary>
        <p class="muted small">Firebase console → Firestore Database → Rules → replace everything with this → Publish. It locks the database to your secret key only.</p>
        <pre class="code">${esc(rulesText(S.status.key))}</pre><button class="btn sm" data-act="copyRules">${ic('copy', 15)} Copy rules</button>
      </details>
      <details><summary>Secret for the nightly Instagram job</summary>
        <p class="muted small">In GitHub: your repo → Settings → Secrets and variables → Actions → New secret named <code>VAULT_KEY</code> with this value:</p>
        <div class="copy-row"><input class="input grow mono" readonly value="${esc(S.status.key)}" aria-label="Vault key"><button class="btn" data-act="copyKey">${ic('copy', 16)} Copy</button></div>
      </details>
      ${S.hasLocalData() ? `<p><button class="btn" data-act="uploadLocal">${ic('upload', 16)} Move data saved on this device into the cloud</button></p>` : ''}
      ${S.status.error ? `<p class="bad">Last error: ${esc(S.status.error)}${/permission/i.test(S.status.error) ? ' — the Firestore rules above are probably not published yet.' : ''}</p>` : ''}
    ` : `<p>Right now everything is saved in this browser only. To sync phone + laptop, paste your Firebase settings into <code>js/config.js</code> (I'll do this for you once you share them).</p>`}
  </section>

  <section class="card">
    <div class="card-head"><h2>Instagram</h2></div>
    <form class="form-grid" data-form="instaPrefs">
      ${field('Account', `<input class="input" value="@${esc(INSTA.username)}" disabled>`)}
      ${field('Count consistency from', `<input class="input" type="date" name="instaStart" value="${esc(p.instaStart || INSTA.trackingStart)}">`)}
      <div class="field end"><button class="btn">Save</button></div>
    </form>
    <p class="muted small">New reels arrive automatically every night (11:30 PM IST) via Apify. You can also run it any time from GitHub → Actions → "Instagram auto-update" → Run workflow.</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>Import &amp; backup</h2></div>
    <div class="io-grid">
      <label class="io"><b>${ic('upload', 16)} Import old Excel tracker</b><span class="muted small">Brings in reels history, content bank and content plan from Instagram_Content_Tracker.xlsx. Safe to repeat.</span><input type="file" accept=".xlsx,.xls" data-change="importExcel"></label>
      <button class="io" data-act="exportExcel"><b>${ic('download', 16)} Download everything as Excel</b><span class="muted small">One sheet each for tasks, thoughts, books, ideas and reels.</span></button>
      <button class="io" data-act="exportJson"><b>${ic('download', 16)} Download full backup</b><span class="muted small">A .json file you can restore from later. Do this monthly.</span></button>
      <label class="io"><b>${ic('upload', 16)} Restore from backup</b><span class="muted small">Merges a backup .json into your data.</span><input type="file" accept=".json,application/json" data-change="importJson"></label>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Appearance</h2></div>
    <div class="chips">${[['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="chip ${theme === k ? 'active' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>
  </section>`;
}

function viewSetupKey() {
  return `<div class="setup card">
    <h1>Set up this device</h1>
    <p>Your tracker is connected to Firebase. Is this the first device you're using?</p>
    <button class="btn primary" data-act="createVault">Yes — create my tracker</button>
    <div class="or">or</div>
    <form data-form="joinVault" class="copy-row">
      <input class="input grow" name="link" placeholder="Paste the secret link from your other device" required>
      <button class="btn">Connect</button>
    </form>
  </div>`;
}

/* ---------------- router & render ---------------- */
const ROUTES = { '': viewDashboard, tasks: viewTasks, insta: viewInsta, mybook: viewMyBook, thoughts: viewThoughts, books: viewBooks, ideas: viewIdeas, settings: viewSettings };
const route = () => location.hash.replace(/^#\/?/, '').split(/[?#]/)[0];

function render() {
  const r = ROUTES[route()] ? route() : '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r));
  const view = $('#view');
  view.innerHTML = S.status.needsKey ? viewSetupKey() : ROUTES[r]();
  document.title = `${{ '': 'Dashboard', tasks: 'To-Do', insta: 'Instagram', mybook: 'My Book', thoughts: 'Thoughts', books: 'Bookshelf', ideas: 'Ideas', settings: 'Settings' }[r]} · My Tracker`;
}

// Don't yank the page out from under someone typing; re-render once they leave the field.
let pendingRender = false;
const typing = () => { const a = document.activeElement; return a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox'; };
function scheduleRender() { if (typing()) pendingRender = true; else render(); }
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; render(); } }, 0));

/* ---------------- actions ---------------- */
const byId = (col, el) => S.get(col, el.dataset.id);

function taskModal(x) {
  openModal('Edit task', `
    ${field('Task', `<input class="input" name="title" value="${esc(x.title)}" required>`)}
    <div class="form-grid">
      ${field('Due date', `<input class="input" type="date" name="due" value="${esc(x.due || '')}">`)}
      ${field('Time', `<input class="input" type="time" name="time" value="${esc(x.time || '')}">`)}
      ${field('Priority', `<select class="input" name="priority">${opts(PRIOS, x.priority || 'med')}</select>`)}
      ${field('Category', `<input class="input" name="category" value="${esc(x.category || '')}">`)}
    </div>
    ${field('Notes', `<textarea class="input" name="notes" rows="3">${esc(x.notes || '')}</textarea>`)}
    <label class="check-line"><input type="checkbox" name="done" ${x.done ? 'checked' : ''}> Done${x.doneAt ? ` <span class="muted small">(${fmtDT(x.doneAt)})</span>` : ''}</label>
    <p class="muted small">Created ${fmtDT(x.createdAt)}</p>`,
  (v) => {
    const done = !!v.done;
    S.update('tasks', x.id, { title: v.title.trim(), due: v.due || null, time: v.time || null, priority: v.priority, category: v.category.trim() || null, notes: v.notes.trim() || null, done, doneAt: done ? x.doneAt || S.nowISO() : null });
  });
}

function bookModal(b = {}) {
  openModal(b.id ? 'Edit book' : 'Add book', `
    ${field('Title', `<input class="input" name="title" value="${esc(b.title || '')}" required>`)}
    ${field('Author', `<input class="input" name="author" value="${esc(b.author || '')}">`)}
    <div class="form-grid">
      ${field('Status', `<select class="input" name="status">${opts(BOOK_STATUSES, b.status || 'reading')}</select>`)}
      ${field('Total pages', `<input class="input" type="number" min="0" name="totalPages" value="${b.totalPages || ''}">`)}
      ${field('Current page', `<input class="input" type="number" min="0" name="currentPage" value="${b.currentPage || ''}">`)}
      ${field('Rating', `<select class="input" name="rating">${opts([['0', '—'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']], String(b.rating || 0))}</select>`)}
      ${field('Started', `<input class="input" type="date" name="startedAt" value="${esc(b.startedAt || '')}">`)}
      ${field('Finished', `<input class="input" type="date" name="finishedAt" value="${esc(b.finishedAt || '')}">`)}
    </div>
    ${field('Notes / takeaways', `<textarea class="input" name="notes" rows="4">${esc(b.notes || '')}</textarea>`)}`,
  (v) => {
    const t = today();
    const item = {
      ...b, title: v.title.trim(), author: v.author.trim() || null, status: v.status,
      totalPages: +v.totalPages || null, currentPage: +v.currentPage || 0, rating: +v.rating || 0,
      startedAt: v.startedAt || (v.status === 'reading' || v.status === 'finished' ? b.startedAt || t : null),
      finishedAt: v.finishedAt || (v.status === 'finished' ? t : null), notes: v.notes.trim() || null,
    };
    S.put('books', item);
    toast(b.id ? 'Book updated' : 'Book added');
  });
}

function ideaModal(x = {}) {
  openModal(x.id ? 'Edit idea' : 'New idea', `
    ${field('Idea / hook', `<input class="input" name="title" value="${esc(x.title || '')}" required>`)}
    <div class="form-grid">
      ${field('Content type', `<select class="input" name="type"><option value="">—</option>${opts(contentTypes(), x.type)}</select>`)}
      ${field('Priority', `<select class="input" name="priority"><option value="">—</option>${opts(['High', 'Medium', 'Low'], x.priority)}</select>`)}
      ${field('Status', `<select class="input" name="status">${opts(IDEA_STATUSES, x.status || 'Backlog')}</select>`)}
      ${field('Planned date', `<input class="input" type="date" name="planDate" value="${esc(x.planDate || '')}">`)}
    </div>
    ${field('Reference link', `<input class="input" type="url" name="link" value="${esc(x.link || '')}" placeholder="https://">`)}
    ${field('Script', `<textarea class="input" name="script" rows="8">${esc(x.script || '')}</textarea>`)}
    ${field('Notes', `<textarea class="input" name="notes" rows="2">${esc(x.notes || '')}</textarea>`)}`,
  (v) => {
    S.put('ideas', { ...x, title: v.title.trim(), type: v.type || null, priority: v.priority || null, status: v.status, planDate: v.planDate || null, link: v.link.trim() || null, script: v.script.trim() || null, notes: v.notes.trim() || null });
    toast(x.id ? 'Idea updated' : 'Idea saved');
  });
}

function saveThought(text, category) {
  if (!text.trim()) return;
  category ||= lastThoughtCat();
  S.put('thoughts', { text: text.replace(/\s+$/, ''), category, pinned: false });
  try { localStorage.setItem('tracker.thoughtCat', category); } catch {}
  try { localStorage.removeItem('tracker.draft'); } catch {}
  toast('Saved');
}

const ACTS = {
  closeModal,
  toggleTask: (el) => { const x = byId('tasks', el); if (x) S.update('tasks', x.id, { done: !x.done, doneAt: x.done ? null : S.nowISO() }); },
  editTask: (el) => { const x = byId('tasks', el); if (x) taskModal(x); },
  delTask: (el) => { const x = byId('tasks', el); if (x && confirm(`Delete "${x.title}"?`)) S.remove('tasks', x); },
  taskFilter: (el) => { ui.taskFilter = el.dataset.v; render(); },
  expand: (el) => { ui.expanded.has(el.dataset.id) ? ui.expanded.delete(el.dataset.id) : ui.expanded.add(el.dataset.id); render(); },
  copyThought: (el) => { const x = byId('thoughts', el); if (x) copyText(x.text); },
  pinThought: (el) => { const x = byId('thoughts', el); if (x) S.update('thoughts', x.id, { pinned: !x.pinned }); },
  editThought: (el) => {
    const x = byId('thoughts', el);
    if (x) openModal('Edit thought', `${field('Category', `<select class="input" name="category">${opts(THOUGHT_CATS, x.category || '')}${x.category ? '' : '<option value="" selected>Uncategorised</option>'}</select>`)}<textarea class="input" name="text" rows="10">${esc(x.text)}</textarea><p class="muted small">Saved ${fmtDT(x.createdAt)}</p>`, (v) => { if (v.text.trim()) S.update('thoughts', x.id, { text: v.text, category: v.category || null, editedAt: S.nowISO() }); });
  },
  delThought: (el) => { const x = byId('thoughts', el); if (x && confirm('Delete this thought?')) S.remove('thoughts', x); },
  pasteThought: async () => {
    try { const text = await navigator.clipboard.readText(); if (text.trim()) { saveThought(text, $('[data-form=addThought] [name=category]:checked')?.value); render(); } else toast('Clipboard is empty'); }
    catch { toast('Clipboard access was blocked. Paste into the box instead.'); }
  },
  addBook: () => bookModal(),
  editBook: (el) => { const b = byId('books', el); if (b) bookModal(b); },
  delBook: (el) => { const b = byId('books', el); if (b && confirm(`Remove "${b.title}" from your shelf?`)) S.remove('books', b); },
  bookFilter: (el) => { ui.bookFilter = el.dataset.v; render(); },
  rateBook: (el) => { const b = byId('books', el); if (b) S.update('books', b.id, { rating: b.rating === +el.dataset.v ? 0 : +el.dataset.v }); },
  bookStatus: (el) => {
    const b = byId('books', el);
    if (!b) return;
    const s = el.dataset.v;
    const patch = { status: s };
    if (s === 'reading' && !b.startedAt) patch.startedAt = today();
    if (s === 'finished') { patch.finishedAt = today(); if (b.totalPages) patch.currentPage = b.totalPages; }
    S.update('books', b.id, patch);
    if (s === 'finished') toast(`Finished "${b.title}" 🎉`);
  },
  addIdea: () => ideaModal(),
  editIdea: (el) => { const x = byId('ideas', el); if (x) ideaModal(x); },
  delIdea: (el) => { const x = byId('ideas', el); if (x && confirm(`Delete idea "${x.title}"?`)) S.remove('ideas', x); },
  copyScript: (el) => { const x = byId('ideas', el); if (x?.script) copyText(x.script); },
  ideaFilter: (el) => { ui.ideaFilter = el.dataset.v; render(); },
  thoughtCat: (el) => { ui.thoughtCat = el.dataset.v; render(); },
  delReel: (el) => { const r = byId('reels', el); if (r && confirm('Remove this manual entry?')) S.remove('reels', r); },
  copyLink: () => copyText(deviceLink()),
  copyKey: () => copyText(S.status.key),
  copyRules: () => copyText(rulesText(S.status.key)),
  theme: (el) => { try { localStorage.setItem('tracker.theme', el.dataset.v); } catch {} applyTheme(); render(); },
  exportJson: () => download(`my-tracker-backup-${today()}.json`, new Blob([JSON.stringify({ app: 'my-tracker', version: 1, exportedAt: S.nowISO(), buckets: S.snapshot() }, null, 2)], { type: 'application/json' })),
  exportExcel: async () => {
    try {
      await exportExcel({ Tasks: S.all('tasks'), Thoughts: S.all('thoughts'), Books: S.all('books'), Ideas: S.all('ideas'), Reels: S.all('reels') }, `my-tracker-${today()}.xlsx`);
    } catch (e) { toast(e.message); }
  },
  uploadLocal: async () => {
    if (!confirm('Copy the data saved in this browser into your synced cloud tracker?')) return;
    await S.importBuckets(S.localSnapshot());
    toast('Device data moved to the cloud');
  },
  createVault: async () => { await S.connect(S.newKey()); location.hash = '#/settings'; render(); toast('Tracker created. Now paste the security rules below.'); },
};

const FORMS = {
  modal: (f) => { const fn = modalSubmit; const v = vals(f); v.done = f.querySelector('[name=done]')?.checked; closeModal(); fn?.(v); },
  addTask: (f) => {
    const v = vals(f);
    if (!v.title?.trim()) return;
    S.put('tasks', { title: v.title.trim(), due: v.due || null, time: v.time || null, priority: v.priority || 'med', category: v.category?.trim() || null, done: false, doneAt: null });
    toast('Task added');
    render();
    $('[data-form=addTask] [name=title]')?.focus();
  },
  addThought: (f) => { const fd = new FormData(f); saveThought(fd.get('text') || '', fd.get('category')); render(); },
  manualReel: (f) => {
    const v = vals(f);
    if (!v.date) return;
    S.put('reels', { id: `m-${v.date}`, date: v.date, time: null, caption: v.caption.trim() || 'Posted', kind: 'reel', source: 'manual' });
    toast(`Marked ${relDate(v.date)} as posted`);
  },
  instaPrefs: (f) => { S.put('settings', { ...prefs(), id: 'prefs', instaStart: vals(f).instaStart }); toast('Saved'); },
  joinVault: async (f) => {
    const key = S.keyFromText(vals(f).link);
    if (!key) return toast("That doesn't look like a tracker link");
    await S.connect(key);
    location.hash = '#/';
    render();
  },
};

const CHANGES = {
  bookPage: (el) => {
    const b = byId('books', el);
    if (!b) return;
    const page = Math.max(0, +el.value || 0);
    const done = b.totalPages && page >= b.totalPages;
    S.update('books', b.id, { currentPage: page, ...(done ? { status: 'finished', finishedAt: today() } : {}) });
    if (done) toast(`Finished "${b.title}" 🎉`);
  },
  ideaStatus: (el) => S.update('ideas', el.dataset.id, { status: el.value }),
  reelType: (el) => S.update('reels', el.dataset.id, { contentType: el.value || null }),
  importExcel: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    toast('Reading Excel…');
    try {
      const { reels, ideas } = await parseTracker(file);
      await S.putMany('reels', reels);
      await S.putMany('ideas', ideas);
      toast(`Imported ${reels.length} reels and ${ideas.length} ideas`);
    } catch (e) { console.error(e); toast('Import failed: ' + e.message); }
    el.value = '';
  },
  importJson: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.buckets) throw new Error('Not a tracker backup file');
      if (!confirm('Merge this backup into your current data?')) return;
      await S.importBuckets(data.buckets);
      toast('Backup restored');
    } catch (e) { toast('Restore failed: ' + e.message); }
    el.value = '';
  },
};

const INPUTS = {
  taskQ: (el) => { ui.taskQ = el.value; $('#taskList').innerHTML = taskListHTML(); },
  thoughtQ: (el) => { ui.thoughtQ = el.value; $('#thoughtList').innerHTML = thoughtListHTML(); },
  ideaQ: (el) => { ui.ideaQ = el.value; $('#ideaList').innerHTML = ideaListHTML(); },
  draft: (el) => { try { localStorage.setItem('tracker.draft', el.value); } catch {} },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACTS[el.dataset.act]) { e.preventDefault(); ACTS[el.dataset.act](el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](f, e); }
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) CHANGES[el.dataset.change]?.(el); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el) INPUTS[el.dataset.input]?.(el); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const ta = e.target.closest('textarea');
    if (ta?.form) { e.preventDefault(); ta.form.requestSubmit(); }
  }
});

/* ---------------- boot ---------------- */
function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('tracker.theme') || 'auto'; } catch {}
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

let lastDay = today();
setInterval(() => {
  if (today() !== lastDay) { lastDay = today(); scheduleRender(); return; }
  const c = $('#clock');
  if (c) c.textContent = clockText();
}, 15000);

async function boot() {
  applyTheme();
  S.onChange(scheduleRender);
  window.addEventListener('hashchange', () => { pendingRender = false; render(); window.scrollTo(0, 0); });
  render();
  try { await S.init(); } catch (e) { console.error(e); S.status.error = 'Could not reach Firebase: ' + e.message; }
  render();
}
boot();
