// Technical screens: the whole Screener Studio (Sagar's PC) on Playbook, for Sagar and Bhuvan.
// Data: a small summary in the live sync (screens / 'screens'), the tracked list (screens / 'track'), and one
// compressed pack (zscreens_pack0..N, outside the live sync) loaded when this page opens. Requests made here
// (star, stop tracking, custom backtest) go into 'sreq'; the Studio on Sagar's PC does them within a minute while
// the PC is on and marks them done. Every stock name opens its TradingView chart.

let X; // helpers from app.js
export function initScreens(ctx) { X = ctx; }

export const scrUI = {
  tab: 'today', tf: 'D', hold: '20', reg: null, days: 1, open: null, q: '', onlyGood: true,
  filters: {}, scLead: false, noSurv: false, fopen: false, preset: null, run: {}, edit: null,
};
const REGN = { up: 'Nifty 500 above its 200 EMA', all: 'all markets', down: 'Nifty 500 below its 200 EMA' };
const AUD = { pass: 'passed', FAIL: 'FAILED', fail: 'FAILED', 'not checked': 'not checked' };
const EVN = { strong: 'strong evidence', moderate: 'moderate evidence', weak: 'weak evidence', practitioner: 'trader rule, untested', ours: 'our own rule', mixed: 'mixed evidence' };
const TFN = { D: 'daily', W: 'weekly', M: 'monthly' };
const UNIT = { D: 'session', W: 'week', M: 'month' };
const FMET = { mom_min: 'mom', vam_min: 'vam', resmom_min: 'resmom', smooth_max: 'fip', prox_min: 'prox', ind_min: 'ind_rs', sec_min: 'sec_rs', dip_min: 'ret5', calm_max: 'vol', spike_max: 'max21', vol_min: 'abvol', ext_max: 'ext50' };
const NUMS = new Set(['close', 'sig_close', 'chg_since', 'level', 'stop', 'tv_cr', 'age', 'mom', 'vam', 'resmom', 'fip', 'prox', 'ind_rs', 'sec_rs', 'ret5', 'vol', 'max21', 'abvol', 'ext50', 'sc_rs', 'bounce_rate', 'past_touches']);
const FLAGS = new Set(['n500', 'sc_ind_lead', 'sc_sec_lead', 'sc_leader']);

