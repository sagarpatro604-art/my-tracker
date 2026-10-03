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
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M17 8h4M3 16h4M17 16h4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
};
const ic = (n, s = 18) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const CONTENT_TYPES = ['Stock Market Daily', 'News Breakdown', 'Concept Explainer', 'Storytelling Backup', 'Meme / Trend'];
const IDEA_STATUSES = ['Backlog', 'In progress', 'Ready', 'Scheduled', 'Posted'];
const BOOK_STATUSES = [['reading', 'Reading'], ['want', 'Want to read'], ['paused', 'Paused'], ['finished', 'Finished']];
const PRIOS = [['highest', 'Highest'], ['high', 'High'], ['med', 'Medium'], ['low', 'Low'], ['lowest', 'Lowest']];
const PRIO_RANK = { highest: 0, high: 1, med: 2, low: 3, lowest: 4 };
const THOUGHT_CATS = ['LinkedIn posts', 'Instagram scripts', 'Ideas', 'Instagram inspo', 'Scripting ideas'];
const lastThoughtCat = () => { try { return localStorage.getItem('tracker.thoughtCat') || 'Ideas'; } catch { return 'Ideas'; } };

const ui = { sched: { mode: 'week', anchor: today(), filter: 'all', scroll: undefined }, todoTab: 'today', searchQ: '', issueId: null, ideaView: 'board', board: { view: 'board', q: '', quick: new Set(), epic: 'all', type: 'all', group: 'none', showOldDone: false, collapsed: new Set() }, taskFilter: 'today', taskQ: '', thoughtQ: '', thoughtCat: 'all', bookFilter: 'reading', ideaFilter: 'all', ideaQ: '', expanded: new Set() };

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
  dlg.classList.remove('sheet');
  dlg.showModal();
  setTimeout(() => dlg.querySelector('input:not([type=hidden]),textarea')?.focus(), 30);
}
const closeModal = () => { $('#modal').close(); modalSubmit = null; };
function resetModal() { const d = $('#modal'); d.classList.remove('sheet'); ui.issueId = null; }
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

/* ---------------- Schedule (day / week / month) ---------------- */
const HOUR_H = 56;
const EV_KINDS = [['task', 'Tasks', 'todo'], ['reel', 'Reels', 'film'], ['idea', 'Content', 'bulb'], ['review', 'Reviews', 'chart']];

function schedRange() {
  const a = ui.sched.anchor;
  if (ui.sched.mode === 'day') return { from: a, to: a, days: [a] };
  if (ui.sched.mode === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(a), i));
    return { from: days[0], to: days[6], days };
  }
  const first = a.slice(0, 8) + '01';
  const f = parseYmd(first);
  const last = ymd(new Date(f.getFullYear(), f.getMonth() + 1, 0));
  const days = [];
  for (let d = weekStart(first); d <= addDays(weekStart(last), 6); d = addDays(d, 1)) days.push(d);
  return { from: days[0], to: days[days.length - 1], days, month: first.slice(0, 7) };
}

function schedLabel() {
  const { days, month } = schedRange();
  if (month) { const f = parseYmd(month + '-01'); return `${MON_LONG[f.getMonth()]} ${f.getFullYear()}`; }
  const s = parseYmd(days[0]), e = parseYmd(days[days.length - 1]);
  if (days.length === 1) return `${DAY[s.getDay()]}, ${s.getDate()} ${MON[s.getMonth()]}`;
  return `${MON[s.getMonth()]} ${s.getDate()} - ${MON[e.getMonth()]} ${e.getDate()}`;
}

function schedEvents(from, to) {
  const inRange = (d) => d && d >= from && d <= to;
  const ev = [];
  for (const x of S.all('tasks')) if (inRange(x.due)) ev.push({ kind: 'task', id: x.id, d: x.due, time: x.time, title: x.title, done: x.done, sub: x.category });
  for (const r of S.all('reels')) if (inRange(r.date)) ev.push({ kind: 'reel', id: r.id, d: r.date, time: r.time, title: r.caption || 'Reel', url: r.url, sub: r.kind === 'carousel' ? 'Carousel' : 'Reel posted' });
  for (const i of S.all('ideas')) if (inRange(i.planDate) && i.status !== 'Posted') ev.push({ kind: 'idea', id: i.id, d: i.planDate, time: i.planTime, title: i.title, sub: i.type || 'Planned content' });
  const rv = S.get('mybook', 'mybook')?.book?.next_review?.review;
  if (inRange(rv)) ev.push({ kind: 'review', d: rv, title: 'My Book weekly review', sub: 'Sector Scope' });
  return ev;
}

function evEl(e, cls, style = '') {
  const sub = [e.time ? fmtTime(e.time) : '', e.sub ? esc(e.sub) : ''].filter(Boolean).join(' · ');
  const inner = `<span class="ev-t">${esc(e.title)}</span>${sub ? `<span class="ev-s">${sub}</span>` : ''}`;
  const c = `ev ev-${e.kind} ${e.done ? 'is-done' : ''} ${cls}`;
  const st = style ? ` style="${style}"` : '';
  if (e.kind === 'reel') return e.url ? `<a class="${c}"${st} href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.title)}">${inner}</a>` : `<a class="${c}"${st} href="#/insta">${inner}</a>`;
  if (e.kind === 'review') return `<a class="${c}"${st} href="#/mybook" title="${esc(e.title)}">${inner}</a>`;
  return `<button class="${c}"${st} data-act="${e.kind === 'task' ? 'editTask' : 'editIdea'}" data-id="${esc(e.id)}" title="${esc(e.title)}">${inner}</button>`;
}

// Timed events for one day, side by side where they overlap.
function layoutDay(evs) {
  const items = evs.map((e) => { const [h, m] = e.time.split(':').map(Number); const s = h * 60 + (m || 0); return { e, s, end: s + 60 }; }).sort((a, b) => a.s - b.s);
  const out = [];
  let cluster = [], cEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) { let l = lanes.findIndex((end) => end <= it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.end; it.lane = l; }
    cluster.forEach((it) => { it.n = lanes.length; });
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) { if (cluster.length && it.s >= cEnd) flush(); cluster.push(it); cEnd = Math.max(cEnd, it.end); }
  if (cluster.length) flush();
  return out.map((it) => evEl(it.e, 'ev-block', `top:${(it.s / 60) * HOUR_H + 2}px;height:${HOUR_H - 6}px;left:calc(${(it.lane * 100) / it.n}% + 3px);width:calc(${100 / it.n}% - 6px)`)).join('');
}

