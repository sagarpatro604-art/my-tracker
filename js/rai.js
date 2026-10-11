// Optional AI for the reader (Google Gemini, free tier). The reader works fully without it.
// The key is the person's own, pasted in once and kept in their private space (settings 'readerai');
// the browser talks to Gemini directly. Every answer is labelled as AI and cites the pages it used.
import { R, notesOf, pdfjs, fileBytes } from './rlib.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
export const aiKey = () => (R.S.get('settings', 'readerai') || {}).key || '';
const SYSTEM = `You help a reader understand the document they are reading.
Use ONLY the document text you are given (and the page image, if one is attached). Do not use outside knowledge for facts or numbers.
After every claim, cite the page it came from like [p. 12] or [p. 12–13].
If the document does not contain the answer, say so plainly.
Write in clear, simple English. Keep numbers exactly as written in the document, with their units.
Use short paragraphs and "- " bullet points. No preamble.`;

async function pickModel(key) {
  try { const c = JSON.parse(localStorage.getItem('pb.aiModel') || 'null'); if (c && c.k === key.slice(-6) && Date.now() - c.at < 7 * 864e5) return c.m; } catch {}
  let m = 'gemini-2.5-flash';
  try {
    const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    if (r.ok) {
      const ver = (n) => +(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
      const list = ((await r.json()).models || []).map((x) => x.name.replace('models/', ''))
        .filter((n) => /^gemini-\d+(\.\d+)?-flash(-\d{3})?$/.test(n)).sort((a, b) => ver(b) - ver(a));
      if (list[0]) m = list[0];
    }
  } catch {}
  try { localStorage.setItem('pb.aiModel', JSON.stringify({ k: key.slice(-6), m, at: Date.now() })); } catch {}
  return m;
}
export async function gemini(parts, { json = false, system = SYSTEM } = {}) {
  const key = aiKey();
  if (!key) throw new Error('NOKEY');
  const model = await pickModel(key);
  const r = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error('The free AI limit is used up for the moment. Try again in a minute.');
    if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/.test(t)) throw new Error('The AI key was refused. Check it in Library > Settings.');
    throw new Error(`AI error ${r.status}: ${t.slice(0, 160)}`);
  }
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error(j.candidates?.[0]?.finishReason === 'SAFETY' ? 'The AI declined to answer this one.' : 'The AI returned nothing. Try again.');
  return text;
}

/* ---------- building the context sent with a question ---------- */
const pageBlock = (pages, i) => `[p. ${i + 1}]\n${(pages[i]?.t || '').trim()}`;
function rangeText(st, from, to, budget = 300000) {
  const out = [];
  let n = 0;
  for (let i = from - 1; i < Math.min(to, st.text.pages.length); i++) { const b = pageBlock(st.text.pages, i); if (n + b.length > budget) break; out.push(b); n += b.length; }
  return out.join('\n\n');
}
// The whole document when it fits; otherwise the pages that share the most words with the question.
function docText(st, question = '', budget = 300000) {
  const pages = st.text.pages;
  const total = pages.reduce((t, p) => t + (p.t || '').length, 0);
  if (total <= budget) return rangeText(st, 1, pages.length, budget);
  const words = [...new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
  const scored = pages.map((p, i) => {
    const low = (p.t || '').toLowerCase();
    return { i, s: words.reduce((t, w) => t + (low.split(w).length - 1), 0) + (i < 2 ? 3 : 0) };
  }).sort((a, b) => b.s - a.s);
  const pick = [];
  let n = 0;
  for (const { i } of scored) { const len = (pages[i].t || '').length + 12; if (n + len > budget) continue; pick.push(i); n += len; }
  return `(Long document: the most relevant pages are included.)\n\n` + pick.sort((a, b) => a - b).map((i) => pageBlock(pages, i)).join('\n\n');
}
function chapterRange(st) {
  const toc = (st.doc.toc || []).filter((t) => t.l <= 2).sort((a, b) => a.p - b.p);
  let from = 1, to = st.doc.pages, title = '';
  for (let k = 0; k < toc.length; k++) if (toc[k].p <= st.page) { from = toc[k].p; title = toc[k].t; to = (toc[k + 1]?.p || st.doc.pages + 1) - 1; }
  if (!toc.length || to - from > 60) { from = Math.max(1, st.page - 5); to = Math.min(st.doc.pages, st.page + 5); title = `pages ${from}–${to}`; }
  return { from, to: Math.max(from, to), title };
}
async function pageImage(st, n) {
  if (st.doc.kind !== 'pdf') return null;
  if (!st.pdf) { const lib = await pdfjs(); st.pdf = await lib.getDocument({ data: new Uint8Array(await fileBytes(st.doc)) }).promise; }
  const page = await st.pdf.getPage(n);
  const vp = page.getViewport({ scale: 1400 / page.getViewport({ scale: 1 }).width });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp, intent: 'print' }).promise;
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

