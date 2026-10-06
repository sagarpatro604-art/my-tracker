// Company budget: month-wise expenses (manual or from an uploaded bill), categories that grow over
// time, a dashboard, and who-paid / who-owes between the two partners. Lives in the shared company
// space (collection 'expenses'; settings in csettings 'budget'; bill files as separate documents).
import { scanBill, prepareFile } from './billscan.js';

let X; // helpers from app.js
export function initBudget(ctx) { X = ctx; }

const DEFAULT_CATS = [{ name: 'Subscriptions', color: '#8f7ae2', limit: 0 }, { name: 'Other', color: '#94a3b8', limit: 0 }];
const SUGGEST = ['Software & tools', 'Data & APIs', 'Marketing & ads', 'Office & rent', 'Hardware', 'Travel', 'Salaries & freelancers', 'Legal & compliance'];
const PALETTE = ['#8f7ae2', '#4cbf87', '#e0a83a', '#4c9aff', '#f26b5b', '#c084fc', '#2dd4bf', '#f59e0b', '#94a3b8', '#ec4899'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const SYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const PERIODS = [['', 'One-time'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];
const PERIOD_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
export const budgetUI ={ tab: 'dash', month: thisMonth(), q: '', cat: 'all', who: 'all', draft: null };

/* ---------- data ---------- */
const settings = () => X.S.get('csettings', 'budget') || {};
export const cats = () => (settings().categories?.length ? settings().categories : DEFAULT_CATS);
const catOf = (name) => cats().find((c) => c.name === name) || { name: name || 'Other', color: '#94a3b8', limit: 0 };
const all = () => X.S.all('expenses');
const spends = () => all().filter((e) => e.kind !== 'settlement');
const settlements = () => all().filter((e) => e.kind === 'settlement');
const inMonth = (m) => spends().filter((e) => (e.date || '').slice(0, 7) === m);
const sum = (xs) => xs.reduce((t, e) => t + (+e.inr || 0), 0);
const money = (n) => (n == null || isNaN(n) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
const orig = (e) => (e.currency && e.currency !== 'INR' ? `${SYM[e.currency] || e.currency + ' '}${(+e.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '');
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return `${X.MON_LONG[mo - 1]} ${y}`; };
const shortMonth = (m) => { const [y, mo] = m.split('-').map(Number); return `${X.MON[mo - 1]} ${String(y).slice(2)}`; };
// Invoices on an expense (older entries kept one file as fileId / fileName).
const filesOf = (e) => (e?.files?.length ? e.files : e?.fileId ? [{ id: e.fileId, name: e.fileName || 'bill' }] : []);
const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const payerName = (id) => (id === 'company' ? 'Company account' : X.userOf(id)?.name || id || '—');
const payerChip = (id) => (id === 'company' ? `<span class="kav" style="background:#cbd5e1" title="Company account">CO</span>` : X.avatar(id));

// Each partner's share is what they owe of every shared expense; paid minus share = balance.
function balances(month) {
  const bal = { sagar: { paid: 0, share: 0 }, bhuvan: { paid: 0, share: 0 } };
  const xs = month ? inMonth(month) : spends();
  for (const e of xs) {
    const v = +e.inr || 0;
    if (e.paidBy === 'sagar' || e.paidBy === 'bhuvan') bal[e.paidBy].paid += v;
    if (e.paidBy === 'company') continue;
    const s = e.shareSagar == null ? 50 : +e.shareSagar;
    bal.sagar.share += (v * s) / 100;
    bal.bhuvan.share += (v * (100 - s)) / 100;
  }
  if (!month) for (const t of settlements()) { if (bal[t.from]) bal[t.from].paid += +t.inr || 0; if (bal[t.to]) bal[t.to].paid -= +t.inr || 0; }
  for (const k of Object.keys(bal)) bal[k].net = bal[k].paid - bal[k].share;
  return bal;
}
function owesLine(bal) {
  const n = bal.sagar.net;
  if (Math.abs(n) < 1) return { text: 'All square — nobody owes anything.', amt: 0 };
  return n > 0 ? { text: `Bhuvan owes Sagar ${money(n)}`, amt: n, from: 'bhuvan', to: 'sagar' } : { text: `Sagar owes Bhuvan ${money(-n)}`, amt: -n, from: 'sagar', to: 'bhuvan' };
}

// The latest entry of each recurring item, with its next due date.
function renewals() {
  const last = new Map();
  for (const e of spends()) {
    if (!e.recurring) continue;
    const k = `${(e.vendor || e.title || '').toLowerCase()}|${e.recurring}`;
    if (!last.has(k) || (e.date || '') > (last.get(k).date || '')) last.set(k, e);
  }
  return [...last.values()].map((e) => {
    const d = X.parseYmd(e.date);
    d.setMonth(d.getMonth() + PERIOD_MONTHS[e.recurring]);
    return { ...e, next: X.ymd(d) };
  }).sort((a, b) => a.next.localeCompare(b.next));
}

/* ---------- views ---------- */
function monthNav() {
  return `<div class="range-nav"><button class="icon-btn" data-act="budMonth" data-v="-1" aria-label="Previous month">${X.ic('chevL', 16)}</button><button class="range-lbl" data-act="budMonthNow" title="Back to this month">${monthLabel(budgetUI.month)}</button><button class="icon-btn" data-act="budMonth" data-v="1" aria-label="Next month">${X.ic('chevR', 16)}</button></div>`;
}

function trendSVG(endMonth) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(endMonth, i - 11));
  const cs = cats();
  const data = months.map((m) => { const xs = inMonth(m); return { m, total: sum(xs), parts: cs.map((c) => sum(xs.filter((e) => (e.category || 'Other') === c.name))).concat(sum(xs.filter((e) => !cs.some((c) => c.name === (e.category || 'Other'))))) }; });
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 640, H = 200, L = 6, B = 22, bw = (W - L * 2) / 12;
  const bars = data.map((d, i) => {
    let y = H - B;
    const segs = d.parts.map((v, j) => { if (!v) return ''; const h = ((H - B - 14) * v) / max; y -= h; return `<rect x="${L + i * bw + 6}" y="${y.toFixed(1)}" width="${bw - 12}" height="${h.toFixed(1)}" rx="3" style="fill:${(cs[j] || { color: '#94a3b8' }).color}"><title>${X.esc((cs[j] || { name: 'Other' }).name)}: ${money(v)}</title></rect>`; }).join('');
    const on = d.m === budgetUI.month;
    return `${segs}<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" class="${on ? 'on' : ''}">${shortMonth(d.m)}</text>${d.total ? `<text x="${L + i * bw + bw / 2}" y="${(H - B - ((H - B - 14) * d.total) / max - 4).toFixed(1)}" text-anchor="middle" class="tot">${d.total >= 1000 ? Math.round(d.total / 1000) + 'k' : Math.round(d.total)}</text>` : ''}<rect x="${L + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent" data-act="budPick" data-v="${d.m}" style="cursor:pointer"><title>${monthLabel(d.m)}: ${money(d.total)}</title></rect>`;
  }).join('');
  return `<svg class="bud-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending by month for the last 12 months">${bars}</svg>`;
}

function viewDash() {
  const m = budgetUI.month;
  const xs = inMonth(m), prev = inMonth(addMonths(m, -1));
  const tot = sum(xs), ptot = sum(prev);
  const chg = ptot ? ((tot - ptot) * 100) / ptot : null;
  const mb = balances(m), ob = owesLine(balances());
  const runRate = renewals().reduce((t, e) => t + (+e.inr || 0) / PERIOD_MONTHS[e.recurring], 0);
  const cs = cats();
  const byCat = cs.map((c) => ({ ...c, v: sum(xs.filter((e) => (e.category || 'Other') === c.name)), n: xs.filter((e) => (e.category || 'Other') === c.name).length })).filter((c) => c.v || c.limit);
  const maxCat = Math.max(1, ...byCat.map((c) => Math.max(c.v, c.limit || 0)));
  const today = X.today();
  const ren = renewals().filter((e) => e.next <= X.addDays(today, 35)).slice(0, 8);
  return `
  <section class="stats">
    ${X.stat(`Spent in ${X.MON[+m.slice(5) - 1]}`, money(tot), chg == null ? `${xs.length} expense${xs.length === 1 ? '' : 's'}` : `<span class="${chg > 0 ? 'bad' : 'good'}">${chg > 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(0)}%</span> vs last month`)}
    ${X.stat('Subscriptions / month', money(runRate), `${renewals().length} recurring item${renewals().length === 1 ? '' : 's'}`)}
    ${X.stat('Sagar paid', money(mb.sagar.paid), `this month`)}
    ${X.stat('Bhuvan paid', money(mb.bhuvan.paid), `this month`)}
    ${X.stat('Balance (all time)', ob.amt ? money(ob.amt) : '₹0', X.esc(ob.text), ob.amt ? 'warn' : 'good')}
  </section>
  <div class="grid2">
    <section class="card"><div class="card-head"><h2>Last 12 months</h2><span class="muted small">tap a month to open it</span></div>${trendSVG(m)}
      <div class="chart-legend">${cs.map((c) => `<span><i style="background:${c.color}"></i>${X.esc(c.name)}</span>`).join('')}</div></section>
    <section class="card"><div class="card-head"><h2>By category · ${X.esc(monthLabel(m))}</h2><button class="link-btn" data-act="budTab" data-v="cats">Edit categories</button></div>
      ${byCat.length ? `<div class="hbars">${byCat.sort((a, b) => b.v - a.v).map((c) => `<div class="hbar"><span class="hbar-label"><i class="dot" style="background:${c.color}"></i>${X.esc(c.name)} <span class="muted">(${c.n})</span></span><div class="hbar-track">${c.limit ? `<i class="limit" style="left:${(c.limit * 100) / maxCat}%" title="Budget ${money(c.limit)}"></i>` : ''}<div style="width:${(c.v * 100) / maxCat}%;background:${c.limit && c.v > c.limit ? 'var(--bad-bg)' : c.color}"></div></div><b class="tnum">${money(c.v)}${c.limit ? `<small class="muted"> / ${money(c.limit)}</small>` : ''}</b></div>`).join('')}</div>` : X.empty('Nothing spent this month yet.')}
    </section>
  </div>
  <div class="grid2">
    <section class="card"><div class="card-head"><h2>Renewals coming up</h2><button class="link-btn" data-act="budRecurring">Log this month's subscriptions</button></div>
      ${ren.length ? ren.map((e) => `<div class="kv"><span><b>${X.esc(e.vendor || e.title)}</b> <span class="muted small">${X.esc(e.recurring)} · paid by ${X.esc(payerName(e.paidBy))}</span></span><b class="tnum ${e.next < today ? 'bad' : ''}">${money(e.inr)} · ${e.next < today ? 'due since ' : ''}${X.fmtDate(e.next)}</b></div>`).join('') : X.empty('No renewals in the next 5 weeks. Mark an expense as monthly or yearly to track it.')}
    </section>
    <section class="card"><div class="card-head"><h2>Latest expenses</h2><button class="link-btn" data-act="budTab" data-v="list">All expenses</button></div>
      ${xs.length ? xs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6).map(rowLite).join('') : X.empty('No expenses in this month. Upload a bill or add one.')}
    </section>
  </div>`;
}
const rowLite = (e) => `<button class="exp-lite" data-act="budEdit" data-id="${e.id}"><i class="dot" style="background:${catOf(e.category).color}"></i><span class="grow"><b>${X.esc(e.vendor || e.title || 'Expense')}</b><span class="muted small">${X.fmtDate(e.date)} · ${X.esc(e.category || 'Other')}${filesOf(e).length ? ` · 📎 ${filesOf(e).length}` : ''}</span></span>${payerChip(e.paidBy)}<b class="tnum">${money(e.inr)}</b></button>`;

function viewList() {
  const q = budgetUI.q.trim().toLowerCase();
  const m = budgetUI.month;
  let xs = budgetUI.listAll ? spends() : inMonth(m);
  xs = xs.filter((e) => (budgetUI.cat === 'all' || (e.category || 'Other') === budgetUI.cat) && (budgetUI.who === 'all' || e.paidBy === budgetUI.who) &&
    (!q || `${e.vendor} ${e.title} ${e.notes} ${e.category}`.toLowerCase().includes(q))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="toolbar">
    <label class="search">${X.ic('search', 16)}<input class="input" placeholder="Search expenses" value="${X.esc(budgetUI.q)}" data-input="budQ"></label>
    <select class="input sm" data-change="budCat" aria-label="Category"><option value="all">All categories</option>${X.opts(cats().map((c) => c.name), budgetUI.cat)}</select>
    <select class="input sm" data-change="budWho" aria-label="Paid by"><option value="all">Anyone paid</option>${X.opts([['sagar', 'Sagar'], ['bhuvan', 'Bhuvan'], ['company', 'Company account']], budgetUI.who)}</select>
    <label class="check-line small"><input type="checkbox" data-change="budAll" ${budgetUI.listAll ? 'checked' : ''}> All months</label>
    <span class="spacer"></span><button class="btn sm" data-act="budCsv">${X.ic('download', 15)} CSV</button>
  </div>
  <section class="card"><div class="card-head"><h2>${budgetUI.listAll ? 'All expenses' : X.esc(monthLabel(m))}</h2><b class="tnum">${xs.length} · ${money(sum(xs))}</b></div>
    ${xs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>What</th><th>Category</th><th>Paid by</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${xs.map((e) => `<tr><td class="nowrap">${X.fmtDate(e.date)}</td>
        <td><b>${X.esc(e.vendor || e.title || 'Expense')}</b>${e.title && e.vendor ? `<div class="muted small">${X.esc(e.title)}</div>` : ''}${e.recurring ? ` <span class="tag">${X.esc(e.recurring)}</span>` : ''}</td>
        <td><span class="tag" style="background:${catOf(e.category).color}22;color:${catOf(e.category).color}">${X.esc(e.category || 'Other')}</span></td>
        <td class="nowrap">${payerChip(e.paidBy)} ${X.esc(payerName(e.paidBy))}</td>
        <td class="r tnum"><b>${money(e.inr)}</b>${orig(e) ? `<div class="muted small">${orig(e)}</div>` : ''}</td>
        <td class="nowrap">${filesOf(e).length ? `<button class="icon-btn" data-act="budBill" data-id="${e.id}" aria-label="View invoice" title="View invoice">📎${filesOf(e).length > 1 ? `<small>${filesOf(e).length}</small>` : ''}</button>` : ''}<button class="icon-btn" data-act="budEdit" data-id="${e.id}" aria-label="Edit">${X.ic('pen', 15)}</button></td></tr>`).join('')}
    </tbody></table></div>` : X.empty('No expenses match.')}
  </section>`;
}

function viewWho() {
  const m = budgetUI.month;
  const all_ = balances(), ob = owesLine(all_);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(m, -i)).filter((mm) => inMonth(mm).length);
  return `<section class="card owes ${ob.amt ? '' : 'square'}">
      <div class="owes-row">${X.avatar('sagar', 'xl')}<div class="grow"><p class="eyebrow">Overall balance</p><h2>${X.esc(ob.text)}</h2>
        <p class="muted small">Shared costs are split ${'50/50'} unless an expense says otherwise. Paid from the company account counts for nobody.</p></div>${X.avatar('bhuvan', 'xl')}</div>
      ${ob.amt ? `<button class="btn primary" data-act="budSettle">Record a settlement (${X.esc(payerName(ob.from))} paid ${X.esc(payerName(ob.to))} ${money(ob.amt)})</button>` : ''}
    </section>
    <section class="stats">${['sagar', 'bhuvan'].map((u) => X.stat(`${payerName(u)} paid (all time)`, money(all_[u].paid), `fair share ${money(all_[u].share)} · ${all_[u].net >= 0 ? 'ahead' : 'behind'} ${money(Math.abs(all_[u].net))}`)).join('')}</section>
    <section class="card"><div class="card-head"><h2>Month by month</h2></div>
      ${months.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Month</th><th class="r">Total</th><th class="r">Sagar paid</th><th class="r">Bhuvan paid</th><th class="r">Company acct</th><th>That month</th></tr></thead><tbody>
      ${months.map((mm) => { const b = balances(mm); const co = sum(inMonth(mm).filter((e) => e.paidBy === 'company')); const o = owesLine(b); return `<tr><td><button class="link-btn" data-act="budPick" data-v="${mm}">${X.esc(monthLabel(mm))}</button></td><td class="r tnum"><b>${money(sum(inMonth(mm)))}</b></td><td class="r tnum">${money(b.sagar.paid)}</td><td class="r tnum">${money(b.bhuvan.paid)}</td><td class="r tnum">${money(co)}</td><td class="muted small">${X.esc(o.text)}</td></tr>`; }).join('')}
      </tbody></table></div>` : X.empty('No expenses yet.')}
    </section>
    <section class="card"><div class="card-head"><h2>Settlements</h2></div>
      ${settlements().length ? settlements().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((t) => `<div class="kv"><span>${X.avatar(t.from)} → ${X.avatar(t.to)} <b>${X.esc(payerName(t.from))} paid ${X.esc(payerName(t.to))}</b> <span class="muted small">${X.fmtDate(t.date)}${t.notes ? ' · ' + X.esc(t.notes) : ''}</span></span><span><b class="tnum">${money(t.inr)}</b> <button class="icon-btn" data-act="budDelSettle" data-id="${t.id}" aria-label="Remove">${X.ic('trash', 14)}</button></span></div>`).join('') : X.empty('No settlements recorded. When one of you pays the other back, record it here.')}
    </section>`;
}

function viewCats() {
  const cs = cats();
  const m = budgetUI.month;
  return `<section class="card"><div class="card-head"><h2>Categories</h2><span class="muted small">Add a category whenever a new kind of cost starts. A monthly budget is optional.</span></div>
    <div class="cat-rows">${cs.map((c, i) => `<div class="cat-row">
      <input type="color" value="${c.color}" data-change="budCatColor" data-i="${i}" aria-label="Colour for ${X.esc(c.name)}">
      <input class="input" value="${X.esc(c.name)}" data-change="budCatName" data-i="${i}" aria-label="Category name">
      <label class="lim">Monthly budget ₹<input class="input sm" type="number" min="0" value="${c.limit || ''}" placeholder="none" data-change="budCatLimit" data-i="${i}"></label>
      <span class="muted small nowrap">${money(sum(inMonth(m).filter((e) => (e.category || 'Other') === c.name)))} this month · ${spends().filter((e) => (e.category || 'Other') === c.name).length} total</span>
      ${cs.length > 1 ? `<button class="icon-btn" data-act="budCatDel" data-i="${i}" aria-label="Delete category">${X.ic('trash', 15)}</button>` : ''}
    </div>`).join('')}</div>
    <form class="inline-add" data-form="budCatAdd"><input class="input" name="name" placeholder="New category, e.g. Data & APIs" list="catSuggest" required autocomplete="off"><datalist id="catSuggest">${SUGGEST.filter((s) => !cs.some((c) => c.name === s)).map((s) => `<option value="${X.esc(s)}">`).join('')}</datalist><button class="btn primary">${X.ic('plus')} Add</button></form>
  </section>`;
}

function viewInvoices() {
  const q = budgetUI.q.trim().toLowerCase();
  const xs = (budgetUI.listAll ? spends() : inMonth(budgetUI.month)).filter((e) => filesOf(e).length);
  const rows = xs.flatMap((e) => filesOf(e).map((f) => ({ e, f })))
    .filter(({ e, f }) => (budgetUI.cat === 'all' || (e.category || 'Other') === budgetUI.cat) && (!q || `${e.vendor} ${e.title} ${f.name} ${e.notes}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
  const allFiles = spends().flatMap(filesOf);
  const used = allFiles.reduce((t, f) => t + (f.size || 150 * 1024), 0);
  const missing = (budgetUI.listAll ? spends() : inMonth(budgetUI.month)).filter((e) => !filesOf(e).length);
  return `<div class="toolbar">
    <label class="search">${X.ic('search', 16)}<input class="input" placeholder="Search invoices" value="${X.esc(budgetUI.q)}" data-input="budQ"></label>
    <select class="input sm" data-change="budCat" aria-label="Category"><option value="all">All categories</option>${X.opts(cats().map((c) => c.name), budgetUI.cat)}</select>
    <label class="check-line small"><input type="checkbox" data-change="budAll" ${budgetUI.listAll ? 'checked' : ''}> All months</label>
    <span class="spacer"></span><span class="muted small">${allFiles.length} invoice${allFiles.length === 1 ? '' : 's'} stored · about ${kb(used)} of the free 1 GB</span>
  </div>
  <section class="card"><div class="card-head"><h2>Invoices · ${budgetUI.listAll ? 'all months' : X.esc(monthLabel(budgetUI.month))}</h2><b class="tnum">${rows.length}</b></div>
    ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Expense</th><th>File</th><th class="r">Amount</th><th></th></tr></thead><tbody>
    ${rows.map(({ e, f }) => `<tr><td class="nowrap">${X.fmtDate(e.date)}</td>
      <td><b>${X.esc(e.vendor || e.title || 'Expense')}</b><div class="muted small">${X.esc(e.category || 'Other')} · paid by ${X.esc(payerName(e.paidBy))}</div></td>
      <td><button class="link-btn" data-act="budBill" data-id="${e.id}" data-fid="${f.id}">📄 ${X.esc(f.name)}</button>${f.size ? ` <span class="muted small">${kb(f.size)}</span>` : ''}</td>
      <td class="r tnum">${money(e.inr)}</td>
      <td class="nowrap"><button class="icon-btn" data-act="budDl" data-fid="${f.id}" aria-label="Download" title="Download">${X.ic('download', 15)}</button><button class="icon-btn" data-act="budEdit" data-id="${e.id}" aria-label="Edit expense" title="Edit / attach more">${X.ic('pen', 15)}</button></td></tr>`).join('')}
    </tbody></table></div>` : X.empty('No invoices here yet. Use “Upload bill”, or open any expense and press “Attach invoice”.')}
  </section>
  ${missing.length ? `<section class="card"><div class="card-head"><h2>Expenses without an invoice</h2><span class="muted small">${missing.length}</span></div>
    ${missing.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20).map((e) => `<div class="kv"><span><b>${X.esc(e.vendor || e.title || 'Expense')}</b> <span class="muted small">${X.fmtDate(e.date)} · ${money(e.inr)}</span></span><button class="btn sm" data-act="budEdit" data-id="${e.id}">📎 Attach</button></div>`).join('')}</section>` : ''}`;
}

export function viewBudget() {
  const t = budgetUI.tab;
  const tabs = [['dash', 'Dashboard'], ['list', 'Expenses'], ['who', 'Who paid'], ['inv', 'Invoices'], ['cats', 'Categories']];
  const body = t === 'list' ? viewList() : t === 'who' ? viewWho() : t === 'cats' ? viewCats() : t === 'inv' ? viewInvoices() : viewDash();
  return `${X.banner()}
  <header class="page-head"><div><p class="eyebrow"><a href="#/company">Company shelf</a> / shared by Sagar &amp; Bhuvan</p><h1>Budget</h1></div>
    <div class="row">${monthNav()}<label class="btn">${X.ic('upload', 16)} Upload bill<input type="file" accept="application/pdf,image/*" data-change="budUpload" hidden></label><button class="btn primary" data-act="budAdd">${X.ic('plus')} Add expense</button></div></header>
  <div class="chips bud-tabs">${tabs.map(([k, l]) => `<button class="chip ${t === k ? 'active' : ''}" data-act="budTab" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="bud-drop" data-drop="bill"><span>${X.ic('upload', 16)} Drop a bill here (PDF or photo) — the details fill in by themselves</span></div>
  ${body}`;
}

export function budgetShelfCard() {
  const m = thisMonth();
  const ob = owesLine(balances());
  return `<a class="shelf-card" href="#/budget">
      <span class="shelf-ic">${X.ic('wallet', 22)}</span>
      <span class="grow"><b>Budget</b><small>Company expenses, bills and who paid</small>
        <span class="shelf-stats"><span><b>${money(sum(inMonth(m)))}</b> this month</span><span><b>${money(renewals().reduce((t, e) => t + (+e.inr || 0) / PERIOD_MONTHS[e.recurring], 0))}</b> subscriptions / mo</span></span>
        <small>${X.esc(ob.text)}</small></span>${X.ic('arrowR', 18)}</a>`;
}

/* ---------- add / edit ---------- */
function expenseForm(e) {
  return `
    ${e.scanNote ? `<p class="scan-note">${X.esc(e.scanNote)}</p>` : ''}
    <div class="form-grid">
      ${X.field('Vendor / paid to', `<input class="input" name="vendor" value="${X.esc(e.vendor || '')}" required placeholder="e.g. OpenAI">`)}
      ${X.field('What for (optional)', `<input class="input" name="title" value="${X.esc(e.title || '')}" placeholder="e.g. ChatGPT Plus">`)}
      ${X.field('Date', `<input class="input" type="date" name="date" value="${X.esc(e.date || X.today())}" required>`)}
      ${X.field('Category', `<select class="input" name="category">${X.opts(cats().map((c) => c.name), e.category || cats()[0].name)}</select>`)}
      ${X.field('Amount', `<input class="input" type="number" step="0.01" min="0" name="amount" value="${e.amount ?? ''}" required>`)}
      ${X.field('Currency', `<select class="input" name="currency" data-change="budCur">${X.opts(CURRENCIES, e.currency || 'INR')}</select>`)}
      ${X.field('Rate to ₹ (auto)', `<input class="input" type="number" step="0.0001" min="0" name="fx" value="${e.fx ?? (e.currency && e.currency !== 'INR' ? '' : 1)}" placeholder="fills in by itself">`)}
      ${X.field('Repeats', `<select class="input" name="recurring">${X.opts(PERIODS, e.recurring || '')}</select>`)}
      ${X.field('Paid by', `<select class="input" name="paidBy">${X.opts([['sagar', 'Sagar'], ['bhuvan', 'Bhuvan'], ['company', 'Company account']], e.paidBy || X.ME())}</select>`)}
      ${X.field("Sagar's share %", `<input class="input" type="number" min="0" max="100" name="shareSagar" value="${e.shareSagar ?? 50}">`)}
    </div>
    ${X.field('Notes', `<textarea class="input" name="notes" rows="2">${X.esc(e.notes || '')}</textarea>`)}
    <div class="field"><span>Invoices / bills</span><div class="inv-list" id="invList">${invListHTML()}</div>
      <label class="btn sm inv-attach">📎 Attach invoice<input type="file" multiple accept="application/pdf,image/*" data-change="budAttach" hidden></label></div>
    ${e.id ? `<div class="row"><button type="button" class="btn sm ghost" data-act="budDelete" data-id="${e.id}">${X.ic('trash', 14)} Delete expense</button></div>` : ''}`;
}

// The invoices in the open form: saved ones (minus any removed) plus ones attached but not saved yet.
function invListHTML() {
  const d = budgetUI.draft || {};
  const saved = filesOf(d).filter((f) => !d.removed?.includes(f.id));
  const rows = saved.map((f) => `<span class="inv-chip">📄 ${X.esc(f.name)}${f.size ? ` <small class="muted">${kb(f.size)}</small>` : ''}<button type="button" class="icon-btn" data-act="budFileRm" data-fid="${f.id}" aria-label="Remove ${X.esc(f.name)}">${X.ic('x', 13)}</button></span>`)
    .concat((d.pending || []).map((p) => `<span class="inv-chip new">📄 ${X.esc(p.stored.name)} <small class="muted">${kb(p.stored.data.length * 0.75)} · new</small><button type="button" class="icon-btn" data-act="budFileRm" data-pk="${p.key}" aria-label="Remove ${X.esc(p.stored.name)}">${X.ic('x', 13)}</button></span>`));
  return rows.length ? rows.join('') : '<span class="muted small">No invoice attached. Attach a PDF or photo — it is saved with this expense.</span>';
}
const refreshInv = () => { const el = document.querySelector('#invList'); if (el) el.innerHTML = invListHTML(); };

async function fxRate(cur, date) {
  if (!cur || cur === 'INR') return 1;
  // The rate on the bill's date (ECB reference rates), else today's rate from a second source.
  const urls = [date && date <= X.today() ? `https://api.frankfurter.dev/v1/${date}?base=${cur}&symbols=INR` : null, `https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=INR`, `https://open.er-api.com/v6/latest/${cur}`];
  for (const u of urls.filter(Boolean)) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j = await r.json(); if (j.rates?.INR) return j.rates.INR; }
    } catch {}
  }
  return null;
}