function scheduleHTML(full = false) {
  const { from, to, days, month } = schedRange();
  const all = schedEvents(from, to);
  const evs = ui.sched.filter === 'all' ? all : all.filter((e) => e.kind === ui.sched.filter);
  const t = today();
  const head = `<div class="sched-top">
      <div class="sched-title"><span class="muted">${ic('grip', 16)}</span>${ic('calendar', 18)}<h2>Schedule</h2></div>
      <div class="range-nav"><button class="icon-btn" data-act="schedNav" data-v="-1" aria-label="Previous">${ic('chevL', 16)}</button><button class="range-lbl" data-act="schedToday" title="Back to today">${schedLabel()}</button><button class="icon-btn" data-act="schedNav" data-v="1" aria-label="Next">${ic('chevR', 16)}</button></div>
      <span class="spacer"></span>
      <div class="seg">${['day', 'week', 'month'].map((m) => `<button class="${ui.sched.mode === m ? 'on' : ''}" data-act="schedMode" data-v="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
      ${full ? '' : `<a class="icon-btn" href="#/schedule" aria-label="Open full schedule">${ic('expand', 17)}</a>`}
    </div>
    <div class="chips sched-filters">${[['all', 'All', all.length, null], ...EV_KINDS.map(([k, l, i]) => [k, l, all.filter((e) => e.kind === k).length, i])].map(([k, l, n, i]) => `<button class="chip ${ui.sched.filter === k ? 'active' : ''}" data-act="schedFilter" data-v="${k}">${i ? ic(i, 14) + ' ' : ''}${l}${k === 'all' ? '' : ` (${n})`}</button>`).join('')}</div>`;

  if (month) {
    const cells = days.map((d) => {
      const de = evs.filter((e) => e.d === d);
      return `<div class="m-cell ${d.slice(0, 7) === month ? '' : 'out'} ${d === t ? 'today' : ''}">
        <button class="m-date" data-act="schedDay" data-v="${d}" aria-label="Open ${fmtDate(d)}">${parseYmd(d).getDate()}</button>
        ${de.slice(0, 3).map((e) => evEl(e, 'ev-chip')).join('')}
        ${de.length > 3 ? `<button class="m-more" data-act="schedDay" data-v="${d}">+${de.length - 3} more</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="sched">${head}<div class="sched-scroll-x"><div class="month-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="m-h">${d}</div>`).join('')}${cells}</div></div></div>`;
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const showNow = days.includes(t);
  return `<div class="sched ${full ? 'full' : ''}">${head}
    <div class="sched-scroll-x"><div class="sched-cal ${days.length === 1 ? 'one' : ''}" style="--cols:${days.length}">
      <div class="sc-row sc-head"><div class="gut small muted">GMT +5:30</div>${days.map((d) => { const dt = parseYmd(d); return `<button class="dh ${d === t ? 'today' : ''}" data-act="schedDay" data-v="${d}">${DAY[dt.getDay()].toUpperCase()} <b>${dt.getDate()}</b></button>`; }).join('')}</div>
      <div class="sc-row sc-allday"><div class="gut small">All Day</div>${days.map((d) => `<div class="ad">${evs.filter((e) => e.d === d && !e.time).map((e) => evEl(e, 'ev-chip')).join('')}</div>`).join('')}</div>
      <div class="sc-body" id="schedBody"><div class="sc-row sc-grid" style="height:${24 * HOUR_H}px">
        <div class="gut hours">${hours.map((h) => (h ? `<span style="top:${h * HOUR_H}px">${fmtTime(pad(h) + ':00')}</span>` : '')).join('')}${showNow ? `<span class="now-badge" style="top:${(nowMin / 60) * HOUR_H}px">${clockText()}</span>` : ''}</div>
        ${days.map((d) => `<div class="col ${d === t ? 'today' : ''}">${hours.map((h) => `<button class="slot" style="top:${h * HOUR_H}px;height:${HOUR_H}px" data-act="slotAdd" data-d="${d}" data-h="${h}" aria-label="Add a task on ${fmtDate(d)} at ${fmtTime(pad(h) + ':00')}"></button>`).join('')}${layoutDay(evs.filter((e) => e.d === d && e.time))}${d === t ? `<div class="now-line" style="top:${(nowMin / 60) * HOUR_H}px"></div>` : ''}</div>`).join('')}
      </div></div>
    </div></div>
  </div>`;
}

function afterRender() {
  const sb = $('#schedBody');
  if (!sb) return;
  const { days } = schedRange();
  sb.scrollTop = ui.sched.scroll ?? (days.includes(today()) ? Math.max(0, new Date().getHours() - 2) : 8) * HOUR_H;
  sb.addEventListener('scroll', () => { ui.sched.scroll = sb.scrollTop; }, { passive: true });
}

function viewSchedule() {
  return `${banner()}<section class="card">${scheduleHTML(true)}</section>
  <p class="muted small">Click an empty slot to add a task at that time. Reels come from the nightly Instagram update, content from your ideas' planned dates, and reviews from My Book.</p>`;
}

/* ---------------- To Do panel ---------------- */
const TODO_TABS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['done', 'Done']];

function todoCard(x) {
  const t = today();
  const over = !x.done && x.due && x.due < t;
  const due = x.done && x.doneAt
    ? `Done ${DAY[new Date(x.doneAt).getDay()]}, ${fmtDT(x.doneAt).replace(', ', ' • ')}`
    : x.due ? `Due ${DAY[parseYmd(x.due).getDay()]}, ${fmtDate(x.due)} • ${x.time ? fmtTime(x.time) : 'Any time'}` : 'No due date';
  return `<div class="todo-card ${x.done ? 'is-done' : ''} ${over ? 'over' : ''}">
    <div class="row"><span class="pill-chip prio-${x.priority || 'med'}">${ic('file', 13)} ${esc(x.category || 'Task')}</span><span class="spacer"></span>
      <button class="chk" data-act="toggleTask" data-id="${x.id}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}">${ic('check', 14)}</button></div>
    <div class="muted small">${PRIO_LABEL[x.priority || 'med']} priority${x.notes ? ' · ' + esc(x.notes.slice(0, 60)) : ''}</div>
    <button class="todo-title" data-act="editTask" data-id="${x.id}">${esc(x.title)}</button>
    <span class="due-pill ${over ? 'bad' : x.done ? 'good' : ''}">${ic('clock', 13)} ${over ? 'Overdue · ' : ''}${due}</span>
  </div>`;
}

function todoPanel() {
  const g = taskBuckets(S.all('tasks'));
  const tab = ui.todoTab;
  const list = tab === 'done' ? g.done.slice().sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 40) : sortTasks(g[tab] || []);
  const badge = (k) => (k === 'today' ? g.today.filter((x) => !x.done).length : g[k].length);
  const d = new Date();
  const dueFor = tab === 'upcoming' ? addDays(today(), 1) : today();
  return `<section class="card todo c-todo">
    <div class="todo-head"><div class="date-badge"><span>${DAY[d.getDay()]}</span><b>${pad(d.getDate())}</b></div><h2>To Do List</h2><span class="spacer"></span><a class="link-btn" href="#/tasks">View all</a></div>
    <div class="todo-tabs">${TODO_TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="todoTab" data-v="${k}">${l}<span class="badge">${badge(k)}</span></button>`).join('')}</div>
    <form class="inline-add" data-form="addTask"><input class="input" name="title" placeholder="Add a task for ${tab === 'upcoming' ? 'tomorrow' : 'today'}…" autocomplete="off" required><input type="hidden" name="due" value="${dueFor}"><button class="btn primary" aria-label="Add task">${ic('plus')}</button></form>
    <div class="todo-list">${list.length ? list.map(todoCard).join('') : empty({ today: 'Nothing due today.', upcoming: 'Nothing coming up.', overdue: 'Nothing overdue. Nice.', done: 'Nothing completed yet.' }[tab])}</div>
  </section>`;
}

/* ---------------- Dashboard ---------------- */
const PROMO_ART = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" style="fill:var(--accent-soft)"/><rect x="34" y="40" width="52" height="40" rx="10" style="fill:none;stroke:var(--accent);stroke-width:4"/><circle cx="60" cy="60" r="10" style="fill:none;stroke:var(--accent);stroke-width:4"/><circle cx="76" cy="49" r="2.6" style="fill:var(--accent)"/><path d="M96 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" style="fill:var(--accent-2)"/><path d="M22 86l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" style="fill:var(--accent)"/></svg>`;