const PRESETS = [
  ['page', 'Summarise this page'], ['chapter', 'Summarise this chapter'], ['doc', 'Summarise the whole document'],
  ['takeaways', 'Key takeaways'], ['numbers', 'Important numbers'], ['definitions', 'Definitions & terms'], ['actions', 'Actionable insights'],
  ['table', 'Explain the table / chart on this page'], ['cards', 'Flashcards from my highlights'], ['quiz', 'Revision questions'],
];

async function build(st, kind, opts = {}) {
  const head = `Document: "${st.doc.title}"${st.doc.author ? ` by ${st.doc.author}` : ''}, ${st.doc.pages} ${st.doc.kind === 'epub' ? 'chapters' : 'pages'}.`;
  const ctxNear = (p) => rangeText(st, Math.max(1, p - 1), Math.min(st.doc.pages, p + 1), 40000);
  switch (kind) {
    case 'page': return { title: `Summary of page ${st.page}`, parts: [{ text: `${head}\nSummarise page ${st.page} in 4-8 bullet points.\n\n${rangeText(st, st.page, st.page)}` }] };
    case 'chapter': { const c = chapterRange(st); return { title: `Summary: ${c.title}`, parts: [{ text: `${head}\nSummarise ${c.title} (pages ${c.from}–${c.to}): a 2-sentence overview, then the main points as bullets.\n\n${rangeText(st, c.from, c.to)}` }] }; }
    case 'doc': return { title: 'Summary of the whole document', parts: [{ text: `${head}\nGive a structured summary of the whole document: one-paragraph overview, then the main sections with their key points.\n\n${docText(st)}` }] };
    case 'takeaways': return { title: 'Key takeaways', parts: [{ text: `${head}\nList the 8-12 most important takeaways.\n\n${docText(st)}` }] };
    case 'numbers': return { title: 'Important numbers', parts: [{ text: `${head}\nList the important numbers (financial figures, growth rates, targets, dates, ratios) as "- figure: what it is [p. N]". Group by topic.\n\n${docText(st)}` }] };
    case 'definitions': return { title: 'Definitions & terms', parts: [{ text: `${head}\nList the key terms, jargon and abbreviations used, each with a one-line plain-English meaning as used in this document.\n\n${docText(st)}` }] };
    case 'actions': return { title: 'Actionable insights', parts: [{ text: `${head}\nWhat are the actionable insights or things a reader should watch or do, according to this document? Only what the document supports.\n\n${docText(st)}` }] };
    case 'table': {
      const img = await pageImage(st, st.page);
      const parts = [{ text: `${head}\nThe attached image is page ${st.page}. Explain the table(s) / chart(s) on it in plain English: what they show, the key numbers and changes, and anything notable. Cite [p. ${st.page}].\n\nText of the page:\n${rangeText(st, st.page, st.page)}` }];
      if (img) parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
      return { title: `Table / chart on page ${st.page}`, parts };
    }
    case 'explain': return { title: 'Explained simply', quote: opts.text, page: opts.page, parts: [{ text: `${head}\nExplain this passage from page ${opts.page} in simple language, as if to a smart friend new to the topic. Then give one example if it helps.\n\nPassage:\n"""${opts.text}"""\n\nSurrounding pages for context:\n${ctxNear(opts.page)}` }] };
    case 'structure': return { title: 'Structured note', quote: opts.text, page: opts.page, parts: [{ text: `${head}\nTurn this passage from page ${opts.page} into a structured study note: a title, 3-6 bullet points, and key terms.\n\n"""${opts.text}"""` }] };
    case 'cards': case 'quiz': {
      const hl = notesOf(st.doc.id).filter((n) => n.quote).slice(0, 80);
      const src = hl.length >= 3 ? hl.map((n) => `[p. ${n.page}] ${n.quote}${n.note ? ` (my note: ${n.note})` : ''}`).join('\n') : rangeText(st, chapterRange(st).from, chapterRange(st).to, 60000);
      const from = hl.length >= 3 ? 'my highlights' : 'this chapter';
      if (kind === 'quiz') return { title: `Revision questions from ${from}`, parts: [{ text: `${head}\nWrite 8 revision questions (mix of recall and understanding) based on ${from}, each followed by a short model answer and its page.\n\n${src}` }] };
      return { title: `Flashcards from ${from}`, json: true, parts: [{ text: `${head}\nMake 8-15 flashcards from ${from}. Reply as JSON: [{"q": "question", "a": "short answer", "page": number}]. Questions must be answerable from the text.\n\n${src}` }] };
    }
    default: return { title: opts.question, parts: [{ text: `${head}\nQuestion: ${opts.question}\n\n${docText(st, opts.question)}` }] };
  }
}

