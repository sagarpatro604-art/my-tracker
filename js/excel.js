// Excel import (your old Instagram_Content_Tracker.xlsx) and Excel export of everything.
const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const pad = (n) => String(n).padStart(2, '0');

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the Excel reader. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

const toYmd = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};
const toTime = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = +m[1];
  if (m[3]) {
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return `${pad(h)}:${m[2]}`;
};
const toNum = (v) => (typeof v === 'number' && isFinite(v) ? v : /^\s*\d+\s*$/.test(String(v ?? '')) ? +v : null);
const str = (v) => (v == null ? '' : String(v).trim());
const hash = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };

const IDEA_STATUS = {
  idea: 'Backlog', backlog: 'Backlog', missed: 'Backlog',
  'in-progress': 'In progress', 'script ready': 'In progress',
  shot: 'Ready', edited: 'Ready',
  scheduled: 'Scheduled',
  posted: 'Posted', used: 'Posted',
};
const ideaStatus = (s) => IDEA_STATUS[str(s).toLowerCase()] || 'Backlog';

// Sheets can claim a range of a million rows; shrink it to the cells that actually exist.
function trimRange(XLSX, ws) {
  let maxR = 0, maxC = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    if (ws[k].v != null && ws[k].v !== '') { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

function rowsOf(XLSX, wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  trimRange(XLSX, ws);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const hi = rows.findIndex((r) => r && r.some((c) => str(c) === 'S.No'));
  if (hi < 0) return [];
  const head = rows[hi].map(str);
  return rows.slice(hi + 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export async function parseTracker(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer());

  const reels = [];
  for (const r of rowsOf(XLSX, wb, 'Reels Performance')) {
    const date = toYmd(r['Date']);
    if (!date || str(r['Status']).toLowerCase() !== 'posted') continue;
    const url = str(r['Reel URL']);
    const sc = (url.match(/\/(?:p|reel|reels)\/([^/?#]+)/) || [])[1];
    reels.push({
      id: sc || `x-${date}`,
      date,
      time: toTime(r['Time (IST)']),
      contentType: str(r['Content Type']) || null,
      caption: str(r['Topic / Caption']),
      plays: toNum(r['Plays']),
      views: toNum(r['Views']),
      likes: toNum(r['Likes']),
      comments: toNum(r['Comments']),
      url: url || null,
      kind: 'reel',
      source: 'excel',
    });
  }

  const ideas = [];
  for (const r of rowsOf(XLSX, wb, 'Content Bank')) {
    const title = str(r['Idea / Hook']);
    if (!title) continue;
    ideas.push({
      id: 'cb' + hash(title),
      title,
      link: str(r['Reference Links']) || null,
      type: str(r['Content Type']) || null,
      priority: str(r['Priority']) || null,
      status: ideaStatus(r['Status']),
      planDate: toYmd(r['Date Used']),
      script: str(r['Script Draft']) || null,
    });
  }
  for (const r of rowsOf(XLSX, wb, 'Daily Content Plan')) {
    const title = str(r['Topic']);
    if (!title) continue;
    const date = toYmd(r['Date']);
    ideas.push({
      id: 'dp' + hash(title + date),
      title,
      type: str(r['Content Type']) || null,
      status: ideaStatus(r['Status']),
      planDate: date,
      planTime: toTime(r['Time']),
      script: str(r['Script']) || null,
      notes: str(r['Notes']) || null,
    });
  }
  return { reels, ideas };
}

export async function exportExcel(sheets, filename) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const data = rows.map(({ _b, ...rest }) => rest);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ empty: '' }]), name);
  }
  XLSX.writeFile(wb, filename);
}