function viewDashboard() {
  const t = today();
  const tasks = S.all('tasks');
  const g = taskBuckets(tasks);
  const left = g.today.filter((x) => !x.done).length;
  const acc = accuracy(tasks);
  const ig = instaStats();
  const mb = S.get('mybook', 'mybook');
  const reading = S.all('books').filter((b) => b.status === 'reading');
  const thoughts = sortedThoughts().slice(0, 3);
  const postedToday = ig.byDay.has(t);
  const summary = [
    `${left} task${left === 1 ? '' : 's'} left today`,
    g.overdue.length ? `${g.overdue.length} overdue` : null,
    postedToday ? 'reel posted' : 'no reel yet today',
    mb ? `My Book ${sPct(mb.book?.pnl_pct)}` : null,
  ].filter(Boolean).join(' · ');
  const d = new Date();

  return `${banner()}
  <div class="dash">
    <section class="hero c-hero">
      <div class="hero-meta"><span class="hero-chip">PLAYBOOK</span><span>• ${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} • <span id="clock">${clockText()}</span></span></div>
      <h1>${greeting()}, Sagar</h1>
      <p>${summary}.</p>
      <div class="hero-stats">
        <span><b>${pctText(acc.week.pct)}</b> week accuracy</span>
        <span><b>${ig.streak}</b> day posting streak</span>
        <span><b>${acc.perfect}</b> perfect days</span>
      </div>
    </section>

    <div class="tiles c-tiles">
      <a class="tile" href="#/mybook">${ic('chart', 18)}<span class="grow"><b>My Book</b><small>${mb ? `${inr(mb.book?.nav)} · ${sPct(mb.book?.pnl_pct)}` : 'From Sector Scope'}</small></span>${ic('arrowR', 18)}</a>
      <a class="tile" href="#/thoughts">${ic('pen', 18)}<span class="grow"><b>Thoughts</b><small>${S.all('thoughts').length} saved</small></span>${ic('arrowR', 18)}</a>
      <a class="tile wide glow" href="#/ideas">${ic('bulb', 22)}<span class="grow"><b>Content Studio <em>· powered by you</em></b><small class="caps">Scripts | Inspo | Ideas</small></span>${ic('arrowR', 18)}</a>
    </div>

    <section class="promo c-promo">
      <div class="promo-art">${PROMO_ART}</div>
      <h3>${postedToday ? 'Posted today. <em>Keep it going!</em>' : 'Ready to <em>post</em> today?'}</h3>
      <p>${ig.streak}-day streak · ${ig.weekPosted}/${ig.weekSoFar} this week</p>
      <a class="btn primary pill" href="#/insta">${postedToday ? 'See stats' : "Let's go"}</a>
    </section>

    <section class="card c-sched">${scheduleHTML()}</section>
    ${todoPanel()}

    <section class="card c-third">
      <div class="card-head"><h2>Accuracy board</h2><span class="muted small">done on the due day</span></div>
      <div class="acc-grid">
        ${[['Today', acc.today], ['This week', acc.week], ['This month', acc.month], ['All time', acc.all]].map(([l, r]) => `<div class="acc ${toneFor(r.pct)}"><div class="acc-val">${pctText(r.pct)}</div><div class="acc-label">${l}</div><div class="acc-sub">${r.done}/${r.total}</div></div>`).join('')}
      </div>
      ${accuracyBars(acc)}
      <div class="acc-foot"><span>${ic('clock', 14)} On-time: <b>${pctText(acc.onTime)}</b></span><span>${ic('flame', 14)} Perfect days: <b>${acc.perfect}</b></span></div>
    </section>

    <section class="card c-third">
      <div class="card-head"><h2>Thoughts</h2><a class="link-btn" href="#/thoughts">View all ${ic('chevR', 14)}</a></div>
      <form data-form="addThought" class="compose small-compose">
        <textarea class="input" name="text" rows="2" placeholder="Write it down… (Ctrl+Enter saves)" data-input="draft">${esc(localStorage.getItem('tracker.draft') || '')}</textarea>
        <div class="row"><select class="input sm" name="category" aria-label="Category">${opts(THOUGHT_CATS, lastThoughtCat())}</select><span class="spacer"></span><button class="btn primary sm">Save</button></div>
      </form>
      <div class="thought-list compact">${thoughts.map(thoughtCard).join('') || empty('Your thoughts show up here, ready to copy on any device.')}</div>
    </section>

    <section class="card c-third">
      <div class="card-head"><h2>Instagram this week</h2><a class="link-btn" href="#/insta">Details ${ic('chevR', 14)}</a></div>
      ${weekStrip(ig)}
      <div class="mini-stats">
        <div><b>${ig.monthPosted}</b><span>reels this month</span></div>
        <div><b>${pctText(ig.consistency)}</b><span>consistency</span></div>
        <div><b>${num(ig.avgPlays)}</b><span>avg plays</span></div>
      </div>
      <p class="muted small">${ig.sync?.lastRun ? `Auto-updated ${fmtDT(ig.sync.lastRun)}` : 'Auto-update not connected yet'}</p>
    </section>

    ${myBookCard('c-half')}

    <section class="card ${mb ? 'c-half' : 'c-full'}">
      <div class="card-head"><h2>Currently reading</h2><a class="link-btn" href="#/books">Bookshelf ${ic('chevR', 14)}</a></div>
      ${reading.length ? `<div class="reading-list">${reading.map((b) => { const p = bookProgress(b); return `<div class="reading"><div class="spine" style="--h:${hue(b.title)}"></div><div class="grow"><div class="book-title">${esc(b.title)}</div><div class="muted small">${esc(b.author || '')}${b.totalPages ? ` · page ${b.currentPage || 0} of ${b.totalPages}` : ''}</div><div class="progress"><span style="width:${p ?? 0}%"></span></div></div><b class="tnum">${p == null ? '' : p + '%'}</b></div>`; }).join('')}</div>` : empty('No book in progress. Add one on the Bookshelf.')}
    </section>
  </div>`;
}

/* ---------------- Global search ---------------- */
function searchResults(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const has = (s) => String(s || '').toLowerCase().includes(q);
  const out = [];
  for (const x of S.all('tasks')) if (has(x.title) || has(x.category) || has(x.notes)) out.push(['tasks', 'Task', x.title, x.due ? relDate(x.due) : '']);
  for (const x of S.all('thoughts')) if (has(x.text)) out.push(['thoughts', x.category || 'Thought', (x.text || '').split('\n')[0], fmtDate(ymd(new Date(x.createdAt)))]);
  for (const x of S.all('ideas')) if (has(x.title) || has(x.script)) out.push(['ideas', 'Idea', x.title, x.status || '']);
  for (const x of S.all('books')) if (has(x.title) || has(x.author)) out.push(['books', 'Book', x.title, x.author || '']);
  for (const x of S.all('reels')) if (has(x.caption)) out.push(['insta', 'Reel', x.caption, fmtDate(x.date)]);
  for (const p of S.get('mybook', 'mybook')?.book?.positions || []) if (has(p.sym)) out.push(['mybook', 'Holding', p.sym, sPct(p.pnl_pct)]);
  return out.slice(0, 14);
}
function closeSearch() {
  const pop = $('#searchPop'), inp = $('#globalSearch');
  if (pop) pop.hidden = true;
  if (inp) { inp.value = ''; inp.blur(); }
}

/* ---------------- Navigation ---------------- */
const NAV = [['', 'Dashboard', 'home'], ['schedule', 'Schedule', 'calendar'], ['tasks', 'To-Do', 'todo'], ['insta', 'Instagram', 'insta'], ['mybook', 'My Book', 'chart'], ['thoughts', 'Thoughts', 'pen'], ['books', 'Bookshelf', 'book'], ['ideas', 'Content ideas', 'bulb']];
const BOTTOM_NAV = ['', 'schedule', 'tasks', 'thoughts', 'mybook'];
function buildNav() {
  const link = ([r, l, i]) => `<a href="#/${r}" data-nav="${r}" data-tip="${l}">${ic(i, 20)}<span class="lbl">${l}</span></a>`;
  $('#rail').innerHTML = NAV.map(link).join('') + `<div class="rail-foot">${link(['settings', 'Settings', 'sliders'])}</div>`;
  $('#bottombar').innerHTML = BOTTOM_NAV.map((r) => NAV.find((n) => n[0] === r)).map(([r, l, i]) => `<a href="#/${r}" data-nav="${r}">${ic(i, 22)}<span>${r === '' ? 'Home' : l}</span></a>`).join('');
  try { if (localStorage.getItem('tracker.rail') === 'open' && innerWidth > 820) $('#shell').classList.add('rail-open'); } catch {}
}