export function openExpense(e0 = {}) {
  const { pendingFile, ...rest } = e0;
  const e = { ...rest, pending: rest.pending || (pendingFile ? [{ key: X.S.uid(), stored: pendingFile }] : []), removed: rest.removed || [] };
  budgetUI.draft = e;
  X.openModal(e.id ? 'Edit expense' : e.source === 'bill' ? 'Check the bill details' : 'Add expense', expenseForm(e), async (v) => {
    const amount = +v.amount;
    if (!+v.fx && v.currency !== 'INR') X.toast(`Fetching the ${v.currency} rate…`);
    let fx = +v.fx || (v.currency === 'INR' ? 1 : await fxRate(v.currency, v.date));
    if (!fx) { X.toast(`Couldn't fetch the ${v.currency} rate — enter it by hand`); openExpense({ ...e, ...v }); return; }
    const rec = {
      ...(e.id ? X.S.get('expenses', e.id) : {}), id: e.id || undefined, vendor: v.vendor.trim(), title: v.title.trim() || null, date: v.date,
      category: v.category, amount, currency: v.currency, fx, inr: Math.round(amount * fx * 100) / 100, recurring: v.recurring || null,
      paidBy: v.paidBy, shareSagar: Math.min(100, Math.max(0, +v.shareSagar || 0)), notes: v.notes.trim() || null,
      fileId: null, fileName: null, source: e.source || 'manual', addedBy: e.addedBy || X.ME(),
    };
    if (!rec.id) delete rec.id;
    // Moved to another month: drop it from the old month's bucket so it is stored where it belongs.
    if (rec._b && rec._b !== X.S.bucketId('expenses', rec)) { X.S.remove('expenses', { ...rec }); delete rec._b; }
    const d = budgetUI.draft || e;
    const files = filesOf(e).filter((f) => !d.removed.includes(f.id));
    if (d.pending.length) X.toast(`Saving ${d.pending.length} invoice${d.pending.length > 1 ? 's' : ''}…`);
    let failed = 0;
    for (const p of d.pending) {
      try {
        const id = await X.S.putFile(X.S.uid(), { ...p.stored, expenseVendor: rec.vendor });
        files.push({ id, name: p.stored.name, type: p.stored.type, size: Math.round(p.stored.data.length * 0.75), addedAt: X.today() });
      } catch { failed++; }
    }
    for (const id of d.removed) await X.S.deleteFile(id).catch(() => {});
    rec.files = files;
    X.S.put('expenses', rec);
    if (failed) X.toast(`Saved, but ${failed} invoice${failed > 1 ? 's' : ''} could not be stored — try attaching again.`);
    budgetUI.month = rec.date.slice(0, 7);
    if (!failed) X.toast(`${e.id ? 'Expense updated' : `Added ${money(rec.inr)} to ${monthLabel(budgetUI.month)}`}${files.length ? ` · ${files.length} invoice${files.length > 1 ? 's' : ''} saved` : ''}`);
    X.render();
  }, e.id ? 'Save' : 'Add expense');
}