/* ---------------- data ---------------- */
const P = { stamp: null, data: null, loading: false, error: null, rows: new Map(), res: {} };
const summary = () => { const it = X.S.get('screens', 'screens'); try { return it?.json ? JSON.parse(it.json) : null; } catch { return null; } };
const trackView = () => { const it = X.S.get('screens', 'track'); try { return it?.json ? JSON.parse(it.json) : null; } catch { return null; } };
async function gunzipB64(b64) {
  const str = atob(b64), bin = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bin[i] = str.charCodeAt(i);
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
async function loadPack() {
  const it = X.S.get('screens', 'screens');
  if (!it?.stamp || P.loading || (P.stamp === it.stamp && P.data)) return;
  P.loading = true; P.error = null; X.render();
  try {
    const parts = [];
    for (let i = 0; i < (it.parts || 1); i++) {
      const d = await X.S.getDocData(`zscreens_pack${i}`);
      if (!d || d.stamp !== it.stamp) throw new Error('the copy is being replaced right now, open again in a minute');
      parts.push(d.b64);
    }
    P.data = JSON.parse(await gunzipB64(parts.join('')));
    P.stamp = it.stamp; P.rows = new Map();
  } catch (e) { P.error = e?.message || String(e); }
  P.loading = false; X.render();
}
function parseRow(s, cols) {
  if (P.rows.has(s)) return P.rows.get(s);
  const v = s.split('|'), r = {};
  (cols || P.data.cols).forEach((c, i) => {
    const x = v[i] ?? '';
    r[c] = NUMS.has(c) ? (x === '' ? null : +x) : FLAGS.has(c) ? x === '1' : x;
  });
  if (!cols) P.rows.set(s, r);
  return r;
}

/* ---------------- small helpers ---------------- */
const pct = (n, d = 1) => (n == null || isNaN(n) ? '-' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`);
const num = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('en-IN'));
const tvUrl = (s) => `https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(String(s).replace(/-/g, '_'))}`;
const tvLink = (s) => `<a href="${tvUrl(s)}" target="_blank" rel="noopener" title="Open the TradingView chart"><b>${X.esc(s)}</b></a>`;
const ev = (s) => (s ? ` <span class="tag ev-${s}">${EVN[s] || s}</span>` : '');
const reg = () => scrUI.reg || P.data?.regime?.regime || 'all';
const holdLabel = () => (scrUI.hold === 'trade' ? 'swing exit' : `${scrUI.hold}-day hold`);
const auditOk = (a) => a && a.truncation === 'pass' && a.bhavcopy === 'pass';
const auditTxt = (a) => (a ? `Look-ahead check ${AUD[a.truncation] || a.truncation}, prices vs NSE ${AUD[a.bhavcopy] || a.bhavcopy}` : 'Audit not run yet');
const tags = (r) => `${r.n500 ? ' <span class="tag">N500</span>' : ''}${r.sc_ind_lead ? ' <span class="tag good">ind lead</span>' : ''}${r.sc_sec_lead ? ' <span class="tag good">sec lead</span>' : ''}${r.surv ? ` <span class="tag bad">${X.esc(r.surv)}</span>` : ''}`;
const me = () => String(X.S.status.user || '').toLowerCase();
const screenOf = (id) => P.data.screens.find((s) => s.id === id);

function stat(id, r = reg(), hold = scrUI.hold, tf = scrUI.tf) {
  const b = P.data.bt?.[tf]?.[id]?.regimes?.[r];
  if (!b) return null;
  if (hold === 'trade') { const t = b.trade || {}; return { n: t.n, mean: t.mean, win: t.win, edge: null }; }
  const h = b.holds?.[hold] || {};
  return { n: h.n, mean: h.mean, median: h.median, win: h.win, edge: h.edge_median, beat: h.beat };
}
const good = (id) => { const st = stat(id, reg(), scrUI.hold === 'trade' ? '20' : scrUI.hold); return st && st.n >= 30 && st.edge > 0; };
const list = () => P.data.lists[scrUI.tf] || { dates: [], screens: {} };
function activeFilters() { const o = {}; for (const [k, v] of Object.entries(scrUI.filters)) if (v) o[k] = +v; return o; }
const nActive = () => Object.keys(activeFilters()).length + (scrUI.scLead ? 1 : 0) + (scrUI.noSurv ? 1 : 0);
function passes(r) {
  for (const [k, v] of Object.entries(activeFilters())) {
    if (k === 'market_up') { if (P.data.regime?.regime !== 'up') return false; continue; }
    if (k === 'liq_min') { if (!((r.tv_cr || 0) >= v)) return false; continue; }
    if (k === 'price_min') { if (!(r.close >= v)) return false; continue; }
    const x = r[FMET[k]];
    if (x == null) return false;
    if (k === 'dip_min') { if (!(x <= -Math.abs(v))) return false; continue; }
    if (['smooth_max', 'calm_max', 'spike_max', 'ext_max'].includes(k)) { if (!(x <= v)) return false; continue; }
    if (!(x >= v)) return false;
  }
  if (scrUI.scLead && !(r.sc_ind_lead || r.sc_sec_lead)) return false;
  if (scrUI.noSurv && r.surv) return false;
  const q = scrUI.q.trim().toUpperCase();
  return !q || r.symbol.includes(q);
}
function rowsRaw(id, days = scrUI.days) {
  const L = list(); const keep = new Set(L.dates.slice(-days));
  return (L.screens[id] || []).map((s) => parseRow(s)).filter((r) => keep.has(r.date));
}
const rowsOf = (id, days) => rowsRaw(id, days).filter(passes);

/* ---------------- tracking (stars) ---------------- */
const pendingReqs = () => X.S.all('sreq').filter((r) => !r.status).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
function trackedOpen() {
  const s = new Set((trackView()?.items || []).filter((i) => !i.closed_date).map((i) => i.symbol));
  for (const r of pendingReqs()) if (r.kind === 'star') s.add(r.symbol);
  return s;
}
const starBtn = (sym, src) => {
  const on = trackedOpen().has(sym);
  return `<button class="scr-star ${on ? 'on' : ''}" data-act="scrStar" data-v="${X.esc(sym)}" data-src='${X.esc(JSON.stringify(src || {}))}' title="${on ? 'Tracked: see the Tracked tab' : 'Track from today\'s close'}">★</button>`;
};
const emaBtn = (sym) => (P.data.ema?.[sym] ? ` <button class="scr-mini" data-act="scrEma" data-v="${X.esc(sym)}" title="How this stock behaves at each EMA">EMA</button>` : '');
const stockCell = (r, src) => `${starBtn(r.symbol, src)}${tvLink(r.symbol)}${tags(r)}${emaBtn(r.symbol)}`;

/* ---------------- controls ---------------- */
function seg(act, cur, opts) {
  return `<div class="seg">${opts.map(([v, l, dis]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="${act}" data-v="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
}
function controls() {
  const sc = scrUI.open && screenOf(scrUI.open);
  return `<div class="scr-controls">
    ${seg('scrTf', scrUI.tf, [['D', 'Daily'], ['W', 'Weekly', sc && !sc.tfs.includes('W')], ['M', 'Monthly', sc && !sc.tfs.includes('M')]])}
    ${seg('scrReg', reg(), [['up', 'Nifty 500 above 200 EMA'], ['all', 'All markets'], ['down', 'Nifty 500 below 200 EMA']])}
    ${seg('scrHold', scrUI.hold, [['5', '5 days'], ['10', '10'], ['20', '20'], ['60', '60'], ['trade', 'Swing exit']])}
    <input class="input scr-q" placeholder="Find a stock" value="${X.esc(scrUI.q)}" data-input="scrQ">
  </div>`;
}
function daysSeg() {
  const u = UNIT[scrUI.tf], opts = scrUI.tf === 'D' ? [1, 3, 5] : [1, 2, 3, 4];
  return seg('scrDays', scrUI.days, opts.map((d) => [d, d === 1 ? `Last ${u}` : `${d} ${u}s`]));
}
function filterPanel(note = '') {
  const f = scrUI.filters;
  return `<section class="card scr-fp"><div class="card-head"><h2>Filters <span class="muted small">${nActive()} on${note ? ' · ' + note : ''}</span></h2>
    <div class="row"><button class="btn sm ghost" data-act="scrFopen">${scrUI.fopen ? 'Hide' : 'Show'}</button><button class="btn sm ghost" data-act="scrFclear">Clear</button></div></div>
    ${scrUI.fopen ? `<div class="scr-fgrid">${P.data.filters.map((d) => `<label title="${X.esc(d.help)}"><span>${X.esc(d.label)}${d.strength ? ev(d.strength) : ''}</span><input class="input sm" inputmode="decimal" data-change="scrFilter" data-k="${d.key}" value="${f[d.key] || ''}" placeholder="off"></label>`).join('')}
      <label><span>Only Scorecard leading sector / industry</span><input type="checkbox" data-change="scrLead" ${scrUI.scLead ? 'checked' : ''}></label>
      <label><span>Hide stocks under NSE surveillance (ASM / GSM)</span><input type="checkbox" data-change="scrSurv" ${scrUI.noSurv ? 'checked' : ''}></label></div>
      <p class="muted small">Ranks are percentiles across liquid stocks (100 = best). Tap and hold a filter's name for what it means. Filters act on the lists at once; in a screen's page, "Run on Sagar's PC" backtests the screen WITH these filters.</p>` : ''}</section>`;
}
const stockTable = (rows, src, extra = {}) => `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Signal day</th><th class="r">Close then</th><th class="r">Now</th><th class="r">Since</th>${extra.ema ? '<th class="r">Bounce rate</th><th class="r">Past touches</th>' : ''}<th class="r">Level</th><th class="r">Stop</th><th class="r">Momentum rank</th><th class="r">% of 52w high</th><th class="r">Industry rank</th><th class="r">Rs cr / day</th><th>Sector</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td class="nowrap">${stockCell(r, src)}</td><td>${X.fmtDate(r.date)}</td><td class="r tnum">${num(r.sig_close)}</td><td class="r tnum">${num(r.close)}</td><td class="r tnum ${X.sign(r.chg_since)}">${pct(r.chg_since)}</td>${extra.ema ? `<td class="r tnum">${r.bounce_rate != null ? r.bounce_rate + '%' : '-'}</td><td class="r tnum">${r.past_touches ?? '-'}</td>` : ''}<td class="r tnum">${num(r.level)}</td><td class="r tnum">${num(r.stop)}</td><td class="r tnum">${r.mom ?? '-'}</td><td class="r tnum">${r.prox ?? '-'}</td><td class="r tnum">${r.ind_rs ?? '-'}</td><td class="r tnum">${num(r.tv_cr)}</td><td class="small">${X.esc(r.sector)}${r.industry ? `<div class="muted">${X.esc(r.industry)}</div>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;

/* ---------------- Today ---------------- */
function viewToday() {
  const tf = scrUI.tf, hk = scrUI.hold === 'trade' ? '20' : scrUI.hold;
  const scs = P.data.screens.filter((s) => s.id !== 'any_stock' && s.tfs.includes(tf));
  const by = {};
  for (const sc of scs) {
    if (scrUI.onlyGood && !good(sc.id)) continue;
    for (const r of rowsOf(sc.id)) if ((r.tv_cr || 0) >= 1) (by[r.symbol] ||= { r, names: new Set() }).names.add(sc.name);
  }
  const multi = Object.values(by).filter((h) => h.names.size >= 2).sort((a, b) => b.names.size - a.names.size || (b.r.tv_cr || 0) - (a.r.tv_cr || 0));
  const cats = [...new Set(scs.map((s) => s.cat))];
  return `${filterPanel()}
    <div class="scr-controls">${daysSeg()}<span class="muted small">${TFN[tf]} bars. Card numbers: ${REGN[reg()]}, ${holdLabel()}.${tf !== 'D' ? ` The current ${UNIT[tf]} may still be running.` : ''}</span></div>
    <section class="card"><div class="card-head"><h2>Stocks on 2 or more screens · ${multi.length}</h2></div>
      <label class="muted small"><input type="checkbox" data-change="scrGood" ${scrUI.onlyGood ? 'checked' : ''}> Count only screens that beat the median stock in ${REGN[reg()]} (${hk}-day hold). Stocks trading Rs 1 cr+ a day.</label>
      ${multi.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>Screens</th><th class="r">Close</th><th class="r">Momentum rank</th><th class="r">% of 52w high</th><th class="r">Industry rank</th><th class="r">Rs cr / day</th><th>Sector</th></tr></thead><tbody>
        ${multi.slice(0, 100).map((h) => `<tr><td class="nowrap">${stockCell(h.r, { screens: [...h.names], tf })}</td><td class="small">${[...h.names].map(X.esc).join(', ')}</td><td class="r tnum">${num(h.r.close)}</td><td class="r tnum">${h.r.mom ?? '-'}</td><td class="r tnum">${h.r.prox ?? '-'}</td><td class="r tnum">${h.r.ind_rs ?? '-'}</td><td class="r tnum">${num(h.r.tv_cr)}</td><td class="small">${X.esc(h.r.sector)}</td></tr>`).join('')}
      </tbody></table></div>` : X.empty('No stock is on two of these screens in this window.')}
    </section>
    ${cats.map((c) => `<h2 class="section-title">${X.esc(c)}</h2><div class="scr-grid">${scs.filter((s) => s.cat === c).map((sc) => {
      const n = rowsOf(sc.id).length, n0 = rowsRaw(sc.id).length, st = stat(sc.id);
      return `<button class="card scr-card" data-act="scrOpen" data-v="${sc.id}">
        <b>${X.esc(sc.name)}</b><span><span class="scr-n">${n}</span> <small class="muted">stocks${nActive() && n !== n0 ? ` (of ${n0} before filters)` : ''}</small></span>${ev(sc.strength)}
        <small>${st && st.n ? `Past: ${num(st.n)} signals, avg ${pct(st.mean)}, win ${st.win}%${st.edge != null ? `, vs median stock <span class="${X.sign(st.edge)}">${pct(st.edge, 2)}</span>` : ''}` : 'Backtest pending'}</small></button>`;
    }).join('')}</div>`).join('')}`;
}

/* ---------------- one screen ---------------- */
function btTables(b, title = '') {
  if (!b) return `<section class="card">${X.empty('Backtest not run yet.')}</section>`;
  const R = b.regimes, hk = scrUI.hold, r = R[reg()] || R.all;
  const rowM = (k) => { const x = hk === 'trade' ? R[k].trade : R[k].holds[hk]; return `<tr><td>${REGN[k]}</td><td class="r tnum">${num(x?.n)}</td><td class="r tnum ${X.sign(x?.mean)}">${pct(x?.mean)}</td><td class="r tnum">${hk === 'trade' ? '' : pct(x?.median)}</td><td class="r tnum">${x?.win ?? '-'}</td><td class="r tnum ${X.sign(x?.edge_median)}">${hk === 'trade' ? '' : pct(x?.edge_median, 2)}</td><td class="r tnum">${hk === 'trade' ? '' : x?.beat ?? '-'}</td></tr>`; };
  const t = r.trade || {}, a = b.audit || {};
  const sm = (x) => `<td class="r tnum">${num(x.n)}</td><td class="r tnum ${X.sign(x.mean)}">${pct(x.mean)}</td><td class="r tnum">${x.win ?? '-'}</td><td class="r tnum ${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</td>`;
  return `<section class="card"><div class="card-head"><h2>${title || 'How it worked in each market'}</h2><span class="muted small">${holdLabel()} · ${TFN[b.tf || 'D']} bars${Object.keys(b.filters || {}).length ? ' · with filters' : ''}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Market on the signal day</th><th class="r">Signals</th><th class="r">Avg</th><th class="r">Median</th><th class="r">Win %</th><th class="r">vs median stock</th><th class="r">Beat %</th></tr></thead>
      <tbody>${['up', 'all', 'down'].map(rowM).join('')}</tbody></table></div>
      <p class="muted small">Trading days since late 2014: Nifty 500 above its 200 EMA ${num(b.regime_days?.up)}, below ${num(b.regime_days?.down)}.</p></section>
    <section class="card"><div class="card-head"><h2>Every holding period</h2><span class="muted small">${REGN[reg()]}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Hold</th><th class="r">Signals</th><th class="r">Avg</th><th class="r">Median</th><th class="r">Win %</th><th class="r">vs median stock</th><th class="r">Beat %</th></tr></thead><tbody>
      ${['5', '10', '20', '60'].map((k) => { const x = r.holds[k] || {}; return `<tr><td>${k} days</td><td class="r tnum">${num(x.n)}</td><td class="r tnum ${X.sign(x.mean)}">${pct(x.mean)}</td><td class="r tnum">${pct(x.median)}</td><td class="r tnum">${x.win ?? '-'}</td><td class="r tnum ${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</td><td class="r tnum">${x.beat ?? '-'}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${t.n ? `<p class="small">Swing exit (sell at the close after the first close under the screen's stop, or 8% under the buy price when it has none; else after 20 days): ${num(t.n)} trades, average ${pct(t.mean)}, ${t.win}% won, average win ${pct(t.avg_win)}, average loss ${pct(t.avg_loss)}, ${t.stopped}% stopped out.</p>` : ''}</section>
    <section class="card"><div class="card-head"><h2>Is it stable?</h2><span class="muted small">20-day hold, all markets</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Part of the test</th><th class="r">Signals</th><th class="r">Avg</th><th class="r">Win %</th><th class="r">vs median stock</th></tr></thead><tbody>
      ${(b.halves || []).concat(b.thirds || []).map((x) => `<tr><td>${X.esc(x.label)}</td>${sm(x)}</tr>`).join('')}
      ${(b.years || []).map((x) => `<tr><td>${x.year} <span class="muted small">(${x.up_share ?? '-'}% in up market)</span></td>${sm(x)}</tr>`).join('')}
      ${(b.liq_range || []).map((x) => `<tr><td>Floor Rs ${x.liq_cr} cr a day</td><td class="r tnum">${num(x.n)}</td><td></td><td class="r tnum">${x.win ?? '-'}</td><td class="r tnum ${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</td></tr>`).join('')}
      </tbody></table></div><p class="muted small">An edge that holds in both halves, across liquidity thirds and most years is more believable than one that lives in one corner.</p></section>
    <section class="card"><div class="card-head"><h2>Audit</h2><span class="small ${auditOk(a) ? 'good' : 'bad'}">${auditTxt(a)}</span></div>
      <p class="small">Look-ahead: the whole rule${Object.keys(b.filters || {}).length ? ' with its filters' : ''} rebuilt on data cut at ${X.esc(a.cut || '')}: ${num(a.signals_before_cut)} signals before the cut, ${a.differences ?? '-'} different. Prices vs NSE bhavcopy on ${a.checked ?? '-'} random signal days: ${a.match ?? '-'} match.</p>
      <p class="muted small">${X.esc(a.survivorship || '')}. Not checked: ${(a.not_checked || []).map(X.esc).join('; ')}. Built ${X.esc(b.built || '')}, data to ${X.esc(b.data_to || '')}, liquidity floor Rs ${b.liq_cr ?? 5} cr a day, one signal per stock per 10 sessions.</p></section>`;
}
function settingsCard(sc) {
  const base = { ...sc.params, ...(sc.tf_defaults?.[scrUI.tf] || {}) };
  const cur = { ...base, ...(scrUI.edit?.id === sc.id ? scrUI.edit.params : {}) };
  const keys = Object.keys(sc.params);
  const isEma = sc.id === 'ema_support';
  const quick = (lab, p) => `<button class="btn sm ghost" data-act="scrQuick" data-v='${JSON.stringify(p)}'>${lab}</button>`;
  const run = scrUI.run[sc.id], req = run && X.S.get('sreq', run);
  return `<section class="card"><div class="card-head"><h2>Settings</h2><span class="muted small">Lengths in ${UNIT[scrUI.tf]}s</span></div>
    ${isEma ? `<div class="scr-controls"><span class="small">EMA:</span>${[10, 20, 21, 50, 100, 200].map((n) => quick(n, { ema: n })).join('')}</div>
      <div class="scr-controls"><span class="small">Trend presence:</span>${quick('Strict 90%', { presence: 90 })}${quick('Normal 80%', { presence: 80 })}${quick('Loose 60%', { presence: 60 })}</div>
      <div class="scr-controls">${quick('Only stocks that respect this EMA (60%+ past bounces)', { bounce_min: 60 })}${quick('Any stock', { bounce_min: 0 })}</div>
      <p class="muted small">Bounce rate: of the stock's past touches of this EMA (last ${cur.lookback} sessions, only finished ones), the share that rose ${cur.bounce_up}% within ${cur.bounce_bars} bars before closing ${cur.bounce_break}% under it. No study measures "respecting an EMA": this is our own measure, and the backtest shows whether it helped.</p>` : ''}
    ${keys.length ? `<div class="scr-params">${keys.map((k) => `<label><span>${X.esc(k.replace(/_/g, ' '))}</span><input class="input sm" inputmode="decimal" data-change="scrParam" data-k="${k}" value="${cur[k]}"></label>`).join('')}</div>` : '<p class="muted small">This screen has no settings; the filters still apply.</p>'}
    <div class="row"><button class="btn primary" data-act="scrRun">Run on Sagar's PC</button><button class="btn ghost" data-act="scrReset">Default</button></div>
    <p class="muted small">Runs these settings ${nActive() ? `and your ${Object.keys(activeFilters()).length} filter(s) ` : ''}on ${TFN[scrUI.tf]} bars with the full audit. Sagar's PC does it within a minute or two while it is on; the answer appears below.</p>
    ${req ? `<p class="small ${req.status === 'error' ? 'bad' : req.status === 'done' ? 'good' : ''}">${req.status === 'done' ? X.esc(req.note || 'Done') : req.status === 'error' ? 'Not run: ' + X.esc(req.note || '') : `Waiting for Sagar's PC (sent ${X.fmtDT(req.createdAt)})...`}</p>` : ''}
  </section>`;
}
function viewOne(sc) {
  const run = scrUI.run[sc.id], req = run && X.S.get('sreq', run);
  const res = req?.status === 'done' && req.result ? P.res[req.result] : null;
  if (req?.status === 'done' && req.result && !P.res[req.result] && !P.res['loading:' + req.result]) {
    P.res['loading:' + req.result] = 1;
    X.S.getDocData(req.result).then((d) => { if (d?.json) P.res[req.result] = JSON.parse(d.json); X.render(); });
  }
  const isEma = sc.id === 'ema_support';
  const rows = res ? res.rows.map((s) => parseRow(s, res.cols)).filter(passes) : rowsOf(sc.id);
  const src = { screen: sc.id, tf: scrUI.tf, params: res?.params };
  return `<button class="btn" data-act="scrOpen" data-v="">← All screens</button>
    <section class="card"><div class="card-head"><h2>${X.esc(sc.name)}</h2><span class="muted small">${X.esc(sc.cat)} · ${TFN[scrUI.tf]} bars${ev(sc.strength)}</span></div>
      <p class="small">${X.esc(sc.desc)}</p>
      ${sc.thesis ? `<p class="small"><b>Why it might work:</b> ${X.esc(sc.thesis)}</p><p class="muted small">Evidence: ${X.esc(sc.source)}</p>` : ''}</section>
    ${settingsCard(sc)}
    ${filterPanel()}
    <section class="card"><div class="card-head"><h2>Stocks · ${rows.length}</h2><span class="muted small">${res ? `your run (${res.n_rows} stocks, last ${res.tf === 'D' ? '10 sessions' : '4 ' + UNIT[res.tf] + 's'})` : ''}</span></div>
      ${res ? '' : `<div class="scr-controls">${daysSeg()}</div>`}
      ${rows.length ? stockTable(rows, src, { ema: isEma }) : X.empty('No stock on this screen in this window.')}
      <p class="muted small">Tap a stock for its TradingView chart. ★ tracks it from today's close. EMA shows how it behaves at each EMA. Level = the price that matters for this rule; Stop = where the setup is wrong.</p></section>
    ${btTables(res ? res.bt : P.data.bt?.[scrUI.tf]?.[sc.id], res ? 'Your run: how it worked in each market' : '')}`;
}

/* ---------------- Presets ---------------- */
function viewPresets() {
  const ps = P.data.presets || [];
  const cell = (b, k, h) => { const x = b?.regimes?.[k]?.holds?.[h]; return x ? `<span class="${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</span> <span class="muted small">(${num(x.n)}, win ${x.win}%)</span>` : '-'; };
  const flab = (k) => (P.data.filters.find((f) => f.key === k) || { label: k }).label;
  if (scrUI.preset) {
    const p = ps.find((x) => x.id === scrUI.preset);
    if (p) {
      const rows = p.rows.map((s) => parseRow(s)).filter(passes);
      return `<button class="btn" data-act="scrPreset" data-v="">← All presets</button>
        <section class="card"><div class="card-head"><h2>${X.esc(p.name)}${ev(p.strength)}</h2></div><p class="small">${X.esc(p.thesis)}</p>
        <p class="muted small">Rule: ${X.esc(screenOf(p.screen)?.name || p.screen)} on ${TFN[p.tf]} bars; ${Object.entries(p.filters).map(([k, v]) => `${X.esc(flab(k))} ${v}`).join('; ')}${Object.keys(p.params).length ? `; settings ${X.esc(JSON.stringify(p.params))}` : ''}. Evidence: ${X.esc(p.evidence)}. Use: ${X.esc(p.use)}.</p></section>
        <section class="card"><div class="card-head"><h2>${p.screen === 'any_stock' ? 'Passing today' : 'Signals in the last 5 sessions'} · ${rows.length}</h2></div>${rows.length ? stockTable(rows, { preset: p.id }) : X.empty('None.')}</section>
        ${btTables(p.bt)}`;
    }
  }
  return `<p class="muted small">Ready-made screens picked from published research first, then tested on NSE since late 2014 (delisted included, Rs 5 cr+ a day, buy at the next close, gross). "vs median stock" = what the preset added over a typical stock in the same days. Each shows the settings next to its own, so you see the range, not the best case. Tap a preset for its full report and list.</p>
  ${ps.map((p) => {
    const rows = p.rows.map((s) => parseRow(s)).filter(passes);
    return `<section class="card"><div class="card-head"><h2><a href="javascript:void 0" data-act="scrPreset" data-v="${p.id}">${X.esc(p.name)}</a>${ev(p.strength)}</h2><span class="small ${auditOk(p.bt?.audit) ? 'good' : 'bad'}">${auditTxt(p.bt?.audit)}</span></div>
      <p class="small">${X.esc(p.thesis)}</p>
      <p class="muted small">${X.esc(screenOf(p.screen)?.name || p.screen)} on ${TFN[p.tf]} bars; ${Object.entries(p.filters).map(([k, v]) => `${X.esc(flab(k))} ${v}`).join('; ')}. Evidence: ${X.esc(p.evidence)}. Use: ${X.esc(p.use)}.</p>
      ${p.bt ? `<div class="table-wrap"><table class="table"><thead><tr><th>vs median stock</th><th class="r">20 days</th><th class="r">60 days</th></tr></thead><tbody>
        ${['up', 'all', 'down'].map((k) => `<tr><td>${REGN[k]}</td><td class="r tnum">${cell(p.bt, k, '20')}</td><td class="r tnum">${cell(p.bt, k, '60')}</td></tr>`).join('')}
        ${(p.bt.halves || []).concat(p.bt.thirds || []).map((x) => `<tr><td class="muted">${X.esc(x.label)} (20 days)</td><td class="r tnum ${X.sign(x.edge_median)}">${pct(x.edge_median, 2)}</td><td></td></tr>`).join('')}
        ${(p.range?.rows || []).map((x) => `<tr><td class="muted">${X.esc(flab(p.range.key))} ${x.value}${(p.filters[p.range.key] ?? p.params[p.range.key]) == x.value ? ' (this preset)' : ''}: up ${pct(x.up20, 2)}, down ${pct(x.down20, 2)}</td><td class="r tnum ${X.sign(x.edge20)}">${pct(x.edge20, 2)}</td><td class="r tnum ${X.sign(x.edge60)}">${pct(x.edge60, 2)}</td></tr>`).join('')}
      </tbody></table></div>` : X.empty('Backtest runs with the nightly refresh.')}
      <h3 class="small">${p.screen === 'any_stock' ? 'Passing today' : 'Signals in the last 5 sessions'} · ${rows.length}${rows.length > 25 ? ' (top 25 by momentum; tap the name for all)' : ''}</h3>
      ${rows.length ? stockTable(rows.slice(0, 25), { preset: p.id }) : X.empty('None.')}</section>`;
  }).join('')}`;
}

/* ---------------- Sectors ---------------- */
function viewSectors() {
  const x = P.data.sectors || {};
  const tbl = (rows, lab) => `<div class="table-wrap"><table class="table"><thead><tr><th>${lab}</th><th class="r">Rank</th><th class="r">Stocks</th><th class="r">1 month</th><th class="r">3 months</th><th class="r">6 months</th><th class="r">Above 50 EMA</th></tr></thead><tbody>
    ${rows.filter((r) => !scrUI.q || r.name.toUpperCase().includes(scrUI.q.toUpperCase())).map((r) => `<tr><td>${X.esc(r.name)}</td><td class="r tnum">${r.rank}</td><td class="r tnum">${r.n}</td><td class="r tnum ${X.sign(r.r1m)}">${pct(r.r1m)}</td><td class="r tnum ${X.sign(r.r3m)}">${pct(r.r3m)}</td><td class="r tnum ${X.sign(r.r6m)}">${pct(r.r6m)}</td><td class="r tnum">${r.above50}%</td></tr>`).join('')}</tbody></table></div>`;
  return `<p class="muted small">Median return of each group's liquid stocks (Rs 1 cr+ a day, at least 5 of them), ranked by 6 months (100 = strongest), as of ${X.fmtDate(x.date)}. The same numbers drive the industry and sector strength filters. "ind lead" / "sec lead" on a stock = its group is in the SectorScope Group Scorecard's leading quarter today.</p>
    <section class="card"><div class="card-head"><h2>Sectors</h2></div>${tbl(x.sector || [], 'Sector')}</section>
    <section class="card"><div class="card-head"><h2>Industries</h2></div>${tbl(x.industry || [], 'Industry')}</section>`;
}

/* ---------------- Tracked ---------------- */
function viewTracked() {
  const t = trackView() || {}, sm = t.summary;
  const q = scrUI.q.trim().toUpperCase();
  const items = (t.items || []).filter((i) => !q || i.symbol.includes(q));
  const reqs = pendingReqs().filter((r) => r.kind === 'star' || r.kind === 'close');
  const recent = X.S.all('sreq').filter((r) => (r.kind === 'star' || r.kind === 'close') && r.status).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
  const src = (s = {}) => (s.preset ? `Preset: ${X.esc(P.data.presets.find((p) => p.id === s.preset)?.name || s.preset)}` : s.screen ? X.esc(screenOf(s.screen)?.name || s.screen) + (s.tf && s.tf !== 'D' ? ` (${TFN[s.tf]})` : '') : s.screens ? X.esc([].concat(s.screens).join(', ')) : '');
  return `<p class="muted small">Tap ★ next to any stock. It counts as bought at the close of the day it was starred (on a weekend or holiday, the last close before) and is compared with Nifty 500 over the same days. "Stop" ends tracking at that day's close; nothing is deleted. Stars made here reach Sagar's PC within a minute while it is on; the day of the star is kept even if the PC was off. Prices ${t.market_open ? 'live from the market' : `to ${X.fmtDate(t.data_to)}`}.</p>
    ${reqs.length ? `<section class="card"><div class="card-head"><h2>Waiting for Sagar's PC · ${reqs.length}</h2></div>${reqs.map((r) => `<p class="small">${r.kind === 'star' ? '★ Track' : 'Stop tracking'} ${X.esc(r.symbol || '')} · sent ${X.fmtDT(r.createdAt)} by ${X.esc(r.by || '')}</p>`).join('')}</section>` : ''}
    ${sm ? `<section class="stats">${X.stat('Tracked', sm.n, `${sm.open} open`)}${X.stat('Average return', `<span class="${X.sign(sm.avg_ret)}">${pct(sm.avg_ret, 2)}</span>`, `won ${sm.win}%`)}${X.stat('vs Nifty 500', `<span class="${X.sign(sm.avg_vs_n500)}">${pct(sm.avg_vs_n500, 2)}</span>`, 'average, same days')}${X.stat('Best / worst', X.esc(sm.best), X.esc(sm.worst))}</section>` : ''}
    <section class="card">${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Stock</th><th>From</th><th>Starred</th><th class="r">Bought at</th><th class="r">Now</th><th class="r">Return</th><th class="r">Nifty 500</th><th class="r">vs Nifty 500</th><th class="r">Days</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map((i) => `<tr><td class="nowrap">${tvLink(i.symbol)}${emaBtn(i.symbol)}</td><td class="small">${src(i.source)}</td><td class="small">${X.esc(i.added_at)}${i.by ? ` · ${X.esc(i.by)}` : ''}</td><td class="r tnum">${num(i.entry)}<div class="muted small">${X.esc(i.entry_date || '')}</div></td><td class="r tnum">${num(i.now)}<div class="muted small">${X.esc(i.now_date || '')}</div></td><td class="r tnum ${X.sign(i.ret)}">${pct(i.ret, 2)}</td><td class="r tnum">${pct(i.n500_ret, 2)}</td><td class="r tnum ${X.sign(i.vs_n500)}">${pct(i.vs_n500, 2)}</td><td class="r tnum">${i.days ?? '-'}</td><td class="small">${X.esc(i.status)}</td><td>${i.closed_date ? '' : `<button class="btn sm ghost" data-act="scrStop" data-v="${i.id}" data-s="${X.esc(i.symbol)}">Stop</button>`}</td></tr>`).join('')}
    </tbody></table></div>` : X.empty('Nothing tracked yet. Tap ★ next to a stock in any list.')}</section>
    ${recent.length ? `<p class="muted small">Recent: ${recent.map((r) => `${X.esc(r.symbol || '')} ${r.status === 'error' ? 'not done (' + X.esc(r.note || '') + ')' : 'done'}`).join(' · ')}</p>` : ''}`;
}

/* ---------------- All screens ---------------- */
function viewAll() {
  const hd = scrUI.hold === 'trade', tf = scrUI.tf;
  const scs = P.data.screens.filter((s) => s.tfs.includes(tf));
  return `<section class="card"><p class="muted small">Every screen on <b>${TFN[tf]}</b> bars, tested from late 2014 on NSE company shares trading Rs 5 cr+ a day, delisted included. Buy at the NEXT day's close. Gross, no costs or tax. <b>vs median stock</b> = the screen's median return minus the median stock's over the same days. Showing <b>${REGN[reg()]}</b>, <b>${holdLabel()}</b>. Tap a row for the full report.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Screen</th><th class="r">Now</th><th class="r">Signals tested</th><th class="r">Avg</th><th class="r">Win %</th>${hd ? '' : '<th class="r">vs median stock</th><th class="r">Beat %</th>'}<th class="r">Up / down market</th><th>Audit</th></tr></thead><tbody>
    ${scs.map((sc) => { const st = stat(sc.id) || {}, u = stat(sc.id, 'up'), d = stat(sc.id, 'down'), a = P.data.bt?.[tf]?.[sc.id]?.audit; return `<tr data-act="scrOpen" data-v="${sc.id}" class="clickable">
      <td><b>${X.esc(sc.name)}</b><div class="muted small">${X.esc(sc.cat)}${sc.strength ? ` · ${EVN[sc.strength] || sc.strength}` : ''}</div></td><td class="r tnum">${sc.id === 'any_stock' ? '' : rowsRaw(sc.id, 1).length}</td><td class="r tnum">${num(st.n)}</td>
      <td class="r tnum ${X.sign(st.mean)}">${pct(st.mean)}</td><td class="r tnum">${st.win ?? '-'}</td>
      ${hd ? '' : `<td class="r tnum ${X.sign(st.edge)}">${pct(st.edge, 2)}</td><td class="r tnum">${st.beat ?? '-'}</td>`}
      <td class="r tnum">${u && d ? `${pct(hd ? u.mean : u.edge, hd ? 1 : 2)} / ${pct(hd ? d.mean : d.edge, hd ? 1 : 2)}` : '-'}</td>
      <td class="small ${auditOk(a) ? 'good' : 'bad'}">${auditOk(a) ? 'passed' : auditTxt(a)}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}

function viewHow() {
  return `<section class="card scr-how">
  <p><b>What a screen is.</b> One fixed rule run on every NSE company share. A stock appears on the bar the rule completes; you would act at the next day's close. Tap any stock for its TradingView chart.</p>
  <p><b>Daily, weekly, monthly.</b> The first switch runs every screen on that timeframe (a few chart patterns only on daily and weekly). Lengths in settings are in bars of that timeframe; fixed lengths inside the rules (52-week high, 200-day trend) are converted. The current week or month may still be running.</p>
  <p><b>Filters.</b> Evidence-based conditions for any screen: momentum rank (skipping the latest month), volatility-adjusted momentum (NSE's method), residual momentum, a smooth climb (frog in the pan), closeness to the 52-week high, industry and sector strength, a recent dip, low volatility, no lottery spikes, volume, not over-stretched, liquidity. Each shows how strong its published evidence is. They act on the lists at once; "Run on Sagar's PC" backtests a screen WITH them.</p>
  <p><b>Presets.</b> Ready-made combinations, each with a one-line thesis, the papers behind it, and its result at neighbouring settings, so you see the range rather than the best case.</p>
  <p><b>Tracked (★).</b> Starring counts as buying at that day's close; the return is followed against Nifty 500. Stars made here reach Sagar's PC within a minute while it is on.</p>
  <p><b>EMA.</b> In "EMA support bounce", buttons set the EMA and how strict the trend must be; the bounce rate shows how often a stock's past touches of that EMA worked. The EMA button next to a stock compares its behaviour at 10/20/21/50/100/200 EMAs with its own any-day baseline.</p>
  <p><b>Market switch.</b> Every past signal is tagged by the market that day: Nifty 500 above or below its 200-day EMA. It is a split, not a filter.</p>
  <p><b>Reading the numbers.</b> Average return and win % mislead on their own: in a rising market almost everything goes up. "vs median stock" takes away what the typical stock did over the same days. "Is it stable?" shows the two halves of the test, the liquidity thirds and each year.</p>
  <p><b>Audit.</b> Every result is rebuilt with data cut at 31 Dec 2021: if any past signal changes, the rule was peeking (FAIL). Random signal days are checked against NSE's bhavcopy prices. Costs, tax and dividends are not included. Sector and industry labels are today's, applied to the past.</p>
  <p class="muted">Research only, not a buy or sell call. Past results are gross and do not promise future returns.</p></section>`;
}

/* ---------------- EMA popup ---------------- */
function emaPopup(sym) {
  const e = P.data.ema?.[sym], ru = P.data.ema_rule || {};
  if (!e) return;
  const body = `<p class="small">A touch = the day's low within ${ru.tol}% of the EMA and the close holding on or above it. It <b>worked</b> if the stock then rose ${ru.up}% within ${ru.bars} sessions before closing ${ru.brk}% under the EMA. Baseline: on <b>any</b> day of the last 3 years ${X.esc(sym)} rose ${ru.up}% within ${ru.bars} sessions ${e.base}% of the time, so a rate well above ${e.base}% means it respects that EMA. Daily bars. Descriptive, not a forecast.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>EMA</th><th class="r">Worked, 3 yrs</th><th class="r">Touches</th><th class="r">Since 2014</th><th class="r">Touches</th><th>Last touch</th><th class="r">Price vs EMA</th><th class="r">Days above of 20</th><th>Rising</th></tr></thead><tbody>
    ${e.e.map(([n, r, c, ra, ca, lt, dist, ab, rising]) => `<tr><td>${n}</td><td class="r tnum ${r != null && e.base != null ? (r > e.base + 10 ? 'good' : r < e.base ? 'bad' : '') : ''}"><b>${r != null ? r + '%' : '-'}</b></td><td class="r tnum">${c}</td><td class="r tnum">${ra != null ? ra + '%' : '-'}</td><td class="r tnum">${ca}</td><td>${X.esc(lt || '-')}</td><td class="r tnum">${pct(dist)}</td><td class="r tnum">${ab ?? '-'}</td><td>${rising == null ? '-' : rising ? 'yes' : 'no'}</td></tr>`).join('')}
    </tbody></table></div><p><a href="${tvUrl(sym)}" target="_blank" rel="noopener">Open ${X.esc(sym)} on TradingView</a></p>`;
  X.openModal(`${sym}: how it behaves at each EMA`, body, () => X.closeModal(), 'Close');
}

/* ---------------- page ---------------- */
export function viewScreens() {
  const head = (sub) => `${X.banner()}<header class="page-head"><div><p class="eyebrow"><a href="#/company">Company shelf</a> / Screener Studio${sub}</p><h1>Technical screens</h1></div></header>`;
  const sm = summary();
  if (!sm) return `${head('')}<div class="card">${X.empty('No data yet. Sagar\'s PC sends it every weekday night after the screens refresh (about 9:45 PM).')}</div>`;
  if (!P.data || P.stamp !== X.S.get('screens', 'screens')?.stamp) {
    setTimeout(loadPack, 0);
    if (!P.data) return `${head('')}<div class="card">${P.error ? `<p class="bad">Could not load the screens: ${X.esc(P.error)}</p><button class="btn" data-act="scrReload">Try again</button>` : X.empty('Loading the screens (about 1.2 MB, once per visit)...')}</div>`;
  }
  const rg = P.data.regime || {}, sc = scrUI.open && screenOf(scrUI.open);
  const tabs = [['today', 'Today'], ['presets', 'Presets'], ['sectors', 'Sectors'], ['tracked', `Tracked ★`], ['all', 'All screens + backtests'], ['how', 'How to read this']];
  const body = sc ? viewOne(sc) : scrUI.tab === 'all' ? viewAll() : scrUI.tab === 'presets' ? viewPresets() : scrUI.tab === 'sectors' ? viewSectors() : scrUI.tab === 'tracked' ? viewTracked() : scrUI.tab === 'how' ? viewHow() : viewToday();
  return `${head(` · prices to ${X.fmtDate(P.data.data_to)} · updated ${X.fmtDT(X.S.get('screens', 'screens')?.syncedAt)}`)}
    <div class="card scr-market ${rg.regime === 'up' ? 'good' : 'bad'}">Now: Nifty 500 ${rg.regime === 'up' ? 'ABOVE' : 'BELOW'} its 200 EMA (${pct(rg.gap_pct, 2)}, ${rg.sessions} sessions). Backtest numbers use ${REGN[reg()]}.</div>
    ${controls()}
    ${sc ? '' : `<div class="chips">${tabs.map(([k, l]) => `<button class="chip ${scrUI.tab === k ? 'active' : ''}" data-act="scrTab" data-v="${k}">${l}</button>`).join('')}</div>`}
    ${body}
    <p class="muted small">Research only, not a buy or sell call. Past results are gross (no costs, tax or dividends) and do not promise future returns.</p>`;
}

export function screensShelfCard() {
  const s = summary(), t = trackView();
  return `<a class="shelf-card" href="#/screens">
      <span class="shelf-ic">${X.ic('search', 22)}</span>
      <span class="grow"><b>Technical screens</b><small>${s ? s.screens : 38} screens on daily, weekly and monthly bars, ${s?.presets || 10} research-based presets, filters, tracking</small>
        ${s ? `<span class="shelf-stats"><span><b>${s.today_hits}</b> hits last session</span><span><b>${t?.summary?.open ?? 0}</b> tracked</span><span>Nifty 500 <b class="${s.regime?.regime === 'up' ? 'good' : 'bad'}">${s.regime?.regime === 'up' ? 'above' : 'below'}</b> 200 EMA</span></span><small>Prices to ${X.fmtDate(s.data_to)}</small>` : '<small>Arrives from Sagar\'s PC every weekday night.</small>'}
      </span>${X.ic('arrowR', 18)}</a>`;
}

/* ---------------- actions ---------------- */
const keepFocus = (sel) => { const el = document.querySelector(sel); const pos = el?.selectionStart; X.render(); const n = document.querySelector(sel); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
function editParams(sc) { if (scrUI.edit?.id !== sc.id) scrUI.edit = { id: sc.id, params: {} }; return scrUI.edit.params; }
export const SCREENS_ACTS = {
  scrTab: (el) => { scrUI.tab = el.dataset.v; scrUI.preset = null; X.render(); },
  scrTf: (el) => { scrUI.tf = el.dataset.v; scrUI.days = 1; X.render(); },
  scrReg: (el) => { scrUI.reg = el.dataset.v; X.render(); },
  scrHold: (el) => { scrUI.hold = el.dataset.v; X.render(); },
  scrDays: (el) => { scrUI.days = +el.dataset.v; X.render(); },
  scrOpen: (el) => {
    scrUI.open = el.dataset.v || null;
    const sc = scrUI.open && screenOf(scrUI.open);
    if (sc && !sc.tfs.includes(scrUI.tf)) scrUI.tf = 'D';
    X.render(); window.scrollTo(0, 0);
  },
  scrPreset: (el) => { scrUI.preset = el.dataset.v || null; X.render(); window.scrollTo(0, 0); },
  scrFopen: () => { scrUI.fopen = !scrUI.fopen; X.render(); },
  scrFclear: () => { scrUI.filters = {}; scrUI.scLead = false; scrUI.noSurv = false; X.render(); },
  scrReload: () => { P.error = null; P.stamp = null; loadPack(); },
  scrEma: (el) => emaPopup(el.dataset.v),
  scrStar: (el) => {
    const sym = el.dataset.v;
    if (trackedOpen().has(sym)) { scrUI.open = null; scrUI.tab = 'tracked'; X.render(); return; }
    let src = {}; try { src = JSON.parse(el.dataset.src || '{}'); } catch {}
    X.S.put('sreq', { kind: 'star', symbol: sym, source: src, by: me() });
    X.toast(`★ ${sym}: tracked from today's close (reaches Sagar's PC within a minute while it is on)`);
    X.render();
  },
  scrStop: (el) => {
    const id = el.dataset.v, sym = el.dataset.s;
    X.openModal(`Stop tracking ${sym}?`, `<p class="small">Tracking ends at today's close. The record stays in the list.</p>`, () => {
      X.S.put('sreq', { kind: 'close', track_id: id, symbol: sym, by: me() });
      X.closeModal(); X.toast(`Stopping ${sym} at today's close`); X.render();
    }, 'Stop tracking');
  },
  scrQuick: (el) => {
    const sc = screenOf(scrUI.open); if (!sc) return;
    Object.assign(editParams(sc), JSON.parse(el.dataset.v)); SCREENS_ACTS.scrRun();
  },
  scrReset: () => { scrUI.edit = null; if (scrUI.open) delete scrUI.run[scrUI.open]; X.render(); },
  scrRun: () => {
    const sc = screenOf(scrUI.open); if (!sc) return;
    const params = { ...(scrUI.edit?.id === sc.id ? scrUI.edit.params : {}) };
    const it = X.S.put('sreq', { kind: 'bt', screen: sc.id, tf: scrUI.tf, params, filters: activeFilters(), by: me() });
    scrUI.run[sc.id] = it.id;
    X.toast('Sent to Sagar\'s PC. The answer appears on this page in a minute or two.');
    X.render();
  },
};
export const SCREENS_CHANGES = {
  scrGood: (el) => { scrUI.onlyGood = el.checked; X.render(); },
  scrLead: (el) => { scrUI.scLead = el.checked; X.render(); },
  scrSurv: (el) => { scrUI.noSurv = el.checked; X.render(); },
  scrFilter: (el) => { const v = parseFloat(el.value); if (isNaN(v) || !v) delete scrUI.filters[el.dataset.k]; else scrUI.filters[el.dataset.k] = v; X.render(); },
  scrParam: (el) => { const sc = screenOf(scrUI.open); if (!sc) return; const v = parseFloat(el.value); if (!isNaN(v)) editParams(sc)[el.dataset.k] = v; },
};
export const SCREENS_INPUTS = { scrQ: (el) => { scrUI.q = el.value; keepFocus('[data-input=scrQ]'); } };