function newTaskModal(due, time) {
  openModal('New task', `
    ${field('Summary', `<input class="input" name="title" required autocomplete="off">`)}
    <div class="form-grid">
      ${field('Status', `<select class="input" name="status">${opts(TASK_COLS.map((c) => [c.id, c.label]), 'todo')}</select>`)}
      ${field('Type', `<select class="input" name="type">${opts(ISSUE_TYPES.map(([k, l]) => [k, l]), 'task')}</select>`)}
      ${field('Date', `<input class="input" type="date" name="due" value="${esc(due || today())}">`)}
      ${field('Time', `<input class="input" type="time" name="time" value="${esc(time || '')}">`)}
      ${field('Priority', `<select class="input" name="priority">${opts(PRIOS, 'med')}</select>`)}
      ${field('Epic', `<input class="input" name="category" list="epicListNew" placeholder="None"><datalist id="epicListNew">${[...new Set(S.all('tasks').map((y) => y.category).filter(Boolean))].map((e) => `<option value="${esc(e)}">`).join('')}</datalist>`)}
      ${field('Story points', `<input class="input" type="number" min="0" name="points">`)}
    </div>
    ${field('Description', `<textarea class="input" name="description" rows="3"></textarea>`)}`,
  (v) => {
    if (!v.title.trim()) return;
    const x = createTask({ title: v.title.trim(), status: v.status, type: v.type, due: v.due || null, time: v.time || null, priority: v.priority, category: v.category.trim() || null, points: v.points === '' ? null : +v.points, description: v.description.trim() || null });
    toast(`${x.key} created`);
  }, 'Create');
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

/* ---------------- Board (Jira-style kanban) ---------------- */
const TASK_COLS = [
  { id: 'idea', label: 'Ideas' },
  { id: 'todo', label: 'To Do' },
  { id: 'progress', label: 'In Progress', wip: 3 },
  { id: 'done', label: 'Done' },
];
const STATUS_LABEL = Object.fromEntries(TASK_COLS.map((c) => [c.id, c.label]));
const ISSUE_TYPES = [['task', 'Task', 'check', '#4c9aff'], ['content', 'Content', 'film', '#9f7aea'], ['learning', 'Learning', 'book', '#36b37e'], ['finance', 'Finance', 'chart', '#e8a33d'], ['personal', 'Personal', 'star', '#f26b5b']];
const PRIO_LABEL = Object.fromEntries(PRIOS);
const PRIO_PATH = {
  highest: 'm6 13 6-6 6 6M6 19l6-6 6 6', high: 'm6 15 6-6 6 6', med: 'M5 9h14M5 15h14', low: 'm6 9 6 6 6-6', lowest: 'm6 5 6 6 6-6M6 11l6 6 6-6',
};

const statusOf = (x) => x.status || (x.done ? 'done' : 'todo');
const typeOf = (x) => ISSUE_TYPES.find((t) => t[0] === (x.type || 'task')) || ISSUE_TYPES[0];
const typeIcon = (t) => `<span class="ti" style="background:${t[3]}" title="${t[1]}">${ic(t[2], 11)}</span>`;
const prioIcon = (p = 'med') => `<span class="pi p-${p}" title="${PRIO_LABEL[p] || 'Medium'} priority"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${PRIO_PATH[p] || PRIO_PATH.med}"/></svg></span>`;
const byOrder = (a, b) => (a.order ?? Date.parse(a.createdAt || 0)) - (b.order ?? Date.parse(b.createdAt || 0));

function keyNum(x) { return +String(x.key || '').split('-')[1] || 0; }
function nextKey() {
  const n = Math.max(S.get('settings', 'seq')?.task || 0, 0, ...S.all('tasks').map(keyNum)) + 1;
  S.put('settings', { id: 'seq', task: n });
  return `PB-${n}`;
}
function createTask(f) {
  const status = f.status || 'todo';
  return S.put('tasks', {
    type: 'task', priority: 'med', ...f, key: nextKey(), status,
    done: status === 'done', doneAt: status === 'done' ? S.nowISO() : null, order: Date.now(),
    log: [{ at: S.nowISO(), text: `Created in ${STATUS_LABEL[status]}` }],
  });
}
// Older tasks get a key, a status and an order once, oldest first.
function ensureKeys() {
  const missing = S.all('tasks').filter((t) => !t.key).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (!missing.length) return;
  let n = Math.max(S.get('settings', 'seq')?.task || 0, 0, ...S.all('tasks').map(keyNum));
  S.putMany('tasks', missing.map((t) => ({ ...t, key: `PB-${++n}`, status: statusOf(t), order: t.order ?? (Date.parse(t.createdAt || '') || Date.now()) })));
  S.put('settings', { id: 'seq', task: n });
}
function logEntry(x, text) { return [...(x.log || []), { at: S.nowISO(), text }].slice(-80); }
function moveTask(x, to, extra = {}) {
  const from = statusOf(x);
  const patch = { ...extra, status: to };
  if (from !== to) {
    patch.done = to === 'done';
    patch.doneAt = to === 'done' ? S.nowISO() : null;
    patch.log = logEntry(x, `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`);
  }
  return S.update('tasks', x.id, patch);
}

function boardTasks() {
  const t = today(), wkEnd = addDays(weekStart(t), 6), q = ui.board.q.trim().toLowerCase(), Q = ui.board.quick;
  return S.all('tasks').filter((x) => {
    if (q && !`${x.key || ''} ${x.title} ${x.description || ''} ${x.category || ''}`.toLowerCase().includes(q)) return false;
    if (ui.board.epic !== 'all' && (x.category || '') !== ui.board.epic) return false;
    if (ui.board.type !== 'all' && (x.type || 'task') !== ui.board.type) return false;
    if (Q.has('week') && !(x.due && x.due <= wkEnd && !x.done)) return false;
    if (Q.has('overdue') && !(x.due && x.due < t && !x.done)) return false;
    if (Q.has('high') && !['highest', 'high'].includes(x.priority)) return false;
    if (Q.has('flag') && !x.flagged) return false;
    return true;
  });
}

function issueCard(x) {
  const over = !x.done && x.due && x.due < today();
  const cl = x.checklist || [];
  const cd = cl.filter((i) => i.done).length;
  const tags = [
    x.flagged ? `<span class="flag-lz">${ic('flag', 12)} Blocked</span>` : '',
    x.category ? `<span class="epic-lz" style="--h:${hue(x.category)}">${esc(x.category)}</span>` : '',
    cl.length ? `<span class="kc-check ${cd === cl.length ? 'all' : ''}">${ic('check', 12)} ${cd}/${cl.length}</span>` : '',
    (x.comments || []).length ? `<span class="kc-check">${ic('chat', 12)} ${x.comments.length}</span>` : '',
  ].join('');
  return `<div class="kcard ${x.flagged ? 'flagged' : ''} ${x.done ? 'is-done' : ''}" data-id="${x.id}" data-order="${x.order ?? Date.parse(x.createdAt || 0)}" data-act="openIssue" tabindex="0" role="button" aria-label="${esc(x.key || '')} ${esc(x.title)}">
    <div class="kc-title">${esc(x.title)}</div>
    ${tags ? `<div class="kc-tags">${tags}</div>` : ''}
    <div class="kc-foot">${typeIcon(typeOf(x))}<span class="kc-key">${esc(x.key || '')}</span><span class="spacer"></span>
      ${x.due ? `<span class="kc-due ${over ? 'over' : ''}" title="Due ${fmtDate(x.due)}${x.time ? ' ' + fmtTime(x.time) : ''}">${ic('calendar', 12)} ${fmtDate(x.due)}</span>` : ''}
      ${x.points != null && x.points !== '' ? `<span class="kc-pts" title="Story points">${x.points}</span>` : ''}
      ${prioIcon(x.priority)}<span class="kav" title="Sagar">SP</span></div>
    <button class="kgrip" tabindex="-1" aria-label="Drag to move">${ic('grip', 14)}</button>
  </div>`;
}

function laneSpec(items) {
  const g = ui.board.group;
  if (g === 'epic') {
    const keys = [...new Set(items.map((x) => x.category || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    return keys.map((k) => ({ key: k, label: k || 'No epic', items: items.filter((x) => (x.category || '') === k) }));
  }
  if (g === 'priority') return PRIOS.map(([k, l]) => ({ key: k, label: `${l} priority`, items: items.filter((x) => (x.priority || 'med') === k) })).filter((l) => l.items.length);
  return [{ key: null, label: '', items }];
}

function taskBoardHTML() {
  const cutoff = addDays(today(), -14);
  let hiddenDone = 0;
  const items = boardTasks().filter((x) => {
    if (statusOf(x) === 'done' && !ui.board.showOldDone && x.doneAt && ymd(new Date(x.doneAt)) < cutoff) { hiddenDone++; return false; }
    return true;
  });
  const lanes = laneSpec(items);
  const head = TASK_COLS.map((c) => {
    const xs = items.filter((x) => statusOf(x) === c.id);
    const pts = xs.reduce((s, x) => s + (+x.points || 0), 0);
    const over = c.wip && xs.length > c.wip;
    return `<div class="kcol-head ${over ? 'over' : ''}" title="${over ? `More than ${c.wip} in progress — finish something first` : ''}"><span>${c.label}</span><span class="kcount">${xs.length}${c.wip ? ` <small>/ max ${c.wip}</small>` : ''}</span>${pts ? `<span class="kpts" title="Story points">${pts}</span>` : ''}</div>`;
  }).join('');
  const rows = lanes.map((lane, li) => {
    const collapsed = lane.key != null && ui.board.collapsed.has(lane.key);
    const laneHead = lane.key == null ? '' : `<button class="klane-head" data-act="laneToggle" data-v="${esc(lane.key)}">${ic(collapsed ? 'chevR' : 'chevD', 14)} <b>${esc(lane.label)}</b> <span class="muted small">${lane.items.length} issue${lane.items.length === 1 ? '' : 's'}</span></button>`;
    if (collapsed) return laneHead;
    const bodies = TASK_COLS.map((c) => {
      const xs = lane.items.filter((x) => statusOf(x) === c.id).sort(byOrder);
      return `<div class="kcol-body" data-status="${c.id}"${lane.key != null ? ` data-lane="${esc(lane.key)}"` : ''}>
        ${xs.map(issueCard).join('')}
        ${c.id === 'done' && li === 0 && (hiddenDone || ui.board.showOldDone) ? `<button class="kmore" data-act="toggleOldDone">${ui.board.showOldDone ? 'Hide older done issues' : `+ ${hiddenDone} done more than 14 days ago`}</button>` : ''}
        <form class="kquick" data-form="quickIssue" data-status="${c.id}"${lane.key != null ? ` data-lane="${esc(lane.key)}"` : ''}><input class="input" name="title" placeholder="+ Create issue" autocomplete="off" aria-label="Create issue in ${c.label}"></form>
      </div>`;
    }).join('');
    return `${laneHead}<div class="krow">${bodies}</div>`;
  }).join('');
  return `<div class="kboard-scroll" data-board="tasks"><div class="kboard" style="--cols:${TASK_COLS.length}"><div class="krow khead">${head}</div>${rows}</div></div>`;
}

function boardToolbar() {
  const tasks = S.all('tasks');
  const epics = [...new Set(tasks.map((x) => x.category).filter(Boolean))].sort();
  return `<div class="ktoolbar">
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search board" value="${esc(ui.board.q)}" data-input="boardQ"></label>
    <span class="kav lg" title="Sagar">SP</span>
    <div class="chips">${[['week', 'Due this week'], ['overdue', 'Overdue'], ['high', 'High priority'], ['flag', 'Blocked']].map(([k, l]) => `<button class="chip ${ui.board.quick.has(k) ? 'active' : ''}" data-act="boardQuick" data-v="${k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span>
    <select class="input sm" data-change="boardEpic" aria-label="Epic"><option value="all">All epics</option>${opts(epics, ui.board.epic)}</select>
    <select class="input sm" data-change="boardType" aria-label="Type"><option value="all">All types</option>${opts(ISSUE_TYPES.map(([k, l]) => [k, l]), ui.board.type)}</select>
    <select class="input sm" data-change="boardGroup" aria-label="Swimlanes">${opts([['none', 'No swimlanes'], ['epic', 'Swimlanes: Epic'], ['priority', 'Swimlanes: Priority']], ui.board.group)}</select>
  </div>`;
}

/* ---------------- Issue detail sheet ---------------- */
function issueSheetHTML(x) {
  const t = typeOf(x);
  const cl = x.checklist || [];
  const cd = cl.filter((i) => i.done).length;
  const epics = [...new Set(S.all('tasks').map((y) => y.category).filter(Boolean))].sort();
  const activity = [
    ...(x.comments || []).map((c) => ({ ...c, kind: 'comment' })),
    ...(x.log || []).map((l) => ({ ...l, kind: 'log' })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return `<div class="sheet-wrap">
    <header class="sheet-head">
      ${typeIcon(t)}<span class="kc-key">${esc(x.key || '')}</span>
      <span class="spacer"></span>
      <button class="btn sm ${x.flagged ? 'flag-on' : 'ghost'}" data-act="issueFlag">${ic('flag', 14)} ${x.flagged ? 'Blocked' : 'Flag as blocked'}</button>
      <button class="icon-btn" data-act="issueDelete" aria-label="Delete issue">${ic('trash', 16)}</button>
      <button class="icon-btn" data-act="closeModal" aria-label="Close">${ic('x')}</button>
    </header>
    <div class="sheet-body">
      <div class="sheet-main">
        <textarea class="issue-title" rows="1" data-change="issueField" data-f="title" aria-label="Summary">${esc(x.title)}</textarea>
        <div class="row">
          <select class="status-sel st-${statusOf(x)}" data-change="issueStatus" aria-label="Status">${opts(TASK_COLS.map((c) => [c.id, c.label]), statusOf(x))}</select>
          ${x.done && x.doneAt ? `<span class="good small">${ic('check', 14)} Resolved ${fmtDT(x.doneAt)}</span>` : ''}
        </div>
        <h4>Description</h4>
        <textarea class="input" rows="4" data-change="issueField" data-f="description" placeholder="Add a description…">${esc(x.description || x.notes || '')}</textarea>
        <h4>Checklist ${cl.length ? `<span class="muted small">${cd}/${cl.length}</span>` : ''}</h4>
        ${cl.length ? `<div class="progress thin"><span style="width:${(cd * 100) / cl.length}%"></span></div>` : ''}
        <div class="checklist">${cl.map((i) => `<div class="ck-row"><label><input type="checkbox" ${i.done ? 'checked' : ''} data-change="checkItem" data-i="${i.id}"><span class="${i.done ? 'strike' : ''}">${esc(i.text)}</span></label><button class="icon-btn sm" data-act="delCheck" data-i="${i.id}" aria-label="Remove item">${ic('x', 14)}</button></div>`).join('')}</div>
        <form class="inline-add" data-form="addCheck"><input class="input" name="text" placeholder="Add a checklist item" autocomplete="off"><button class="btn sm">Add</button></form>
        <h4>Activity</h4>
        <form class="comment-form" data-form="addComment"><textarea class="input" name="text" rows="2" placeholder="Add a comment… (Ctrl+Enter saves)"></textarea><div class="row"><span class="spacer"></span><button class="btn primary sm">Comment</button></div></form>
        <div class="activity">${activity.map((a) => a.kind === 'comment'
          ? `<div class="act comment"><span class="kav">SP</span><div class="grow"><div class="small"><b>Sagar</b> <span class="muted">${fmtDT(a.at)}</span></div><div class="act-text">${esc(a.text)}</div><button class="link-btn small" data-act="delComment" data-i="${a.id}">Delete</button></div></div>`
          : `<div class="act log"><span class="dot"></span><div class="small"><b>Sagar</b> ${esc(a.text)} <span class="muted">· ${fmtDT(a.at)}</span></div></div>`).join('') || empty('No activity yet.')}</div>
      </div>
      <aside class="sheet-side">
        <div class="side-box">
          <h4>Details</h4>
          ${field('Type', `<select class="input sm" data-change="issueField" data-f="type">${opts(ISSUE_TYPES.map(([k, l]) => [k, l]), x.type || 'task')}</select>`)}
          ${field('Priority', `<select class="input sm" data-change="issueField" data-f="priority">${opts(PRIOS, x.priority || 'med')}</select>`)}
          ${field('Epic', `<input class="input sm" list="epicList" value="${esc(x.category || '')}" data-change="issueField" data-f="category" placeholder="None"><datalist id="epicList">${epics.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>`)}
          ${field('Due date', `<input class="input sm" type="date" value="${esc(x.due || '')}" data-change="issueField" data-f="due">`)}
          ${field('Time', `<input class="input sm" type="time" value="${esc(x.time || '')}" data-change="issueField" data-f="time">`)}
          ${field('Story points', `<input class="input sm" type="number" min="0" step="1" value="${x.points ?? ''}" data-change="issueField" data-f="points">`)}
          <div class="kv"><span>Assignee</span><b><span class="kav">SP</span> Sagar</b></div>
        </div>
        <div class="muted small side-dates">Created ${fmtDT(x.createdAt)}<br>Updated ${fmtDT(x.updatedAt)}${x.doneAt ? `<br>Resolved ${fmtDT(x.doneAt)}` : ''}</div>
      </aside>
    </div>
  </div>`;
}
function openIssue(id) {
  const x = S.get('tasks', id);
  if (!x) return;
  ui.issueId = id;
  const dlg = $('#modal');
  const keep = dlg.open ? dlg.querySelector('.sheet-body')?.scrollTop : 0;
  dlg.classList.add('sheet');
  dlg.innerHTML = issueSheetHTML(x);
  if (!dlg.open) dlg.showModal();
  const body = dlg.querySelector('.sheet-body');
  if (body) body.scrollTop = keep || 0;
  const ttl = dlg.querySelector('.issue-title');
  if (ttl) { ttl.style.height = 'auto'; ttl.style.height = ttl.scrollHeight + 'px'; }
}
const curIssue = () => S.get('tasks', ui.issueId);
const FIELD_LABEL = { title: 'Summary', description: 'Description', type: 'Type', priority: 'Priority', category: 'Epic', due: 'Due date', time: 'Time', points: 'Story points' };
function fieldText(f, v) {
  if (v == null || v === '') return 'none';
  if (f === 'priority') return PRIO_LABEL[v];
  if (f === 'type') return ISSUE_TYPES.find((t) => t[0] === v)?.[1] || v;
  if (f === 'due') return fmtDate(v);
  if (f === 'time') return fmtTime(v);
  return String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v);
}

/* ---------------- Ideas board ---------------- */
function ideaCard(x) {
  return `<div class="kcard" data-id="${esc(x.id)}" data-order="${x.order ?? Date.parse(x.createdAt || 0)}" data-act="editIdea" tabindex="0" role="button" aria-label="${esc(x.title)}">
    <div class="kc-title">${esc(x.title)}</div>
    ${x.type ? `<div class="kc-tags"><span class="epic-lz" style="--h:${hue(x.type)}">${esc(x.type)}</span></div>` : ''}
    <div class="kc-foot">${typeIcon(ISSUE_TYPES[1])}${x.script ? `<span class="kc-check" title="Has a script">${ic('pen', 12)} script</span>` : ''}${x.link ? `<span class="kc-check" title="Has a reference">${ic('link', 12)}</span>` : ''}<span class="spacer"></span>
      ${x.planDate ? `<span class="kc-due">${ic('calendar', 12)} ${fmtDate(x.planDate)}</span>` : ''}
      ${x.priority ? prioIcon({ High: 'high', Medium: 'med', Low: 'low' }[x.priority] || 'med') : ''}</div>
    <button class="kgrip" tabindex="-1" aria-label="Drag to move">${ic('grip', 14)}</button>
  </div>`;
}
function ideaBoardHTML() {
  const q = ui.ideaQ.trim().toLowerCase();
  const items = S.all('ideas').filter((x) => !q || `${x.title} ${x.script || ''} ${x.notes || ''} ${x.type || ''}`.toLowerCase().includes(q));
  const head = IDEA_STATUSES.map((s) => `<div class="kcol-head"><span>${s}</span><span class="kcount">${items.filter((x) => (x.status || 'Backlog') === s).length}</span></div>`).join('');
  const bodies = IDEA_STATUSES.map((s) => `<div class="kcol-body" data-status="${esc(s)}">
    ${items.filter((x) => (x.status || 'Backlog') === s).sort(byOrder).map(ideaCard).join('')}
    <form class="kquick" data-form="quickIdea" data-status="${esc(s)}"><input class="input" name="title" placeholder="+ Add idea" autocomplete="off" aria-label="Add idea to ${s}"></form>
  </div>`).join('');
  return `<div class="kboard-scroll" data-board="ideas"><div class="kboard" style="--cols:${IDEA_STATUSES.length}"><div class="krow khead">${head}</div><div class="krow">${bodies}</div></div></div>`;
}

/* ---------------- Drag and drop (mouse anywhere on a card; touch via the grip) ---------------- */
let drag = null, justDragged = false;
function dropOrder(before, after) {
  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return before + 1000;
  if (after != null) return after - 1000;
  return Date.now();
}
function applyDrop(board, id, status, lane, order) {
  if (board === 'tasks') {
    let x = S.get('tasks', id);
    if (!x) return;
    const extra = { order };
    if (lane !== undefined && ui.board.group === 'epic' && (x.category || '') !== lane) {
      x = { ...x, log: logEntry(x, `Epic → ${lane || 'none'}`) };
      Object.assign(extra, { category: lane || null, log: x.log });
    }
    if (lane !== undefined && ui.board.group === 'priority' && (x.priority || 'med') !== lane) {
      x = { ...x, log: logEntry(x, `Priority → ${PRIO_LABEL[lane]}`) };
      Object.assign(extra, { priority: lane, log: x.log });
    }
    moveTask(x, status, extra);
  } else {
    S.update('ideas', id, { status, order });
  }
}
function placeholderAt(x, y) {
  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  drag.ghost.style.display = '';
  const body = el?.closest?.('.kcol-body');
  if (!body || body.closest('[data-board]')?.dataset.board !== drag.board) return;
  document.querySelectorAll('.kcol-body.drop').forEach((b) => b !== body && b.classList.remove('drop'));
  body.classList.add('drop');
  const before = [...body.querySelectorAll('.kcard:not(.kdragging)')].find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  body.insertBefore(drag.ph, before || body.querySelector('.kmore, .kquick'));
}
function autoScroll(x, y) {
  const sc = drag.card.closest('.kboard-scroll') || document.querySelector(`[data-board="${drag.board}"]`);
  if (sc) { const r = sc.getBoundingClientRect(); if (x < r.left + 50) sc.scrollLeft -= 14; else if (x > r.right - 50) sc.scrollLeft += 14; }
  if (y < 90) window.scrollBy(0, -14); else if (y > innerHeight - 90) window.scrollBy(0, 14);
}
function endDrag(commit) {
  const d = drag;
  drag = null;
  if (!d?.started) return;
  const body = d.ph.parentElement;
  const sib = (dir) => { let s = d.ph[dir]; while (s && (!s.classList.contains('kcard') || s.classList.contains('kdragging'))) s = s[dir]; return s; };
  const before = sib('previousElementSibling'), after = sib('nextElementSibling');
  d.ghost.remove();
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.kcol-body.drop').forEach((b) => b.classList.remove('drop'));
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 80);
  if (commit && body) applyDrop(d.board, d.id, body.dataset.status, body.dataset.lane, dropOrder(before ? +before.dataset.order : null, after ? +after.dataset.order : null));
  render();
}
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.kcard');
  if (!card || e.button > 0) return;
  const grip = e.target.closest('.kgrip');
  if (e.pointerType !== 'mouse' && !grip) return;
  if (!grip && e.target.closest('button, a, input, select, textarea')) return;
  const r = card.getBoundingClientRect();
  drag = { card, id: card.dataset.id, board: card.closest('[data-board]')?.dataset.board, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, started: false };
  if (grip) e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.started = true;
    const g = drag.card.cloneNode(true);
    g.classList.add('kghost');
    g.style.width = drag.w + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    drag.ph = Object.assign(document.createElement('div'), { className: 'kph' });
    drag.ph.style.height = drag.h + 'px';
    drag.card.after(drag.ph);
    drag.card.classList.add('kdragging');
    document.body.classList.add('is-dragging');
  }
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(2.5deg)`;
  placeholderAt(e.clientX, e.clientY);
  autoScroll(e.clientX, e.clientY);
}, { passive: false });
document.addEventListener('pointerup', () => { if (drag) endDrag(true); });
document.addEventListener('pointercancel', () => { if (drag) endDrag(false); });
document.addEventListener('click', (e) => { if (justDragged && e.target.closest('.kboard')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

// Keyboard: Alt + ←/→ moves the focused card a column, Enter opens it.
function moveCardByKey(card, dir) {
  const board = card.closest('[data-board]')?.dataset.board;
  const cols = board === 'tasks' ? TASK_COLS.map((c) => c.id) : IDEA_STATUSES;
  const cur = card.closest('.kcol-body')?.dataset.status;
  const next = cols[cols.indexOf(cur) + dir];
  if (!next) return;
  applyDrop(board, card.dataset.id, next, undefined, Date.now());
  render();
  setTimeout(() => document.querySelector(`.kcard[data-id="${CSS.escape(card.dataset.id)}"]`)?.focus(), 0);
}

function viewTasks() {
  const tasks = S.all('tasks');
  const groups = taskBuckets(tasks);
  const cats = [...new Set(tasks.map((x) => x.category).filter(Boolean))];
  const t = today();
  const head = `<header class="page-head"><div><p class="eyebrow">Playbook / Tasks · ${groups.today.filter((x) => !x.done).length} left today · ${groups.overdue.length} overdue</p><h1>${ui.board.view === 'board' ? 'Board' : 'To-Do list'}</h1></div>
    <div class="row"><div class="seg">${[['board', 'Board'], ['list', 'List']].map(([k, l]) => `<button class="${ui.board.view === k ? 'on' : ''}" data-act="boardView" data-v="${k}">${l}</button>`).join('')}</div><button class="btn primary" data-act="newIssue">${ic('plus')} Create</button></div></header>`;
  if (ui.board.view === 'board') {
    return `${banner()}${head}${boardToolbar()}<div id="boardWrap">${taskBoardHTML()}</div>
    <p class="muted small">Drag a card to move it (on phone, drag the ⠿ handle). Alt + ← / → moves the selected card. Click a card for its details, checklist, comments and history.</p>`;
  }
  return `${banner()}${head}
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

function myBookCard(cls = '') {
  const s = S.get('mybook', 'mybook');
  if (!s) return '';
  const b = s.book || {}, p = s.portfolio || {};
  const dayRs = (b.positions || []).reduce((a, x) => a + (x.day_rs || 0), 0);
  const movers = (b.positions || []).slice().sort((a, c) => (c.day_pct ?? 0) - (a.day_pct ?? 0));
  const mv = (x) => (x ? `<span>${esc(x.sym)} <b class="${sign(x.day_pct)}">${sPct(x.day_pct)}</b></span>` : '');
  return `<section class="card ${cls}">
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
  <header class="page-head"><div><p class="eyebrow">${count('Backlog')} in backlog · ${count('Posted')} posted</p><h1>Content ideas</h1></div>
    <div class="row"><div class="seg">${[['board', 'Board'], ['list', 'List']].map(([k, l]) => `<button class="${ui.ideaView === k ? 'on' : ''}" data-act="ideaView" data-v="${k}">${l}</button>`).join('')}</div><button class="btn primary" data-act="addIdea">${ic('plus')} New idea</button></div></header>
  ${ui.ideaView === 'board' ? `<div class="ktoolbar"><label class="search">${ic('search', 16)}<input class="input" placeholder="Search ideas & scripts" value="${esc(ui.ideaQ)}" data-input="ideaQ"></label></div><div id="ideaBoardWrap">${ideaBoardHTML()}</div>` : `
  <div class="toolbar">
    <div class="chips">${[['all', 'All'], ...IDEA_STATUSES.map((s) => [s, s])].map(([k, l]) => `<button class="chip ${ui.ideaFilter === k ? 'active' : ''}" data-act="ideaFilter" data-v="${esc(k)}">${l} <span class="count">${k === 'all' ? ideas.length : count(k)}</span></button>`).join('')}</div>
    <label class="search">${ic('search', 16)}<input class="input" placeholder="Search ideas & scripts" value="${esc(ui.ideaQ)}" data-input="ideaQ"></label>
  </div>
  <div class="card idea-list" id="ideaList">${ideaListHTML()}</div>`}`;
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
  const theme = localStorage.getItem('tracker.theme') || 'dark';
  const palette = localStorage.getItem('tracker.palette') || 'lavender';
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
    <p class="muted small">Colours</p>
    <div class="chips">${[['lavender', 'Lavender', '#b9a6f5'], ['earth', 'Earthy', '#d9a66b']].map(([k, l, c]) => `<button class="chip ${palette === k ? 'active' : ''}" data-act="palette" data-v="${k}"><i class="swatch" style="background:${c}"></i>${l}</button>`).join('')}</div>
    <p class="muted small" style="margin-top:14px">Mode</p>
    <div class="chips">${[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match device']].map(([k, l]) => `<button class="chip ${theme === k ? 'active' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>
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
const ROUTES = { '': viewDashboard, schedule: viewSchedule, tasks: viewTasks, insta: viewInsta, mybook: viewMyBook, thoughts: viewThoughts, books: viewBooks, ideas: viewIdeas, settings: viewSettings };
const route = () => location.hash.replace(/^#\/?/, '').split(/[?#]/)[0];

function render() {
  const r = ROUTES[route()] ? route() : '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r));
  const view = $('#view');
  const boardScroll = [...view.querySelectorAll('[data-board]')].map((b) => [b.dataset.board, b.scrollLeft]);
  view.innerHTML = S.status.needsKey ? viewSetupKey() : ROUTES[r]();
  for (const [name, left] of boardScroll) { const b = view.querySelector(`[data-board="${name}"]`); if (b) b.scrollLeft = left; }
  document.title = `${{ '': 'Dashboard', schedule: 'Schedule', tasks: 'To-Do', insta: 'Instagram', mybook: 'My Book', thoughts: 'Thoughts', books: 'Bookshelf', ideas: 'Ideas', settings: 'Settings' }[r]} · Playbook`;
  afterRender();
}

// Don't yank the page out from under someone typing; re-render once they leave the field.
let pendingRender = false;
const typing = () => { const a = document.activeElement; return a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox'; };
function scheduleRender() { if (typing() || drag?.started) pendingRender = true; else render(); }
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; render(); } }, 0));

/* ---------------- actions ---------------- */
const byId = (col, el) => S.get(col, el.dataset.id);

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
  toggleRail: () => {
    const sh = $('#shell');
    sh.classList.toggle('rail-open');
    try { if (innerWidth > 820) localStorage.setItem('tracker.rail', sh.classList.contains('rail-open') ? 'open' : 'closed'); } catch {}
  },
  schedNav: (el) => {
    const n = +el.dataset.v, m = ui.sched.mode;
    if (m === 'day') ui.sched.anchor = addDays(ui.sched.anchor, n);
    else if (m === 'week') ui.sched.anchor = addDays(ui.sched.anchor, 7 * n);
    else { const d = parseYmd(ui.sched.anchor); ui.sched.anchor = ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
    ui.sched.scroll = undefined; render();
  },
  schedToday: () => { ui.sched.anchor = today(); ui.sched.scroll = undefined; render(); },
  schedMode: (el) => { ui.sched.mode = el.dataset.v; ui.sched.scroll = undefined; render(); },
  schedDay: (el) => { ui.sched.mode = 'day'; ui.sched.anchor = el.dataset.v; ui.sched.scroll = undefined; render(); },
  schedFilter: (el) => { ui.sched.filter = el.dataset.v; render(); },
  slotAdd: (el) => newTaskModal(el.dataset.d, `${pad(+el.dataset.h)}:00`),
  todoTab: (el) => { ui.todoTab = el.dataset.v; render(); },
  searchGo: (el) => {
    const q = ui.searchQ.trim(), r = el.dataset.route;
    if (r === 'tasks') { ui.taskFilter = 'all'; ui.taskQ = q; }
    if (r === 'thoughts') { ui.thoughtCat = 'all'; ui.thoughtQ = q; }
    if (r === 'ideas') { ui.ideaFilter = 'all'; ui.ideaQ = q; }
    if (r === 'books') ui.bookFilter = 'all';
    closeSearch();
    if (location.hash === '#/' + r) render(); else location.hash = '#/' + r;
  },
  palette: (el) => { try { localStorage.setItem('tracker.palette', el.dataset.v); } catch {} applyTheme(); render(); },
  toggleTask: (el) => { const x = byId('tasks', el); if (x) moveTask(x, x.done ? 'todo' : 'done'); },
  editTask: (el) => openIssue(el.dataset.id),
  openIssue: (el) => openIssue(el.dataset.id),
  boardView: (el) => { ui.board.view = el.dataset.v; render(); },
  ideaView: (el) => { ui.ideaView = el.dataset.v; render(); },
  newIssue: () => newTaskModal(today(), ''),
  boardQuick: (el) => { const q = ui.board.quick, v = el.dataset.v; q.has(v) ? q.delete(v) : q.add(v); render(); },
  laneToggle: (el) => { const c = ui.board.collapsed, v = el.dataset.v; c.has(v) ? c.delete(v) : c.add(v); render(); },
  toggleOldDone: () => { ui.board.showOldDone = !ui.board.showOldDone; render(); },
  issueFlag: () => { const x = curIssue(); if (!x) return; S.update('tasks', x.id, { flagged: !x.flagged, log: logEntry(x, x.flagged ? 'Removed the blocked flag' : 'Flagged as blocked') }); openIssue(x.id); },
  issueDelete: () => { const x = curIssue(); if (x && confirm(`Delete ${x.key || ''} "${x.title}"? This cannot be undone.`)) { closeModal(); S.remove('tasks', x); toast(`${x.key || 'Issue'} deleted`); } },
  delCheck: (el) => { const x = curIssue(); if (!x) return; S.update('tasks', x.id, { checklist: (x.checklist || []).filter((i) => i.id !== el.dataset.i) }); openIssue(x.id); },
  delComment: (el) => { const x = curIssue(); if (x && confirm('Delete this comment?')) { S.update('tasks', x.id, { comments: (x.comments || []).filter((c) => c.id !== el.dataset.i) }); openIssue(x.id); } },
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
    createTask({ title: v.title.trim(), due: v.due || null, time: v.time || null, priority: v.priority || 'med', category: v.category?.trim() || null });
    toast('Task added');
    render();
    $('[data-form=addTask] [name=title]')?.focus();
  },
  quickIssue: (f) => {
    const title = new FormData(f).get('title')?.trim();
    if (!title) return;
    const extra = {};
    if (f.dataset.lane !== undefined && ui.board.group === 'epic') extra.category = f.dataset.lane || null;
    if (f.dataset.lane !== undefined && ui.board.group === 'priority') extra.priority = f.dataset.lane;
    createTask({ title, status: f.dataset.status, ...extra });
    render();
    document.querySelector(`.kquick[data-status="${f.dataset.status}"] input`)?.focus();
  },
  quickIdea: (f) => {
    const title = new FormData(f).get('title')?.trim();
    if (!title) return;
    S.put('ideas', { title, status: f.dataset.status, order: Date.now() });
    render();
    document.querySelector(`.kquick[data-status="${CSS.escape(f.dataset.status)}"] input`)?.focus();
  },
  addCheck: (f) => {
    const x = curIssue(), text = new FormData(f).get('text')?.trim();
    if (!x || !text) return;
    S.update('tasks', x.id, { checklist: [...(x.checklist || []), { id: S.uid(), text, done: false }] });
    openIssue(x.id);
    $('#modal [data-form=addCheck] input')?.focus();
  },
  addComment: (f) => {
    const x = curIssue(), text = new FormData(f).get('text')?.trim();
    if (!x || !text) return;
    S.update('tasks', x.id, { comments: [...(x.comments || []), { id: S.uid(), at: S.nowISO(), text }] });
    openIssue(x.id);
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
  boardEpic: (el) => { ui.board.epic = el.value; render(); },
  boardType: (el) => { ui.board.type = el.value; render(); },
  boardGroup: (el) => { ui.board.group = el.value; render(); },
  issueStatus: (el) => { const x = curIssue(); if (x) { moveTask(x, el.value); openIssue(x.id); } },
  checkItem: (el) => {
    const x = curIssue();
    if (!x) return;
    S.update('tasks', x.id, { checklist: (x.checklist || []).map((i) => (i.id === el.dataset.i ? { ...i, done: el.checked } : i)) });
    openIssue(x.id);
  },
  issueField: (el) => {
    const x = curIssue(), f = el.dataset.f;
    if (!x) return;
    let v = el.value.trim();
    if (f === 'title' && !v) { el.value = x.title; return; }
    if (f === 'points') v = v === '' ? null : Math.max(0, +v);
    else if (v === '') v = null;
    const old = f === 'description' ? (x.description ?? x.notes ?? null) : (x[f] ?? null);
    if (old === v) return;
    const patch = { [f]: v };
    if (f === 'description') patch.notes = null;
    if (f !== 'description' && f !== 'title') patch.log = logEntry(x, `${FIELD_LABEL[f]} → ${fieldText(f, v)}`);
    if (f === 'title') patch.log = logEntry(x, 'Renamed the issue');
    S.update('tasks', x.id, patch);
    if (f !== 'title' && f !== 'description') openIssue(x.id);
  },
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
  ideaQ: (el) => { ui.ideaQ = el.value; const l = $('#ideaList'), b = $('#ideaBoardWrap'); if (l) l.innerHTML = ideaListHTML(); if (b) b.innerHTML = ideaBoardHTML(); },
  boardQ: (el) => { ui.board.q = el.value; $('#boardWrap').innerHTML = taskBoardHTML(); },
  draft: (el) => { try { localStorage.setItem('tracker.draft', el.value); } catch {} },
  globalSearch: (el) => {
    ui.searchQ = el.value;
    const pop = $('#searchPop'), r = searchResults(el.value);
    pop.hidden = el.value.trim().length < 2;
    pop.innerHTML = r.length ? r.map(([route, kind, title, meta]) => `<button class="sr" data-act="searchGo" data-route="${route}"><span class="tag">${esc(kind)}</span><span class="t">${esc(title)}</span><span class="muted small">${esc(meta)}</span></button>`).join('') : '<div class="empty">No matches</div>';
  },
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
document.addEventListener('click', (e) => { if (!e.target.closest('.top-search')) { const pop = $('#searchPop'); if (pop) pop.hidden = true; } });
document.addEventListener('keydown', (e) => {
  if (e.target.classList?.contains('issue-title') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
  const kc = e.target.closest?.('.kcard');
  if (kc && e.target === kc) {
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); moveCardByKey(kc, e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kc.click(); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#globalSearch')?.focus(); return; }
  if (e.key === 'Escape') { if (e.target.id === 'globalSearch') closeSearch(); if (innerWidth <= 820) $('#shell').classList.remove('rail-open'); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const ta = e.target.closest('textarea');
    if (ta?.form) { e.preventDefault(); ta.form.requestSubmit(); }
  }
});

/* ---------------- boot ---------------- */
function applyTheme() {
  let mode = 'dark', pal = 'lavender';
  try { mode = localStorage.getItem('tracker.theme') || 'dark'; pal = localStorage.getItem('tracker.palette') || 'lavender'; } catch {}
  const root = document.documentElement;
  root.dataset.theme = mode === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : mode;
  root.dataset.palette = pal;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

let lastDay = today();
setInterval(() => {
  if (today() !== lastDay) { lastDay = today(); scheduleRender(); return; }
  const c = $('#clock');
  if (c) c.textContent = clockText();
}, 15000);

async function boot() {
  applyTheme();
  buildNav();
  S.onChange(scheduleRender);
  window.addEventListener('hashchange', () => {
    // A device link opened in a tab that already has Playbook loaded: save the key and start fresh.
    const k = S.keyFromText(location.hash);
    if (k) { try { localStorage.setItem('tracker.vaultKey', k); } catch {} location.replace(location.pathname + '#/'); location.reload(); return; }
    pendingRender = false;
    if (innerWidth <= 820) $('#shell').classList.remove('rail-open');
    render();
    window.scrollTo(0, 0);
  });
  render();
  $('#modal').addEventListener('close', () => { resetModal(); render(); });
  try { await S.init(); } catch (e) { console.error(e); S.status.error = 'Could not reach Firebase: ' + e.message; }
  try { ensureKeys(); } catch (e) { console.error(e); }
  render();
}
boot();
