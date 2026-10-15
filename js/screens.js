// Technical screens from Screener Studio (Sagar's PC). Results only, sent every weekday night by the Studio's
// playbook_push.py into the company space (collection 'screens', one item holding the snapshot as JSON).
// Read-only here: nothing on this page writes to Firestore.

let X; // helpers from app.js
export function initScreens(ctx) { X = ctx; }

export const scrUI = { tab: 'today', hold: '20', reg: null, days: 1, open: null, q: '', onlyGood: true };
const REGN = { up: 'Nifty 500 above its 200 EMA', all: 'all markets', down: 'Nifty 500 below its 200 EMA' };
const AUD = { pass: 'passed', fail: 'FAILED', partial: 'partly checked', skipped: 'not checked' };

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
const parseRow = (s) => { const [sym, date, close, chg, sector, n500, tv, stop] = s.split('|'); return { sym, date, close: +close, chg: +chg, sector, n500: n500 === '1', tv: +tv, stop: stop === 'None' ? null : +stop }; };
const pct = (n, d = 1) => (n == null || isNaN(n) ? '-' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`);
const num = (n) => (n == null ? '-' : Number(n).toLocaleString('en-IN'));
const reg = (s) => scrUI.reg || s.regime?.regime || 'all';

function stat(sc, r, hold) {
  const b = sc.bt?.[r];
  if (!b) return null;
  if (hold === 'trade') { const t = b.trade || {}; return { n: t.n, mean: t.mean, win: t.win, edge: null }; }
  const h = b.holds?.[hold] || {};
  return { n: h.n, mean: h.mean, median: h.median, win: h.win, edge: h.edge_median, beat: h.beat };
}
const good = (sc, r) => { const st = stat(sc, r, scrUI.hold === 'trade' ? '20' : scrUI.hold); return st && st.n >= 30 && st.edge > 0; };
function rowsOf(s, sc) {
  const keep = new Set(s.dates.slice(-scrUI.days));
  const q = scrUI.q.trim().toUpperCase();
  return sc.rows.map(parseRow).filter((x) => keep.has(x.date) && (!q || x.sym.includes(q)));
}
const auditTxt = (a) => (a ? `Look-ahead check ${AUD[a.truncation] || a.truncation}, prices vs NSE ${AUD[a.bhavcopy] || a.bhavcopy}` : 'Audit not run yet');
const auditOk = (a) => a && a.truncation === 'pass' && a.bhavcopy === 'pass';

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
      ${multi.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Screens</th><th>Sector</th><th class="r">Close</th><th class="r">Rs cr / day</th></tr></thead><tbody>
        ${multi.map((h) => `<tr><td><b>${X.esc(h.x.sym)}</b>${h.x.n500 ? ' <span class="tag">N500</span>' : ''}</td><td>${[...h.names].map(X.esc).join(', ')}</td><td>${X.esc(h.x.sector)}</td><td class="r tnum">${num(h.x.close)}</td><td class="r tnum">${num(h.x.tv)}</td></tr>`).join('')}
      </tbody></table></div>` : X.empty('No stock is on two of these screens in this window.')}
    </section>
    ${cats.map((c) => `<h2 class="section-title">${X.esc(c)}</h2><div class="scr-grid">${s.screens.filter((sc) => sc.cat === c).map((sc) => {
      const n = rowsOf(s, sc).length, st = stat(sc, r, scrUI.hold);
      return `<button class="card scr-card" data-act="scrOpen" data-v="${sc.id}">
        <b>${X.esc(sc.name)}</b><span class="scr-n">${n}</span><small class="muted">stocks</small>
        <small>${st && st.n ? `Past: ${num(st.n)} signals, avg ${pct(st.mean)}, win ${st.win}%${st.edge != null ? `, vs median stock <span class="${X.sign(st.edge)}">${pct(st.edge, 2)}</span>` : ''}` : 'Backtest pending'}</small>
        ${auditOk(sc.bt?.audit) ? '' : `<small class="bad">${auditTxt(sc.bt?.audit)}</small>`}</button>`;
    }).join('')}</div>`).join('')}`;
}

function viewAll(s) {
  const r = reg(s), hd = scrUI.hold === 'trade';
  return `<section class="card"><p class="muted small">Every screen tested on NSE stocks since 2014, delisted companies included. Buy at the NEXT day's close. Gross, no costs or tax.
    <b>vs median stock</b> = the screen's median return minus the median stock's return over the same days: the honest test of whether the pattern adds anything. Showing <b>${REGN[r]}</b>, <b>${hd ? 'swing exit (stop on a close, else 20 days)' : scrUI.hold + '-day hold'}</b>.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Screen</th><th class="r">Now</th><th class="r">Signals tested</th><th class="r">Avg</th><th class="r">Win %</th>${hd ? '' : '<th class="r">vs median stock</th><th class="r">Beat median %</th>'}<th>Audit</th></tr></thead><tbody>
    ${s.screens.map((sc) => { const st = stat(sc, r, scrUI.hold) || {}; return `<tr data-act="scrOpen" data-v="${sc.id}" class="clickable">
      <td><b>${X.esc(sc.name)}</b><div class="muted small">${X.esc(sc.cat)}</div></td><td class="r tnum">${rowsOf(s, sc).length}</td><td class="r tnum">${num(st.n)}</td>
      <td class="r tnum ${X.sign(st.mean)}">${pct(st.mean)}</td><td class="r tnum">${st.win ?? '-'}</td>
      ${hd ? '' : `<td class="r tnum ${X.sign(st.edge)}">${pct(st.edge, 2)}</td><td class="r tnum">${st.beat ?? '-'}</td>`}
      <td class="small ${auditOk(sc.bt?.audit) ? 'good' : 'bad'}">${auditOk(sc.bt?.audit) ? 'passed' : auditTxt(sc.bt?.audit)}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}

function viewOne(s, sc) {
  const r = reg(s), rows = rowsOf(s, sc).sort((a, b) => b.date.localeCompare(a.date) || b.tv - a.tv);
  const row = (k) => { const st = stat(sc, k, scrUI.hold) || {}; return `<tr><td>${REGN[k]}</td><td class="r tnum">${num(st.n)}</td><td class="r tnum ${X.sign(st.mean)}">${pct(st.mean)}</td><td class="r tnum">${pct(st.median)}</td><td class="r tnum">${st.win ?? '-'}</td><td class="r tnum ${X.sign(st.edge)}">${pct(st.edge, 2)}</td><td class="r tnum">${st.beat ?? '-'}</td></tr>`; };
  return `<button class="btn" data-act="scrOpen" data-v="">← All screens</button>
    <section class="card"><div class="card-head"><h2>${X.esc(sc.name)}</h2><span class="muted small">${X.esc(sc.cat)}</span></div>
      <p class="small">${X.esc(sc.desc)}</p>
      <p class="small ${auditOk(sc.bt?.audit) ? 'good' : 'bad'}">Audit: ${auditTxt(sc.bt?.audit)}${sc.bt?.built ? ` (run ${X.esc(sc.bt.built)})` : ''}</p></section>
    <section class="card"><div class="card-head"><h2>Stocks · ${rows.length}</h2><span class="muted small">${scrUI.days === 1 ? 'last session' : `last ${scrUI.days} sessions`}</span></div>
      ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Signal day</th><th>Sector</th><th class="r">Close</th><th class="r">Since signal</th><th class="r">Rule's stop</th><th class="r">Rs cr / day</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td><b>${X.esc(x.sym)}</b>${x.n500 ? ' <span class="tag">N500</span>' : ''}</td><td>${X.fmtDate(x.date)}</td><td>${X.esc(x.sector)}</td><td class="r tnum">${num(x.close)}</td><td class="r tnum ${X.sign(x.chg)}">${pct(x.chg)}</td><td class="r tnum">${x.stop == null ? '-' : num(x.stop)}</td><td class="r tnum">${num(x.tv)}</td></tr>`).join('')}
      </tbody></table></div>` : X.empty('No stock on this screen in this window.')}</section>
    <section class="card"><div class="card-head"><h2>How it worked in each market</h2><span class="muted small">${scrUI.hold === 'trade' ? 'swing exit' : scrUI.hold + '-day hold'}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Market on the signal day</th><th class="r">Signals</th><th class="r">Avg</th><th class="r">Median</th><th class="r">Win %</th><th class="r">vs median stock</th><th class="r">Beat %</th></tr></thead>
      <tbody>${['up', 'all', 'down'].map(row).join('')}</tbody></table></div></section>`;
}

export function viewScreens() {
  const s = snap();
  const head = (sub) => `${X.banner()}<header class="page-head"><div><p class="eyebrow"><a href="#/company">Company shelf</a> / Screener Studio${sub}</p><h1>Technical screens</h1></div></header>`;
  if (!s) return `${head('')}<div class="card">${X.empty('No data yet. Sagar\'s PC sends it every weekday night after the screens refresh (about 9:35 PM).')}</div>`;
  const rg = s.regime || {}, sc = scrUI.open && s.screens.find((x) => x.id === scrUI.open);
  const tabs = [['today', 'Today'], ['all', 'All screens + backtests']];
  return `${head(` · prices to ${X.fmtDate(s.data_to)} · updated ${X.fmtDT(s.meta?.syncedAt)}`)}
    <div class="card scr-market ${rg.regime === 'up' ? 'good' : 'bad'}">Now: Nifty 500 ${rg.regime === 'up' ? 'ABOVE' : 'BELOW'} its 200 EMA (${pct(rg.gap_pct, 2)}, ${rg.sessions} sessions). Backtest numbers use ${REGN[reg(s)]}.</div>
    ${controls(s)}
    ${sc ? viewOne(s, sc) : `<div class="chips">${tabs.map(([k, l]) => `<button class="chip ${scrUI.tab === k ? 'active' : ''}" data-act="scrTab" data-v="${k}">${l}</button>`).join('')}</div>
      ${scrUI.tab === 'all' ? viewAll(s) : viewToday(s)}`}
    <p class="muted small">Research only, not a buy or sell call. Past results are gross (no costs, tax or dividends) and do not promise future returns.</p>`;
}

export function screensShelfCard() {
  const s = snap();
  const today = s ? s.screens.reduce((t, sc) => t + sc.rows.filter((r) => r.split('|')[1] === s.data_to).length, 0) : 0;
  return `<a class="shelf-card" href="#/screens">
      <span class="shelf-ic">${X.ic('search', 22)}</span>
      <span class="grow"><b>Technical screens</b><small>35 screens (breakouts, bases, EMA support, candles), each backtested in up and down markets</small>
        ${s ? `<span class="shelf-stats"><span><b>${today}</b> hits last session</span><span><b>${s.screens.length}</b> screens</span><span>Nifty 500 <b class="${s.regime?.regime === 'up' ? 'good' : 'bad'}">${s.regime?.regime === 'up' ? 'above' : 'below'}</b> 200 EMA</span></span><small>Prices to ${X.fmtDate(s.data_to)}</small>` : '<small>Arrives from Sagar\'s PC every weekday night.</small>'}
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
