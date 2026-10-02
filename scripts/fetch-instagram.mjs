// Nightly job (GitHub Actions): fetch latest posts from Instagram via Apify and save them to Firestore.
// Needs repo secrets APIFY_TOKEN and VAULT_KEY. Only touches stats fields, so content types you set stay put.
import { firebaseConfig, INSTA } from '../js/config.js';

const { APIFY_TOKEN, VAULT_KEY } = process.env;
const LIMIT = Number(process.env.RESULTS_LIMIT || 20);
const { projectId, apiKey } = firebaseConfig;

if (!APIFY_TOKEN || !VAULT_KEY) throw new Error('Missing APIFY_TOKEN or VAULT_KEY repository secret.');
if (!projectId) throw new Error('firebaseConfig.projectId is empty in js/config.js.');

const DB = `projects/${projectId}/databases/(default)/documents`;
const BUCKETS = `${DB}/vaults/${VAULT_KEY}/buckets`;
const FIELDS = ['id', '_b', 'date', 'time', 'caption', 'plays', 'views', 'likes', 'comments', 'url', 'kind', 'source', 'syncedAt'];

const value = (v) => {
  if (v == null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
  return { stringValue: String(v) };
};

async function commit(writes) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${DB}:commit?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 400)}`);
}

async function saveSyncStatus(status) {
  const item = { id: 'instaSync', _b: 'settings_all', ...status };
  await commit([{
    update: { name: `${BUCKETS}/settings_all`, fields: { items: value({ instaSync: item }) } },
    updateMask: { fieldPaths: ['items.instaSync'] },
  }]);
}

async function fetchPosts() {
  const res = await fetch('https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${INSTA.username}/`],
      resultsType: 'posts',
      resultsLimit: LIMIT,
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const items = await res.json();
  const posts = items.filter((p) => p.shortCode && p.timestamp);
  if (!posts.length) throw new Error(`Apify returned no posts${items[0]?.error ? `: ${items[0].error}` : ''}.`);
  return posts;
}

const ist = (ts) => new Date(new Date(ts).getTime() + 330 * 60000).toISOString(); // UTC → IST wall clock
const stat = (v) => (typeof v === 'number' && v >= 0 ? v : null); // Instagram reports hidden likes as -1

function toItem(p, syncedAt) {
  const t = ist(p.timestamp);
  const reel = p.type === 'Video' || p.productType === 'clips';
  return {
    id: p.shortCode,
    _b: `reels_${t.slice(0, 7)}`,
    date: t.slice(0, 10),
    time: t.slice(11, 16),
    caption: (p.caption || '').split('\n')[0].trim().slice(0, 200),
    plays: stat(p.videoPlayCount),
    views: stat(p.videoViewCount),
    likes: stat(p.likesCount),
    comments: stat(p.commentsCount),
    url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
    kind: reel ? 'reel' : p.type === 'Sidecar' ? 'carousel' : 'post',
    source: 'apify',
    syncedAt,
  };
}

const syncedAt = new Date().toISOString();
try {
  const items = (await fetchPosts()).map((p) => toItem(p, syncedAt));
  const byBucket = {};
  for (const it of items) (byBucket[it._b] ||= {})[it.id] = it;
  await commit(Object.entries(byBucket).map(([bid, map]) => ({
    update: { name: `${BUCKETS}/${bid}`, fields: { items: value(map) } },
    updateMask: { fieldPaths: Object.keys(map).flatMap((id) => FIELDS.map((f) => `items.\`${id}\`.${f}`)) },
  })));
  const reels = items.filter((i) => i.kind === 'reel').length;
  await saveSyncStatus({ lastRun: syncedAt, ok: true, count: items.length, reels, error: null });
  console.log(`Saved ${items.length} posts (${reels} reels). Latest: ${items[0]?.date} — ${items[0]?.caption}`);
} catch (err) {
  console.error(err);
  await saveSyncStatus({ lastRun: syncedAt, ok: false, error: String(err.message || err).slice(0, 300) }).catch(() => {});
  process.exit(1);
}
