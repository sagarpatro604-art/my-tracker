// Technical screens from Screener Studio (Sagar's PC). Results only, sent every weekday night by the Studio's
// playbook_push.py into the company space (collection 'screens', one item holding the snapshot as JSON).
// Read-only here: nothing on this page writes to Firestore. Tracking (the star) is done in the Studio itself.

let X; // helpers from app.js
export function initScreens(ctx) { X = ctx; }

export const scrUI = { tab: 'today', hold: '20', reg: null, days: 1, open: null, q: '', onlyGood: true };
const REGN = { up: 'Nifty 500 above its 200 EMA', all: 'all markets', down: 'Nifty 500 below its 200 EMA' };
const AUD = { pass: 'passed', fail: 'FAILED', FAIL: 'FAILED', partial: 'partly checked', skipped: 'not checked' };
const EVN = { strong: 'strong evidence', moderate: 'moderate evidence', weak: 'weak evidence', practitioner: 'trader rule, untested', ours: 'our own rule', mixed: 'mixed evidence' };
const TFN = { D: 'daily', W: 'weekly', M: 'monthly' };

let cache = { raw: null, snap: null };
function snap() {
  const it = X.S.get('screens', 'screens');
  if (!it?.json) return null;
  if (cache.raw !== it.json) {
    try { cache = { raw: it.json, snap: JSON.parse(it.json) }; } catch { cache = { raw: it.json, snap: null }; }
    if (cache.snap) cache.snap.meta = { syncedAt: it.syncedAt };
  }
  return cache.snap;
}
const nz = (v) => (v === '' || v === undefined || v === 'None' ? null : +v);
const parseRow = (s) => {
  const [sym, date, close, chg, sector, n500, tv, stop, mom, prox, ind, lead, surv] = s.split('|');
  return { sym, date, close: +close, chg: +chg, sector, n500: n500 === '1', tv: +tv, stop: nz(stop), mom: nz(mom), prox: nz(prox), ind: nz(ind), lead: lead === '1', surv: surv || '' };
};
const pct = (n, d = 1) => (n == null || isNaN(n) ? '-' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`);
const num = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN'));
const reg = (s) => scrUI.reg || s.regime?.regime || 'all';
const ev = (s) => (s ? ` <span class="tag">${EVN[s] || s}</span>` : '');
const tags = (x) => `${x.n500 ? ' <span class="tag">N500</span>' : ''}${x.lead ? ' <span class="tag good">leading group</span>' : ''}${x.surv ? ` <span class="tag bad">${X.esc(x.surv)}</span>` : ''}`;

function stat(sc, r, hold) {
  const b = sc.bt?.[r];
  if (!b) return null;
  if (hold === 'trade') { const t = b.trade || {}; return { n: t.n, mean: t.mean, win: t.win, edge: null }; }
  const h = b.holds?.[hold] || {};
  return { n: h.n, mean: h.mean, median: h.median, win: h.win, edge: h.edge_median, beat: h.beat };
}
const good = (sc, r) => { const st = stat(sc, r, scrUI.hold === 'trade' ? '20' : scrUI.hold); return st && st.n >= 30 && st.edge > 0; };
const qOk = (x) => { const q = scrUI.q.trim().toUpperCase(); return !q || x.sym.includes(q); };
function rowsOf(s, sc) {
  const keep = new Set(s.dates.slice(-scrUI.days));
  return sc.rows.map(parseRow).filter((x) => keep.has(x.date) && qOk(x));
}
const auditTxt = (a) => (a ? `Look-ahead check ${AUD[a.truncation] || a.truncation}, prices vs NSE ${AUD[a.bhavcopy] || a.bhavcopy}` : 'Audit not run yet');
const auditOk = (a) => a && a.truncation === 'pass' && a.bhavcopy === 'pass';
const stockTable = (rows, extra = '') => `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Signal day</th><th>Sector</th><th class="r">Close</th><th class="r">Since signal</th><th class="r">Momentum rank</th><th class="r">% of 52w high</th><th class="r">Industry rank</th><th class="r">Rs cr / day</th>${extra}</tr></thead><tbody>
  ${rows.map((x) => `<tr><td><b>${X.esc(x.sym)}</b>${tags(x)}</td><td>${X.fmtDate(x.date)}</td><td>${X.esc(x.sector)}</td><td class="r tnum">${num(x.close)}</td><td class="r tnum ${X.sign(x.chg)}">${pct(x.chg)}</td><td class="r tnum">${x.mom ?? '-'}</td><td class="r tnum">${x.prox ?? '-'}</td><td class="r tnum">${x.ind ?? '-'}</td><td class="r tnum">${num(x.tv)}</td></tr>`).join('')}
  </tbody></table></div>`;

function controls(s) {
  const r = reg(s);
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="scr-controls">
    ${seg('scrReg', r, [['up', 'Nifty 500 above 200 EMA'], ['all', 'All markets'], ['down', 'Nifty 500 below 200 EMA']])}
    ${seg('scrHold', scrUI.hold, [['5', '5 days'], ['10', '10'], ['20', '20'], ['60', '60'], ['trade', 'Swing exit']])}
    ${seg('scrDays', scrUI.days, [[1, 'Today'], [3, 'Last 3 sessions'], [5, 'Last 5']])}
    <input class="input scr-q" placeholder="Find a stock" value="${X.esc(scrUI.q)}" data-input="scrQ">
  </div>`;
}

