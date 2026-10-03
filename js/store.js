// Data layer. Items live in "bucket" documents (one per collection per month) so a page load
// costs a handful of Firestore reads no matter how many years of data pile up.
//
// Three spaces under the secret vault key:
//   sys  vaults/{key}/buckets/...                 robot-fed, shared: reels_*, settings_all (instaSync)
//   me   vaults/{key}/spaces/{userSpace}/buckets  one person's private data; userSpace is derived from
//                                                 their 6-digit code, and the Firestore rules allow only
//                                                 the two real user spaces
//   co   vaults/{key}/spaces/company/buckets      company tasks (ctasks_*), seen by both
// Each bucket document is { items: { [id]: item } }.
import { firebaseConfig, INSTA } from './config.js';

const FB_VER = '10.12.2';
const KEY_LS = 'tracker.vaultKey';
const USER_LS = 'tracker.user';
const LOCAL_LS = 'tracker.localBuckets';
const SINGLE_BUCKET = new Set(['books', 'settings', 'mybook', 'csettings']);
const COL_SPACE = { reels: 'sys', ctasks: 'co', csettings: 'co' };
const READ_SPACES = { settings: ['me', 'sys'] }; // instaSync is written into the shared settings by the nightly job
const ABC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const listeners = new Set();
const data = { sys: {}, me: {}, co: {} };
const unsub = { sys: null, me: null, co: null };
let fb = null;

export const status = { mode: 'local', connected: false, error: null, key: null, needsKey: false, user: null, space: null };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowISO = () => new Date().toISOString();
const clean = (o) => JSON.parse(JSON.stringify(o)); // Firestore rejects undefined values
const spaceOf = (col) => COL_SPACE[col] || 'me';

export function bucketId(col, item) {
  if (SINGLE_BUCKET.has(col)) return `${col}_all`;
  const d = (col === 'reels' ? item.date : item.createdAt) || nowISO();
  return `${col}_${d.slice(0, 7)}`;
}

function emit() { listeners.forEach((f) => f()); }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }

export function all(col) {
  const out = [];
  for (const sp of READ_SPACES[col] || [spaceOf(col)]) {
    for (const [bid, b] of Object.entries(data[sp])) {
      if (!bid.startsWith(col + '_') || !b?.items) continue;
      for (const it of Object.values(b.items)) {
        if (!it || !it.id) continue;
        if (sp === 'sys' && col === 'settings' && it.id !== 'instaSync') continue; // only the nightly job's status is shared
        out.push(it);
      }
    }
  }
  return out;
}
export const get = (col, id) => all(col).find((x) => x.id === id);

/* ---------- where things are stored ---------- */
function docRef(sp, bid) {
  const { fs, db, key } = fb;
  if (sp === 'sys') return fs.doc(db, 'vaults', key, 'buckets', bid);
  return fs.doc(db, 'vaults', key, 'spaces', sp === 'co' ? 'company' : status.space, 'buckets', bid);
}
const localKey = (sp) => (sp === 'sys' ? LOCAL_LS : `${LOCAL_LS}:${sp === 'co' ? 'company' : status.space}`);
function loadLocal(sp) {
  try { return JSON.parse(localStorage.getItem(localKey(sp)) || '{}'); } catch { return {}; }
}
function saveLocal(sp) {
  try { localStorage.setItem(localKey(sp), JSON.stringify(data[sp])); }
  catch { status.error = 'Could not save on this device (storage full or blocked).'; }
}
function applyLocal(sp, bid, id, item) {
  const b = (data[sp][bid] ||= { items: {} });
  b.items ||= {};
  if (item === null) delete b.items[id];
  else b.items[id] = { ...(b.items[id] || {}), ...item };
}
function fail(err) { status.error = err?.code || err?.message || String(err); emit(); }
function canWrite(sp) {
  if (sp !== 'sys' && !status.space) { fail('Not signed in'); return false; }
  return true;
}

export function put(col, item) {
  const sp = spaceOf(col);
  if (!canWrite(sp)) return item;
  const it = clean({ ...item });
  it.id ||= uid();
  it.createdAt ||= nowISO();
  it.updatedAt = nowISO();
  it._b ||= bucketId(col, it);
  applyLocal(sp, it._b, it.id, it);
  if (fb) fb.fs.setDoc(docRef(sp, it._b), { items: { [it.id]: it } }, { merge: true }).catch(fail);
  else saveLocal(sp);
  emit();
  return it;
}

export function update(col, id, patch) {
  const cur = get(col, id);
  return put(col, { ...(cur || { id }), ...patch });
}

