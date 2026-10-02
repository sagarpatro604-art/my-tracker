# Playbook

Personal dashboard: to-dos with an accuracy board, Instagram posting consistency (auto-updated nightly),
thoughts you can copy on any device, a bookshelf and a content-idea bank. Plain HTML/CSS/JS, no build step.

## Pieces
| Part | Where |
|---|---|
| Website | GitHub Pages (this repo, `main` branch, root) |
| Database / sync | Firebase Firestore (free Spark plan), config in `js/config.js` |
| Instagram stats | `.github/workflows/instagram.yml` runs `scripts/fetch-instagram.mjs` nightly via Apify |

## One-time setup
1. **Firebase**: create a project → Firestore Database → Create (location `asia-south1`, production mode).
   Project settings → Your apps → Web (`</>`) → copy the config into `js/config.js`.
2. **GitHub Pages**: repo → Settings → Pages → Deploy from branch → `main` / root.
3. Open the site → "Create my tracker" → Settings shows your secret device link, the Firestore rules
   (paste into Firebase → Firestore → Rules → Publish) and the `VAULT_KEY`.
4. **Secrets** (repo → Settings → Secrets and variables → Actions): `APIFY_TOKEN` (Apify console → Settings →
   API & Integrations) and `VAULT_KEY`.
5. Actions tab → "Instagram auto-update" → Run workflow, to test it once.
6. Settings → Import old Excel tracker, to bring in history from `Instagram_Content_Tracker.xlsx`.

## Notes
- No login: whoever has the secret link can open your data. Keep it private.
- Data is stored in monthly bucket documents, so years of use stay well inside the free limits.
- Settings → "Download full backup" once a month is cheap insurance.
- Apify cost: ~20 posts/night × $0.0027 ≈ $1.6/month, inside the free $5 monthly credit.