function viewToday(s) {
  const r = reg(s), hk = scrUI.hold === 'trade' ? '20' : scrUI.hold;
  const hits = {};
  for (const sc of s.screens) {
    if (scrUI.onlyGood && !good(sc, r)) continue;
    for (const x of rowsOf(s, sc)) if (x.tv >= 1) (hits[x.sym] ||= { x, names: new Set() }).names.add(sc.name);
  }
  const multi = Object.values(hits).filter((h) => h.names.size >= 2).sort((a, b) => b.names.size - a.names.size || b.x.tv - a.x.tv);
  const cats = [...new Set(s.screens.map((sc) => sc.cat))];
  return `<section class="card"><div class="card-head"><h2>Stocks on 2 or more screens · ${multi.length}</h2></div>
      <label class="muted small"><input type="checkbox" data-change="scrGood" ${scrUI.onlyGood ? 'checked' : ''}> Count only screens that beat the median stock in ${REGN[r]} (${hk}-day hold). Stocks trading at least Rs 1 cr a day, as on the Studio page.</label>
      ${multi.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Screens</th><th>Sector</th><th class="r">Close</th><th class="r">Momentum rank</th><th class="r">Rs cr / day</th></tr></thead><tbody>
        ${multi.map((h) => `<tr><td><b>${X.esc(h.x.sym)}</b>${tags(h.x)}</td><td>${[...h.names].map(X.esc).join(', ')}</td><td>${X.esc(h.x.sector)}</td><td class="r tnum">${num(h.x.close)}</td><td class="r tnum">${h.x.mom ?? '-'}</td><td class="r tnum">${num(h.x.tv)}</td></tr>`).join('')}
      </tbody></table></div>` : X.empty('No stock is on two of these screens in this window.')}
    </section>
    ${cats.map((c) => `<h2 class="section-title">${X.esc(c)}</h2><div class="scr-grid">${s.screens.filter((sc) => sc.cat === c).map((sc) => {
      const n = rowsOf(s, sc).length, st = stat(sc, r, scrUI.hold);
      return `<button class="card scr-card" data-act="scrOpen" data-v="${sc.id}">
        <b>${X.esc(sc.name)}</b><span class="scr-n">${n}</span><small class="muted">stocks${sc.strength ? ` · ${EVN[sc.strength] || sc.strength}` : ''}</small>
        <small>${st && st.n ? `Past: ${num(st.n)} signals, avg ${pct(st.mean)}, win ${st.win}%${st.edge != null ? `, vs median stock <span class="${X.sign(st.edge)}">${pct(st.edge, 2)}</span>` : ''}` : 'Backtest pending'}</small>
        ${auditOk(sc.bt?.audit) ? '' : `<small class="bad">${auditTxt(sc.bt?.audit)}</small>`}</button>`;
    }).join('')}</div>`).join('')}`;
}

function viewPresets(s) {
  const ps = s.presets || [];
  if (!ps.length) return `<section class="card">${X.empty('Presets arrive with the next nightly copy.')}</section>`;
  const cell = (e, k, h) => { const x = e?.[k]?.[h]; return x ? `<span class="${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</span> <span class="muted small">(${num(x.n)})</span>` : '-'; };
  return `<p class="muted small">Ready-made screens picked from published research first, then tested on NSE since late 2014 (delisted included, Rs 5 cr+ a day, buy at the next close, gross). "vs median stock" = what the preset added over a typical stock in the same days. Each shows the settings next to its own, so you see the range, not the best case.</p>
  ${ps.map((p) => {
    const rows = p.rows.map(parseRow).filter(qOk);
    return `<section class="card"><div class="card-head"><h2>${X.esc(p.name)}${ev(p.strength)}</h2><span class="small ${p.audit && p.audit[0] === 'pass' && p.audit[1] === 'pass' ? 'good' : 'bad'}">${p.audit ? `Audit: look-ahead ${AUD[p.audit[0]] || p.audit[0]}, prices ${AUD[p.audit[1]] || p.audit[1]}` : 'Audit pending'}</span></div>
      <p class="small">${X.esc(p.thesis)}</p>
      <p class="muted small">Evidence: ${X.esc(p.evidence)} · Use: ${X.esc(p.use)} · ${TFN[p.tf]} bars</p>
      ${p.edge ? `<div class="table-wrap"><table class="table"><thead><tr><th>vs median stock</th><th class="r">20 days</th><th class="r">60 days</th></tr></thead><tbody>
        <tr><td>Nifty 500 above 200 EMA</td><td class="r tnum">${cell(p.edge, 'up', '20')}</td><td class="r tnum">${cell(p.edge, 'up', '60')}</td></tr>
        <tr><td>All markets</td><td class="r tnum">${cell(p.edge, 'all', '20')}</td><td class="r tnum">${cell(p.edge, 'all', '60')}</td></tr>
        <tr><td>Nifty 500 below 200 EMA</td><td class="r tnum">${cell(p.edge, 'down', '20')}</td><td class="r tnum">${cell(p.edge, 'down', '60')}</td></tr>
        ${(p.halves || []).concat(p.thirds || []).map((x) => `<tr><td class="muted">${X.esc(x.label)} (20 days)</td><td class="r tnum ${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</td><td></td></tr>`).join('')}
        ${(p.range?.rows || []).map((x) => `<tr><td class="muted">Setting ${X.esc(p.range.key)} = ${x.value}${(p.filters[p.range.key] ?? p.params[p.range.key]) == x.value ? ' (this preset)' : ''}</td><td class="r tnum ${X.sign(x.edge20)}">${pct(x.edge20, 2)}</td><td class="r tnum ${X.sign(x.edge60)}">${pct(x.edge60, 2)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <h3 class="small">${p.screen === 'any_stock' ? 'Passing today' : 'Signals in the last 5 sessions'} · ${p.n_rows}${p.n_rows > rows.length && !scrUI.q ? ` (top ${rows.length} by momentum shown)` : ''}</h3>
      ${rows.length ? stockTable(rows) : X.empty('None.')}</section>`;
  }).join('')}`;
}

function viewSectors(s) {
  const x = s.sectors || {};
  const tbl = (rows, lab) => `<div class="table-wrap"><table class="table"><thead><tr><th>${lab}</th><th class="r">Rank</th><th class="r">1 month</th><th class="r">3 months</th><th class="r">6 months</th><th class="r">Above 50 EMA</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${X.esc(r.name)} <span class="muted small">${r.n}</span></td><td class="r tnum">${r.rank}</td><td class="r tnum ${X.sign(r.r1m)}">${pct(r.r1m)}</td><td class="r tnum ${X.sign(r.r3m)}">${pct(r.r3m)}</td><td class="r tnum ${X.sign(r.r6m)}">${pct(r.r6m)}</td><td class="r tnum">${r.above50}%</td></tr>`).join('')}</tbody></table></div>`;
  return `<p class="muted small">Median return of each group's liquid stocks, ranked by 6 months (100 = strongest), as of ${X.fmtDate(x.date)}. The same numbers drive the "industry strength" filter in the presets. Stocks marked "leading group" sit in a sector or industry in the SectorScope Group Scorecard's leading quarter.</p>
    <section class="card"><div class="card-head"><h2>Sectors</h2></div>${tbl(x.sector || [], 'Sector')}</section>
    <section class="card"><div class="card-head"><h2>Top 40 industries</h2></div>${tbl(x.industry || [], 'Industry')}</section>`;
}

