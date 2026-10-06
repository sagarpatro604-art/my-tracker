// Read a bill in the browser: PDF text (pdf.js), or OCR for photos and scanned PDFs (tesseract.js).
// Nothing is sent to any server. Returns the text, a best guess at the fields, and a compact copy to store.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const MAX_STORE = 900 * 1024; // stored as a data URL inside one Firestore document (limit 1 MB)

const loaded = {};
function script(src) {
  return (loaded[src] ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: () => reject(new Error('Could not load the bill reader. Check the internet connection.')) });
    document.head.appendChild(s);
  }));
}
const readAs = (file, how) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r[how](file);
});
const loadImg = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('This image could not be opened.')); i.src = src; });

function toJpeg(source, w, h, maxSide = 1600) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(source, 0, 0, c.width, c.height);
  let q = 0.78, url = c.toDataURL('image/jpeg', q);
  while (url.length > MAX_STORE && q > 0.35) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
  return { url, canvas: c };
}

async function pdfPages(file) {
  await script(PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}
async function renderPage(pdf, n = 1, scale = 2) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = vp.width;
  c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}
async function ocr(canvasOrUrl, onProgress) {
  await script(TESS);
  const r = await window.Tesseract.recognize(canvasOrUrl, 'eng', { logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(`Reading the bill… ${Math.round((m.progress || 0) * 100)}%`); } });
  return r.data.text || '';
}

