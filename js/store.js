// Data layer. Items live in "bucket" documents (one per collection per month) so a page load
// costs a handful of Firestore reads no matter how many years of data pile up.
//   Firestore path: vaults/{secretKey}/buckets/{collection_YYYY-MM} → { items: { [id]: item } }
import { firebaseConfig } from './config.js';

const FB_VER = '10.12.2';
const KEY_LS = 'tracker.vaultKey';
const LOCAL_LS = 'tracker.localBuckets';
const SINGLE_BUCKET = new Set(['books', 'settings', 'mybook']);

const listeners = new Set();
let buckets = {};
let fb = null;

export const status = { mode: 'local', connected: false, error: null, key: null, needsKey: false };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowISO = () => new Date().toISOString();
const clean = (o) => JSON.parse(JSON.stringify(o)); // Firestore rejects undefined values

export function bucketId(col, item) {
  if (SINGLE_BUCKET.has(col)) return `${col}_all`;
  const d = (col === 'reels' ? item.date : item.createdAt) || nowISO();
  return `${col}_${d.slice(0, 7)}`;
}

function emit() { listeners.forEach((f) => f()); }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }

export function all(col) {
  const out = [];
  for (const [bid, b] of Object.entries(buckets)) {
    if (!bid.startsWith(col + '_') || !b?.items) continue;
    for (const it of Object.values(b.items)) if (it && it.id) out.push(it);
  }
  return out;
}
export const get = (col, id) => all(col).find((x) => x.id === id);

function applyLocal(bid, id, item) {
  const b = (buckets[bid] ||= { items: {} });
  b.items ||= {};
  if (item === null) delete b.items[id];
  else b.items[id] = { ...(b.items[id] || {}), ...item };
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_LS) || '{}'); } catch { return {}; }
}
function saveLocal() {
  try { localStorage.setItem(LOCAL_LS, JSON.stringify(buckets)); }
  catch { status.error = 'Could not save on this device (storage full or blocked).'; }
}
function fail(err) { status.error = err?.code || err?.message || String(err); emit(); }

export function put(col, item) {
  const it = clean({ ...item });
  it.id ||= uid();
  it.createdAt ||= nowISO();
  it.updatedAt = nowISO();
  it._b ||= bucketId(col, it);
  applyLocal(it._b, it.id, it);
  if (fb) {
    const { fs, db, key } = fb;
    fs.setDoc(fs.doc(db, 'vaults', key, 'buckets', it._b), { items: { [it.id]: it } }, { merge: true }).catch(fail);
  } else saveLocal();
  emit();
  return it;
}

export function update(col, id, patch) {
  const cur = get(col, id);
  return put(col, { ...(cur || { id }), ...patch });
}

export function remove(col, item) {
  const bid = item._b || bucketId(col, item);
  applyLocal(bid, item.id, null);
  if (fb) {
    const { fs, db, key } = fb;
    fs.updateDoc(fs.doc(db, 'vaults', key, 'buckets', bid), new fs.FieldPath('items', item.id), fs.deleteField()).catch(fail);
  } else saveLocal();
  emit();
}

// Write many items with one write per bucket (imports).
export async function putMany(col, items) {
  const grouped = {};
  for (const raw of items) {
    const it = clean({ ...raw });
    it.id ||= uid();
    it.createdAt ||= nowISO();
    it.updatedAt = nowISO();
    it._b ||= bucketId(col, it);
    (grouped[it._b] ||= {})[it.id] = it;
  }
  await importBuckets(Object.fromEntries(Object.entries(grouped).map(([bid, items]) => [bid, { items }])));
}

export async function importBuckets(bk) {
  for (const [bid, b] of Object.entries(bk)) for (const [id, it] of Object.entries(b?.items || {})) applyLocal(bid, id, it);
  if (fb) {
    const { fs, db, key } = fb;
    const entries = Object.entries(bk);
    for (let i = 0; i < entries.length; i += 400) {
      const batch = fs.writeBatch(db);
      for (const [bid, b] of entries.slice(i, i + 400)) batch.set(fs.doc(db, 'vaults', key, 'buckets', bid), { items: clean(b.items || {}) }, { merge: true });
      await batch.commit();
    }
  } else saveLocal();
  emit();
}

export const snapshot = () => clean(buckets);
export const localSnapshot = () => loadLocal();
export const hasLocalData = () => Object.values(loadLocal()).some((b) => b?.items && Object.keys(b.items).length);

export function newKey() {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const a = new Uint8Array(36);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => abc[b % 62]).join('');
}
export const keyFromText = (t) => (String(t).match(/k=([A-Za-z0-9]{32,})/) || String(t).match(/^\s*([A-Za-z0-9]{32,})\s*$/) || [])[1] || null;

export async function init() {
  if (!firebaseConfig?.projectId) {
    status.mode = 'local';
    buckets = loadLocal();
    emit();
    return;
  }
  status.mode = 'cloud';
  const fromHash = keyFromText(location.hash);
  if (fromHash) {
    localStorage.setItem(KEY_LS, fromHash);
    history.replaceState(null, '', location.pathname + '#/');
  }
  const key = localStorage.getItem(KEY_LS);
  if (!key) { status.needsKey = true; emit(); return; }
  await connect(key);
}

export async function connect(key) {
  localStorage.setItem(KEY_LS, key);
  status.key = key;
  status.needsKey = false;
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [{ initializeApp }, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }
  fb = { fs, db, key };
  await new Promise((resolve) => {
    fs.onSnapshot(
      fs.collection(db, 'vaults', key, 'buckets'),
      { includeMetadataChanges: true },
      (snap) => {
        const next = {};
        snap.forEach((d) => { next[d.id] = d.data(); });
        buckets = next;
        status.connected = !snap.metadata.fromCache;
        status.error = null;
        emit();
        resolve();
      },
      (err) => { fail(err); resolve(); },
    );
  });
}