function viewTracked(s) {
  const t = s.tracked || {}, sm = t.summary;
  const items = (t.items || []).filter((i) => !scrUI.q || i.symbol.includes(scrUI.q.trim().toUpperCase()));
  return `<p class="muted small">Stocks Sagar starred in the Screener Studio. Each counts as bought at the close of the day it was starred, and is compared with Nifty 500 over the same days. Prices to ${X.fmtDate(t.data_to)} (closing prices; the Studio itself shows live prices).</p>
    ${sm ? `<section class="stats">${X.stat('Tracked', sm.n, `${sm.open} open`)}${X.stat('Average return', `<span class="${X.sign(sm.avg_ret)}">${pct(sm.avg_ret, 2)}</span>`, `won ${sm.win}%`)}${X.stat('vs Nifty 500', `<span class="${X.sign(sm.avg_vs_n500)}">${pct(sm.avg_vs_n500, 2)}</span>`, 'average, same days')}${X.stat('Best / worst', X.esc(sm.best), X.esc(sm.worst))}</section>` : ''}
    <section class="card">${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Starred</th><th class="r">Bought at</th><th class="r">Now</th><th class="r">Return</th><th class="r">Nifty 500</th><th class="r">vs Nifty 500</th><th class="r">Days</th><th>Status</th></tr></thead><tbody>
      ${items.map((i) => `<tr><td><b>${X.esc(i.symbol)}</b></td><td>${X.esc(i.added_at)}</td><td class="r tnum">${num(i.entry)}</td><td class="r tnum">${num(i.now)}</td><td class="r tnum ${X.sign(i.ret)}">${pct(i.ret, 2)}</td><td class="r tnum">${pct(i.n500_ret, 2)}</td><td class="r tnum ${X.sign(i.vs_n500)}">${pct(i.vs_n500, 2)}</td><td class="r tnum">${i.days ?? '-'}</td><td class="small">${X.esc(i.status)}</td></tr>`).join('')}
    </tbody></table></div>` : X.empty('Nothing tracked yet. Sagar stars stocks in the Studio.')}</section>`;
}

function viewAll(s) {
  const r = reg(s), hd = scrUI.hold === 'trade';
  return `<section class="card"><p class="muted small">Every screen tested on NSE stocks since 2014, delisted companies included. Buy at the NEXT day's close. Gross, no costs or tax.
    <b>vs median stock</b> = the screen's median return minus the median stock's return over the same days: the honest test of whether the pattern adds anything. Showing <b>${REGN[r]}</b>, <b>${hd ? 'swing exit (stop on a close, else 20 days)' : scrUI.hold + '-day hold'}</b>.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Screen</th><th class="r">Now</th><th class="r">Signals tested</th><th class="r">Avg</th><th class="r">Win %</th>${hd ? '' : '<th class="r">vs median stock</th><th class="r">Beat median %</th>'}<th>Audit</th></tr></thead><tbody>
    ${s.screens.map((sc) => { const st = stat(sc, r, scrUI.hold) || {}; return `<tr data-act="scrOpen" data-v="${sc.id}" class="clickable">
      <td><b>${X.esc(sc.name)}</b><div class="muted small">${X.esc(sc.cat)}${sc.strength ? ` · ${EVN[sc.strength] || sc.strength}` : ''}</div></td><td class="r tnum">${rowsOf(s, sc).length}</td><td class="r tnum">${num(st.n)}</td>
      <td class="r tnum ${X.sign(st.mean)}">${pct(st.mean)}</td><td class="r tnum">${st.win ?? '-'}</td>
      ${hd ? '' : `<td class="r tnum ${X.sign(st.edge)}">${pct(st.edge, 2)}</td><td class="r tnum">${st.beat ?? '-'}</td>`}
      <td class="small ${auditOk(sc.bt?.audit) ? 'good' : 'bad'}">${auditOk(sc.bt?.audit) ? 'passed' : auditTxt(sc.bt?.audit)}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}

function viewOne(s, sc) {
  const rows = rowsOf(s, sc).sort((a, b) => b.date.localeCompare(a.date) || b.tv - a.tv);
  const row = (k) => { const st = stat(sc, k, scrUI.hold) || {}; return `<tr><td>${REGN[k]}</td><td class="r tnum">${num(st.n)}</td><td class="r tnum ${X.sign(st.mean)}">${pct(st.mean)}</td><td class="r tnum">${pct(st.median)}</td><td class="r tnum">${st.win ?? '-'}</td><td class="r tnum ${X.sign(st.edge)}">${pct(st.edge, 2)}</td><td class="r tnum">${st.beat ?? '-'}</td></tr>`; };
  return `<button class="btn" data-act="scrOpen" data-v="">← All screens</button>
    <section class="card"><div class="card-head"><h2>${X.esc(sc.name)}</h2><span class="muted small">${X.esc(sc.cat)}${sc.strength ? ` · ${EVN[sc.strength] || sc.strength}` : ''}</span></div>
      <p class="small">${X.esc(sc.desc)}</p>
      ${sc.thesis ? `<p class="small"><b>Why it might work:</b> ${X.esc(sc.thesis)}</p>` : ''}
      <p class="small ${auditOk(sc.bt?.audit) ? 'good' : 'bad'}">Audit: ${auditTxt(sc.bt?.audit)}${sc.bt?.built ? ` (run ${X.esc(sc.bt.built)})` : ''}</p></section>
    <section class="card"><div class="card-head"><h2>Stocks · ${rows.length}</h2><span class="muted small">${scrUI.days === 1 ? 'last session' : `last ${scrUI.days} sessions`}</span></div>
      ${rows.length ? stockTable(rows) : X.empty('No stock on this screen in this window.')}</section>
    <section class="card"><div class="card-head"><h2>How it worked in each market</h2><span class="muted small">${scrUI.hold === 'trade' ? 'swing exit' : scrUI.hold + '-day hold'}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Market on the signal day</th><th class="r">Signals</th><th class="r">Avg</th><th class="r">Median</th><th class="r">Win %</th><th class="r">vs median stock</th><th class="r">Beat %</th></tr></thead>
      <tbody>${['up', 'all', 'down'].map(row).join('')}</tbody></table></div></section>`;
}

export function viewScreens() {
  const s = snap();
  const head = (sub) => `${X.banner()}<header class="page-head"><div><p class="eyebrow"><a href="#/company">Company shelf</a> / Screener Studio${sub}</p><h1>Technical screens</h1></div></header>`;
  if (!s) return `${head('')}<div class="card">${X.empty('No data yet. Sagar\'s PC sends it every weekday night after the screens refresh (about 9:35 PM).')}</div>`;
  const rg = s.regime || {}, sc = scrUI.open && s.screens.find((x) => x.id === scrUI.open);
  const tabs = [['today', 'Today'], ['presets', 'Presets'], ['sectors', 'Sectors'], ['tracked', 'Tracked'], ['all', 'All screens + backtests']];
  const body = scrUI.tab === 'all' ? viewAll(s) : scrUI.tab === 'presets' ? viewPresets(s) : scrUI.tab === 'sectors' ? viewSectors(s) : scrUI.tab === 'tracked' ? viewTracked(s) : viewToday(s);
  return `${head(` · prices to ${X.fmtDate(s.data_to)} · updated ${X.fmtDT(s.meta?.syncedAt)}`)}
    <div class="card scr-market ${rg.regime === 'up' ? 'good' : 'bad'}">Now: Nifty 500 ${rg.regime === 'up' ? 'ABOVE' : 'BELOW'} its 200 EMA (${pct(rg.gap_pct, 2)}, ${rg.sessions} sessions). Backtest numbers use ${REGN[reg(s)]}.</div>
    ${controls(s)}
    ${sc ? viewOne(s, sc) : `<div class="chips">${tabs.map(([k, l]) => `<button class="chip ${scrUI.tab === k ? 'active' : ''}" data-act="scrTab" data-v="${k}">${l}</button>`).join('')}</div>${body}`}
    <p class="muted small">Research only, not a buy or sell call. Past results are gross (no costs, tax or dividends) and do not promise future returns.</p>`;
}

export function screensShelfCard() {
  const s = snap();
  const today = s ? s.screens.reduce((t, sc) => t + sc.rows.filter((r) => r.split('|')[1] === s.data_to).length, 0) : 0;
  return `<a class="shelf-card" href="#/screens">
      <span class="shelf-ic">${X.ic('search', 22)}</span>
      <span class="grow"><b>Technical screens</b><small>${s ? s.screens.length : 38} screens and ${s?.presets?.length || 10} research-based presets, each backtested in up and down markets</small>
        ${s ? `<span class="shelf-stats"><span><b>${today}</b> hits last session</span><span><b>${s.tracked?.summary?.open ?? 0}</b> tracked</span><span>Nifty 500 <b class="${s.regime?.regime === 'up' ? 'good' : 'bad'}">${s.regime?.regime === 'up' ? 'above' : 'below'}</b> 200 EMA</span></span><small>Prices to ${X.fmtDate(s.data_to)}</small>` : '<small>Arrives from Sagar\'s PC every weekday night.</small>'}
      </span>${X.ic('arrowR', 18)}</a>`;
}

const keepFocus = (sel) => { const el = document.querySelector(sel); const pos = el?.selectionStart; X.render(); const n = document.querySelector(sel); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
export const SCREENS_ACTS = {
  scrTab: (el) => { scrUI.tab = el.dataset.v; X.render(); },
  scrReg: (el) => { scrUI.reg = el.dataset.v; X.render(); },
  scrHold: (el) => { scrUI.hold = el.dataset.v; X.render(); },
  scrDays: (el) => { scrUI.days = +el.dataset.v; X.render(); },
  scrOpen: (el) => { scrUI.open = el.dataset.v || null; X.render(); window.scrollTo(0, 0); },
};
export const SCREENS_CHANGES = { scrGood: (el) => { scrUI.onlyGood = el.checked; X.render(); } };
export const SCREENS_INPUTS = { scrQ: (el) => { scrUI.q = el.value; keepFocus('[data-input=scrQ]'); } };