export async function handleBillFile(file) {
  if (!file) return;
  X.toast('Reading the bill…');
  try {
    const { fields, stored, note } = await scanBill(file, (msg) => X.toast(msg));
    const found = [fields.vendor && 'vendor', fields.amount != null && 'amount', fields.date && 'date'].filter(Boolean);
    const scanNote = `${found.length ? `Filled in from the bill: ${found.join(', ')}.` : "Couldn't read the details — please type them in."} Check them before saving.${note ? ' ' + note : ''}`;
    openExpense({ ...fields, category: cats().some((c) => c.name === fields.category) ? fields.category : '', source: 'bill', pendingFile: stored, scanNote });
  } catch (err) {
    X.toast(err.message);
  }
}

async function showBill(id, fid) {
  const e = X.S.get('expenses', id);
  const list = filesOf(e);
  if (!list.length) return;
  const cur = list.find((x) => x.id === fid) || list[0];
  X.toast('Opening the invoice…');
  const f = await X.S.getFile(cur.id).catch(() => null);
  if (!f) { X.toast('The invoice file is missing.'); return; }
  const dlg = document.querySelector('#modal');
  dlg.classList.add('sheet');
  dlg.innerHTML = `<div class="sheet-wrap"><header class="sheet-head"><b>${X.esc(e.vendor || 'Bill')}</b><span class="muted small">${X.fmtDate(e.date)} · ${money(e.inr)}</span><span class="spacer"></span>
    ${list.length > 1 ? `<span class="chips">${list.map((x, i) => `<button class="chip ${x.id === cur.id ? 'active' : ''}" data-act="budBill" data-id="${e.id}" data-fid="${x.id}" title="${X.esc(x.name)}">${i + 1}</button>`).join('')}</span>` : ''}
    <a class="btn sm" href="${f.data}" download="${X.esc(f.name || 'bill')}">${X.ic('download', 14)} Download</a><button class="icon-btn" data-act="closeModal" aria-label="Close">${X.ic('x')}</button></header>
    <div class="bill-view">${/pdf/.test(f.type) ? `<iframe src="${f.data}" title="Bill"></iframe>` : `<img src="${f.data}" alt="Bill">`}</div></div>`;
  if (!dlg.open) dlg.showModal();
}