export async function scanBill(file, onProgress = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error('Upload a PDF or a photo (JPG / PNG) of the bill.');
  let text = '', stored = null, note = '';
  if (isPdf) {
    onProgress('Opening the PDF…');
    const pdf = await pdfPages(file);
    for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
      const tc = await (await pdf.getPage(n)).getTextContent();
      text += tc.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    const raw = await readAs(file, 'readAsDataURL');
    if (raw.length <= MAX_STORE) stored = { data: raw, type: 'application/pdf', name: file.name };
    if (text.replace(/\s/g, '').length < 30 || !stored) {
      const c = await renderPage(pdf, 1);
      if (text.replace(/\s/g, '').length < 30) { onProgress('Scanned PDF — reading the text…'); text = await ocr(c, onProgress); }
      if (!stored) { stored = { data: toJpeg(c, c.width, c.height).url, type: 'image/jpeg', name: file.name.replace(/\.pdf$/i, '') + ' (page 1).jpg' }; note = 'The PDF was too big to keep whole, so a picture of page 1 was saved.'; }
    }
  } else {
    onProgress('Opening the photo…');
    const img = await loadImg(await readAs(file, 'readAsDataURL'));
    const { url, canvas } = toJpeg(img, img.naturalWidth, img.naturalHeight);
    stored = { data: url, type: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' };
    onProgress('Reading the bill…');
    text = await ocr(canvas, onProgress);
  }
  return { text, fields: parseBill(text), stored, note };
}

// Keep a file without reading it (extra invoices on an expense).
export async function prepareFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
  if (!isPdf && !isImg) throw new Error(`${file.name}: upload a PDF or a photo (JPG / PNG).`);
  if (isPdf) {
    const raw = await readAs(file, 'readAsDataURL');
    if (raw.length <= MAX_STORE) return { stored: { data: raw, type: 'application/pdf', name: file.name }, note: '' };
    const c = await renderPage(await pdfPages(file), 1);
    return { stored: { data: toJpeg(c, c.width, c.height).url, type: 'image/jpeg', name: file.name.replace(/\.pdf$/i, '') + ' (page 1).jpg' }, note: `${file.name} was too big to keep whole, so a picture of page 1 was saved.` };
  }
  const img = await loadImg(await readAs(file, 'readAsDataURL'));
  return { stored: { data: toJpeg(img, img.naturalWidth, img.naturalHeight).url, type: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' }, note: '' };
}

/* ---------- turning bill text into fields ---------- */
const VENDORS = [
  ['OpenAI', /openai|chatgpt/i], ['Anthropic (Claude)', /anthropic|claude\.ai|\bclaude\b/i], ['Google', /google (workspace|one|cloud|play)|g suite|gemini/i], ['YouTube', /youtube/i],
  ['Netflix', /netflix/i], ['Spotify', /spotify/i], ['Apple', /apple\.com|icloud|app store/i], ['Microsoft', /microsoft|office 365|onedrive|github copilot/i],
  ['Adobe', /adobe/i], ['Canva', /canva/i], ['Notion', /notion/i], ['Zoom', /zoom\.us|zoom video/i], ['Slack', /slack/i], ['Figma', /figma/i],
  ['GitHub', /github/i], ['Amazon Web Services', /amazon web services|\baws\b/i], ['Amazon', /amazon/i], ['Jio', /\bjio\b|reliance jio/i], ['Airtel', /airtel/i],
  ['TradingView', /tradingview/i], ['Upstox', /upstox/i], ['Zerodha', /zerodha|kite connect/i], ['Hostinger', /hostinger/i], ['GoDaddy', /godaddy/i],
  ['Cloudflare', /cloudflare/i], ['Apify', /apify/i], ['Perplexity', /perplexity/i], ['Midjourney', /midjourney/i], ['ElevenLabs', /elevenlabs/i],
  ['CapCut', /capcut/i], ['Envato', /envato/i], ['Screener', /screener\.in/i], ['Tijori', /tijori/i], ['Trendlyne', /trendlyne/i], ['Telegram', /telegram premium/i],
  ['LinkedIn', /linkedin/i], ['Meta', /facebook ads|meta platforms|instagram/i],
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => (y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

function findDates(t) {
  const out = [];
  const push = (v, at) => v && out.push({ v, at });
  let m;
  const re1 = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g; while ((m = re1.exec(t))) push(iso(+m[1], +m[2], +m[3]), m.index);
  const re2 = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g; while ((m = re2.exec(t))) push(iso(+m[3], +m[2], +m[1]) || iso(+m[3], +m[1], +m[2]), m.index); // Indian bills are day-first
  const re3 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g; while ((m = re3.exec(t))) push(iso(+m[3], MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]), m.index);
  const re4 = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g; while ((m = re4.exec(t))) push(iso(+m[3], MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]), m.index);
  return out.sort((a, b) => a.at - b.at);
}

const CUR = [['INR', /₹|\bRs\.?|\bINR\b/i], ['USD', /\$|\bUSD\b|US\$/i], ['EUR', /€|\bEUR\b/i], ['GBP', /£|\bGBP\b/i]];
function amountsIn(line) {
  const out = [];
  const re = /(₹|Rs\.?|INR|US\$|\$|USD|€|EUR|£|GBP)?\s?(\d{1,3}(?:[,\s]\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(INR|USD|EUR|GBP)?/gi;
  let m;
  while ((m = re.exec(line))) {
    const n = parseFloat(m[2].replace(/[,\s]/g, ''));
    if (!isFinite(n) || n <= 0 || n > 1e8) continue;
    const tag = (m[1] || m[3] || '').trim();
    const cur = CUR.find(([, r]) => r.test(tag))?.[0] || null;
    if (!cur && !/\.\d{2}\b/.test(m[2])) continue; // bare integers are usually ids, dates or quantities
    out.push({ n, cur });
  }
  return out;
}

export function parseBill(text) {
  const t = String(text || '').replace(/\r/g, '');
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const vendor = VENDORS.find(([, r]) => r.test(t))?.[0] || (lines.find((l) => /[A-Za-z]{3}/.test(l) && l.length < 60 && !/invoice|receipt|bill|tax|page|date/i.test(l)) || '').replace(/[^\w&.()\- ]/g, '').trim().slice(0, 50);
  // amount: prefer the line that says total / amount due / paid
  const keyRe = /grand total|total amount|amount due|amount paid|total due|net payable|total payable|balance due|amount charged|\btotal\b/i;
  let best = null;
  lines.forEach((l, i) => {
    if (!keyRe.test(l) || /sub\s?-?total|tax total|total tax|gst total/i.test(l)) return;
    const near = amountsIn(l).concat(i + 1 < lines.length && !amountsIn(l).length ? amountsIn(lines[i + 1]) : []);
    for (const a of near) if (!best || a.n > best.n) best = a;
  });
  if (!best) for (const l of lines) for (const a of amountsIn(l)) if (a.cur && (!best || a.n > best.n)) best = a;
  const currency = best?.cur || CUR.find(([, r]) => r.test(t))?.[0] || 'INR';
  // date: prefer one next to "invoice date / date of issue / paid on"
  const dates = findDates(t);
  const keyDate = /invoice date|date of issue|issue date|billing date|paid on|payment date|date paid|order date|\bdate\b/i;
  let date = null;
  for (const l of lines) if (keyDate.test(l)) { const d = findDates(l)[0]; if (d) { date = d.v; break; } }
  date ||= dates[0]?.v || null;
  const recurring = /annual|yearly|per year|\/\s?yr|12 months/i.test(t) ? 'yearly' : /quarter/i.test(t) ? 'quarterly' : /subscription|monthly|per month|\/\s?mo|renew|billing period|plan/i.test(t) ? 'monthly' : '';
  const isSub = !!recurring || VENDORS.slice(0, 18).some(([n]) => n === vendor);
  return { vendor, amount: best ? Math.round(best.n * 100) / 100 : null, currency, date, recurring, category: isSub ? 'Subscriptions' : '' };
}