export function remove(col, item) {
  const sp = spaceOf(col);
  if (!canWrite(sp)) return;
  const bid = item._b || bucketId(col, item);
  applyLocal(sp, bid, item.id, null);
  if (fb) fb.fs.updateDoc(docRef(sp, bid), new fb.fs.FieldPath('items', item.id), fb.fs.deleteField()).catch(fail);
  else saveLocal(sp);
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

// Restore / import: each bucket goes to the space its collection belongs to.
const spaceOfBucket = (bid) => spaceOf(bid.replace(/_(all|\d{4}-\d{2})$/, ''));
export async function importBuckets(bk) {
  if (!canWrite('me')) return;
  const entries = Object.entries(bk);
  for (const [bid, b] of entries) for (const [id, it] of Object.entries(b?.items || {})) applyLocal(spaceOfBucket(bid), bid, id, it);
  if (fb) {
    for (let i = 0; i < entries.length; i += 400) {
      const batch = fb.fs.writeBatch(fb.db);
      for (const [bid, b] of entries.slice(i, i + 400)) batch.set(docRef(spaceOfBucket(bid), bid), { items: clean(b.items || {}) }, { merge: true });
      await batch.commit();
    }
  } else new Set(entries.map(([bid]) => spaceOfBucket(bid))).forEach(saveLocal);
  emit();
}

export const snapshot = () => clean({ ...data.me, ...data.co });
export const localSnapshot = () => { try { return JSON.parse(localStorage.getItem(LOCAL_LS) || '{}'); } catch { return {}; } };
export const hasLocalData = () => false;

export function newKey() {
  const a = new Uint8Array(36);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ABC[b % 62]).join('');
}
export const keyFromText = (t) => (String(t).match(/k=([A-Za-z0-9]{32,})/) || String(t).match(/^\s*([A-Za-z0-9]{32,})\s*$/) || [])[1] || null;

/* ---------- people ---------- */
// The private space id comes from the person's code. The code itself is never stored or sent anywhere.
export async function deriveSpace(userId, code) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`playbook|${userId}|${status.key || 'local'}`), iterations: 150000 },
    base, 256);
  return Array.from(new Uint8Array(bits), (b) => ABC[b % 62]).join('');
}

function listen(sp, path) {
  return new Promise((resolve) => {
    unsub[sp]?.();
    unsub[sp] = fb.fs.onSnapshot(
      fb.fs.collection(fb.db, ...path),
      { includeMetadataChanges: true },
      (snap) => {
        const next = {};
        snap.forEach((d) => { next[d.id] = d.data(); });
        data[sp] = next;
        if (sp === 'me') status.connected = !snap.metadata.fromCache;
        status.error = null;
        emit();
        resolve();
      },
      (err) => {
        // A remembered space that the rules no longer allow (code changed): sign out instead of failing silently.
        if (sp === 'me' && err?.code === 'permission-denied') { logout(); status.error = 'Please sign in again.'; emit(); }
        else fail(err);
        resolve();
      },
    );
  });
}

// The shared area can't be listed (the rules only allow reels_* and settings_all by name), so follow
// those documents one by one: settings_all plus one reels bucket per month since tracking began.
function listenShared() {
  if (Array.isArray(unsub.sys)) unsub.sys.forEach((u) => u());
  const months = [];
  const end = new Date().toISOString().slice(0, 7);
  // From a year before tracking began (pinned older posts land in older buckets) up to this month.
  const from = new Date(`${(INSTA.trackingStart || '2026-08-01').slice(0, 7)}-01T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - 12);
  for (let d = from; d.toISOString().slice(0, 7) <= end; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const ids = ['settings_all', ...months.map((m) => `reels_${m}`)];
  let pending = ids.length;
  return new Promise((resolve) => {
    unsub.sys = ids.map((bid) => fb.fs.onSnapshot(docRef('sys', bid), (d) => {
      if (d.exists()) data.sys[bid] = d.data(); else delete data.sys[bid];
      emit();
      if (--pending === 0) resolve();
    }, (err) => { fail(err); if (--pending === 0) resolve(); }));
  });
}

async function attachUser(user, space) {
  status.user = user;
  status.space = space;
  if (fb) {
    await Promise.all([
      listen('me', ['vaults', status.key, 'spaces', space, 'buckets']),
      listen('co', ['vaults', status.key, 'spaces', 'company', 'buckets']),
    ]);
  } else {
    data.me = loadLocal('me');
    data.co = loadLocal('co');
  }
  emit();
}

// Check the code against the server: the rules only let real user spaces be read.
export async function login(user, code) {
  if (!/^\d{6}$/.test(String(code))) throw new Error('wrong-code');
  const space = await deriveSpace(user, code);
  if (fb) {
    try {
      await fb.fs.getDocFromServer(fb.fs.doc(fb.db, 'vaults', status.key, 'spaces', space, 'buckets', 'settings_all'));
    } catch (e) {
      if (e?.code === 'permission-denied') throw new Error('wrong-code');
      throw new Error(e?.code === 'unavailable' ? 'You seem to be offline. Connect to the internet and try again.' : (e?.message || String(e)));
    }
  }
  try { localStorage.setItem(USER_LS, JSON.stringify({ user, space })); } catch {}
  await attachUser(user, space);
}

export function logout() {
  try { localStorage.removeItem(USER_LS); } catch {}
  unsub.me?.(); unsub.co?.();
  unsub.me = unsub.co = null;
  data.me = {};
  data.co = {};
  status.user = null;
  status.space = null;
  emit();
}

function savedUser() {
  try { const s = JSON.parse(localStorage.getItem(USER_LS) || 'null'); return s?.user && s?.space ? s : null; } catch { return null; }
}

export async function init() {
  if (!firebaseConfig?.projectId) {
    status.mode = 'local';
    data.sys = loadLocal('sys');
    const s = savedUser();
    if (s) await attachUser(s.user, s.space);
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
  await listenShared();
  // A new month means a new reels bucket to follow.
  let month = new Date().toISOString().slice(0, 7);
  setInterval(() => { const m = new Date().toISOString().slice(0, 7); if (m !== month) { month = m; listenShared(); } }, 3600000);
  const s = savedUser();
  if (s) await attachUser(s.user, s.space);
}