function csv() {
  const m = budgetUI.month;
  const xs = (budgetUI.listAll ? spends() : inMonth(m)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows = [['date', 'vendor', 'what', 'category', 'amount', 'currency', 'inr', 'paid_by', 'sagar_share_pct', 'repeats', 'notes'],
    ...xs.map((e) => [e.date, e.vendor, e.title, e.category, e.amount, e.currency, e.inr, payerName(e.paidBy), e.shareSagar ?? 50, e.recurring, e.notes])];
  const text = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  X.download(`company-expenses-${budgetUI.listAll ? 'all' : m}.csv`, new Blob([text], { type: 'text/csv' }));
}

function saveCats(next) { X.S.put('csettings', { ...settings(), id: 'budget', categories: next }); }

/* ---------- handlers merged into app.js ---------- */
export const BUDGET_ACTS = {
  budTab: (el) => { budgetUI.tab = el.dataset.v; X.render(); },
  budMonth: (el) => { budgetUI.month = addMonths(budgetUI.month, +el.dataset.v); X.render(); },
  budMonthNow: () => { budgetUI.month = thisMonth(); X.render(); },
  budPick: (el) => { budgetUI.month = el.dataset.v; budgetUI.tab = budgetUI.tab === 'who' ? 'list' : budgetUI.tab; X.render(); },
  budAdd: () => openExpense({ date: budgetUI.month === X.today().slice(0, 7) ? X.today() : budgetUI.month + '-01' }),
  budEdit: (el) => { const e = X.S.get('expenses', el.dataset.id); if (e) openExpense({ ...e }); },
  budDelete: async (el) => {
    const e = X.S.get('expenses', el.dataset.id);
    if (!e || !confirm(`Delete ${e.vendor || 'this expense'} (${money(e.inr)})?`)) return;
    X.closeModal();
    for (const f of filesOf(e)) await X.S.deleteFile(f.id).catch(() => {});
    X.S.remove('expenses', e);
    X.toast('Expense deleted');
  },
  budBill: (el) => showBill(el.dataset.id, el.dataset.fid),
  budDl: async (el) => {
    const f = await X.S.getFile(el.dataset.fid).catch(() => null);
    if (!f) { X.toast('The invoice file is missing.'); return; }
    X.download(f.name || 'invoice', await (await fetch(f.data)).blob());
  },
  budFileRm: (el) => {
    const d = budgetUI.draft;
    if (!d) return;
    if (el.dataset.pk) d.pending = d.pending.filter((p) => p.key !== el.dataset.pk);
    else if (confirm('Remove this invoice from the expense? It is deleted when you press Save.')) d.removed.push(el.dataset.fid);
    refreshInv();
  },
  budCsv: () => csv(),
  budSettle: () => {
    const ob = owesLine(balances());
    X.openModal('Record a settlement', `
      <div class="form-grid">
        ${X.field('Who paid', `<select class="input" name="from">${X.opts([['sagar', 'Sagar'], ['bhuvan', 'Bhuvan']], ob.from || 'bhuvan')}</select>`)}
        ${X.field('To whom', `<select class="input" name="to">${X.opts([['sagar', 'Sagar'], ['bhuvan', 'Bhuvan']], ob.to || 'sagar')}</select>`)}
        ${X.field('Amount ₹', `<input class="input" type="number" min="1" step="0.01" name="amount" value="${Math.round(ob.amt) || ''}" required>`)}
        ${X.field('Date', `<input class="input" type="date" name="date" value="${X.today()}">`)}
      </div>${X.field('Note', `<input class="input" name="notes" placeholder="e.g. UPI">`)}`,
    (v) => {
      if (v.from === v.to) { X.toast('Pick two different people'); return; }
      X.S.put('expenses', { kind: 'settlement', from: v.from, to: v.to, inr: +v.amount, amount: +v.amount, currency: 'INR', date: v.date, notes: v.notes.trim() || null, addedBy: X.ME() });
      X.toast('Settlement recorded');
    }, 'Record');
  },
  budDelSettle: (el) => { const t = X.S.get('expenses', el.dataset.id); if (t && confirm('Remove this settlement?')) X.S.remove('expenses', t); },
  budCatDel: (el) => {
    const cs = cats(), c = cs[+el.dataset.i];
    const used = spends().filter((e) => (e.category || 'Other') === c.name);
    if (!confirm(used.length ? `${used.length} expense(s) use "${c.name}". They will move to "${cs.find((x) => x !== c).name}". Delete the category?` : `Delete "${c.name}"?`)) return;
    const to = cs.find((x) => x !== c).name;
    if (used.length) X.S.putMany('expenses', used.map((e) => ({ ...e, category: to })));
    saveCats(cs.filter((x) => x !== c));
  },
  budRecurring: () => {
    const m = budgetUI.month;
    const due = renewals().filter((e) => e.recurring === 'monthly' && e.next.slice(0, 7) <= m && !inMonth(m).some((x) => (x.vendor || '').toLowerCase() === (e.vendor || '').toLowerCase()));
    if (!due.length) { X.toast(`Every monthly subscription is already logged for ${monthLabel(m)}`); return; }
    if (!confirm(`Add ${due.length} monthly subscription(s) to ${monthLabel(m)} with last time's amount?\n\n${due.map((e) => `• ${e.vendor} — ${money(e.inr)} (${payerName(e.paidBy)})`).join('\n')}`)) return;
    X.S.putMany('expenses', due.map(({ id, _b, createdAt, updatedAt, fileId, fileName, files, next, ...e }) => ({ ...e, date: `${m}-${e.date.slice(8, 10)}`.replace(/-(3[01]|29)$/, '-28'), source: 'repeat', addedBy: X.ME() })));
    X.toast(`Logged ${due.length} subscription(s)`);
  },
};
export const BUDGET_FORMS = {
  budCatAdd: (f) => {
    const name = new FormData(f).get('name').trim();
    if (!name) return;
    if (cats().some((c) => c.name.toLowerCase() === name.toLowerCase())) { X.toast('That category exists'); return; }
    saveCats([...cats(), { name, color: PALETTE[cats().length % PALETTE.length], limit: 0 }]);
    X.toast(`Added "${name}"`);
  },
};
export const BUDGET_CHANGES = {
  budUpload: (el) => { handleBillFile(el.files?.[0]); el.value = ''; },
  // Invoices attached inside the form. If the form is still blank, the first one is read to fill it in.
  budAttach: async (el) => {
    const d = budgetUI.draft, f = el.form, picked = [...(el.files || [])];
    el.value = '';
    if (!d || !picked.length) return;
    const blank = f && !f.vendor.value.trim() && !f.amount.value && !filesOf(d).length && !d.pending.length;
    for (const [i, file] of picked.entries()) {
      try {
        X.toast(`Adding ${file.name}…`);
        if (i === 0 && blank) {
          const { fields, stored, note } = await scanBill(file, (m) => X.toast(m));
          d.pending.push({ key: X.S.uid(), stored });
          const set = (n, v) => { if (v != null && v !== '' && f[n]) f[n].value = v; };
          set('vendor', fields.vendor); set('amount', fields.amount); set('date', fields.date); set('recurring', fields.recurring);
          if (cats().some((c) => c.name === fields.category)) set('category', fields.category);
          if (fields.currency && fields.currency !== f.currency.value) { f.currency.value = fields.currency; f.currency.dispatchEvent(new Event('change', { bubbles: true })); }
          X.toast(fields.vendor || fields.amount ? 'Filled in from the invoice — check before saving.' : note || 'Invoice attached.');
        } else {
          const { stored, note } = await prepareFile(file);
          d.pending.push({ key: X.S.uid(), stored });
          X.toast(note || `Attached ${stored.name}`);
        }
      } catch (err) { X.toast(err.message); }
      refreshInv();
    }
  },
  budCat: (el) => { budgetUI.cat = el.value; X.render(); },
  budWho: (el) => { budgetUI.who = el.value; X.render(); },
  budAll: (el) => { budgetUI.listAll = el.checked; X.render(); },
  budCur: async (el) => {
    const f = el.form, fx = f?.querySelector('[name=fx]');
    if (!fx) return;
    if (el.value === 'INR') { fx.value = 1; return; }
    fx.value = '';
    fx.placeholder = 'fetching…';
    const r = await fxRate(el.value, f.querySelector('[name=date]')?.value);
    fx.placeholder = 'enter rate';
    if (r) fx.value = r.toFixed(4);
  },
  budCatColor: (el) => { const cs = cats().map((c) => ({ ...c })); cs[+el.dataset.i].color = el.value; saveCats(cs); },
  budCatLimit: (el) => { const cs = cats().map((c) => ({ ...c })); cs[+el.dataset.i].limit = Math.max(0, +el.value || 0); saveCats(cs); },
  budCatName: (el) => {
    const cs = cats().map((c) => ({ ...c }));
    const old = cs[+el.dataset.i].name, name = el.value.trim();
    if (!name || name === old) { el.value = old; return; }
    if (cs.some((c) => c.name.toLowerCase() === name.toLowerCase())) { X.toast('That category exists'); el.value = old; return; }
    cs[+el.dataset.i].name = name;
    const used = spends().filter((e) => (e.category || 'Other') === old);
    if (used.length) X.S.putMany('expenses', used.map((e) => ({ ...e, category: name })));
    saveCats(cs);
  },
};
export const BUDGET_INPUTS = {
  budQ: (el) => { budgetUI.q = el.value; const w = document.querySelector('#view'); const pos = el.selectionStart; X.render(); const n = w.querySelector('[data-input=budQ]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } },
};

// Drag-and-drop a bill anywhere on the budget page.
export function wireDrop() {
  let depth = 0;
  document.addEventListener('dragenter', (e) => { if (!document.querySelector('[data-drop=bill]')) return; depth++; document.body.classList.add('dragging-bill'); e.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging-bill'); } });
  document.addEventListener('dragover', (e) => { if (document.querySelector('[data-drop=bill]')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!document.querySelector('[data-drop=bill]')) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging-bill');
    handleBillFile(e.dataTransfer?.files?.[0]);
  });
}