/* ---------- panel ---------- */
const md = (s) => R.esc(s)
  .replace(/\[p\.\s*(\d+)(?:\s*[–-]\s*(\d+))?\]/g, (_, a, b) => `<button class="pcite" data-ract="go" data-v="${a}">p. ${a}${b ? '–' + b : ''}</button>`)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/^#{1,4} (.*)$/gm, '<h4>$1</h4>')
  .replace(/^\s*[-*•] (.*)$/gm, '<li>$1</li>')
  .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
  .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, ' ');
function card(e, i) {
  if (e.busy) return `<div class="ai-card"><b>${R.esc(e.title)}</b><p class="muted small">Thinking…</p></div>`;
  if (e.error) return `<div class="ai-card bad"><b>${R.esc(e.title)}</b><p>${R.esc(e.error)}</p></div>`;
  const body = e.cards ? `<div class="fcards">${e.cards.map((c, k) => `<button class="fcard" data-ract="flip" data-v="${i}-${k}"><span class="q">${R.esc(c.q)}</span><span class="a">${R.esc(c.a)}${c.page ? ` <small>p. ${c.page}</small>` : ''}</span></button>`).join('')}</div>` : `<div class="ai-text">${md(e.text)}</div>`;
  return `<div class="ai-card"><div class="ai-card-head"><b>${R.esc(e.title)}</b><span class="ai-tag">AI</span></div>
    ${e.quote ? `<blockquote class="rd-quote">${R.esc(e.quote.slice(0, 300))}</blockquote>` : ''}${body}
    <div class="row"><button class="btn sm" data-ract="aisave" data-v="${i}">${e.cards ? 'Save as flashcards' : 'Save as note'}</button><button class="btn sm ghost" data-ract="aicopy" data-v="${i}">Copy</button></div></div>`;
}
export function aiPanelHTML(st) {
  st.aiLog ||= [];
  if (!aiKey()) return `<div class="ai-setup"><p>AI can answer questions about this document, summarise pages and chapters, explain passages and tables, and make flashcards — always citing pages.</p>
    <p class="small">It uses Google's free Gemini AI with your own key (free, takes a minute):</p>
    <ol class="small"><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in.</li><li>Press “Create API key” and copy it.</li><li>Paste it below. It's kept only in your private Playbook space.</li></ol>
    <button class="btn primary" data-ract="aikey">Add my AI key</button><p class="muted small">Everything else in the reader works without AI.</p></div>`;
  return `<div class="ai">
    <div class="ai-presets">${PRESETS.map(([k, l]) => `<button class="chip" data-ract="aido" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="ai-out" id="aiOut">${st.aiLog.length ? st.aiLog.map(card).reverse().join('') : '<p class="muted small">Pick an action above or ask a question. Select text in the document and press ✨ to have it explained.</p>'}</div>
    <form class="ai-ask" id="aiAsk"><textarea class="input" name="q" rows="2" placeholder="Ask anything about this document…"></textarea><button class="btn primary">Ask</button></form>
    <p class="muted small">AI-generated from this document's text — check the cited pages. <button class="link-btn" data-ract="aikey">Key</button></p></div>`;
}
export function aiWire(st, pan) {
  pan.querySelector('#aiAsk')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) { e.target.q.value = ''; AI_ACTS.run(st, 'ask', { question: q }); }
  });
  pan.querySelector('#aiAsk textarea')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
}
const refresh = (st) => { const out = st.root.querySelector('#aiOut'); if (out && st.panel === 'ai') out.innerHTML = st.aiLog.map(card).reverse().join(''); };

export function keyModal() {
  R.openModal('Gemini AI key', `<p class="small">Create a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>, then paste it here. It's stored only in your private Playbook space and used only by the Library's AI.</p>
    ${R.field('API key', `<input class="input" type="password" name="key" autocomplete="off" placeholder="${aiKey() ? 'saved — paste a new one to replace' : 'paste your key'}">`)}
    ${aiKey() ? '<label class="check-line small"><input type="checkbox" name="remove"> Remove my saved key</label>' : ''}`,
  async (v) => {
    if (v.remove === 'on') { R.S.put('settings', { id: 'readerai', key: '' }); R.toast('AI key removed'); return; }
    const key = (v.key || '').trim();
    if (!key) return;
    R.S.put('settings', { id: 'readerai', key });
    try { localStorage.removeItem('pb.aiModel'); } catch {}
    try { await gemini([{ text: 'Reply with the single word: ready' }], { system: 'Reply briefly.' }); R.toast('AI key works ✓'); }
    catch (e) { R.toast(e.message === 'NOKEY' ? 'No key saved' : e.message); }
    window.dispatchEvent(new Event('pb-ai-key'));
  }, 'Save key');
}

export const AI_ACTS = {
  async run(st, kind, opts = {}) {
    if (!aiKey()) { keyModal(); return; }
    const entry = { title: kind === 'ask' ? opts.question : (PRESETS.find((p) => p[0] === kind)?.[1] || 'AI'), busy: true, page: opts.page || st.page, kind };
    st.aiLog.push(entry);
    if (st.panel !== 'ai') { st.panel = 'ai'; }
    refresh(st);
    try {
      const job = await build(st, kind, opts);
      entry.title = job.title; entry.quote = job.quote;
      const text = await gemini(job.parts, { json: !!job.json });
      if (job.json) { const arr = JSON.parse(text.replace(/^```json|```$/g, '')); entry.cards = (Array.isArray(arr) ? arr : arr.cards || []).filter((c) => c.q && c.a).slice(0, 30); }
      else entry.text = text;
    } catch (e) { entry.error = e.message === 'NOKEY' ? 'Add your AI key first.' : e.message; }
    entry.busy = false;
    refresh(st);
  },
  aido: (st, b) => AI_ACTS.run(st, b.dataset.v),
  aikey: () => keyModal(),
  flip: (st, b) => b.classList.toggle('show'),
  aicopy: (st, b) => { const e = st.aiLog[+b.dataset.v]; if (e) R.copyText(e.cards ? e.cards.map((c) => `Q: ${c.q}\nA: ${c.a}`).join('\n\n') : e.text); },
  aisave: (st, b) => {
    const e = st.aiLog[+b.dataset.v];
    if (!e || e.saved) return;
    if (e.cards) {
      R.S.putMany('rnotes', e.cards.map((c) => ({ docId: st.doc.id, docTitle: st.doc.title, kind: 'card', q: c.q, a: c.a, page: +c.page || st.page, tags: ['flashcard'], at: R.S.nowISO(), id: R.S.uid() })));
      R.toast(`Saved ${e.cards.length} flashcards`);
    } else {
      R.S.put('rnotes', { docId: st.doc.id, docTitle: st.doc.title, kind: 'ai', page: e.page || st.page, quote: e.quote || '', note: `${e.title}\n\n${e.text}`, tags: ['ai'], at: R.S.nowISO(), color: 'purple' });
      R.toast('Saved to your notes (marked as AI)');
    }
    e.saved = true;
    b.disabled = true; b.textContent = 'Saved';
  },
};
