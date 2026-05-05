# Weekend Golf — Cloudflare Pages + D1

This is a Cloudflare-hosted replacement for the Google Sheets / Apps Script version.

## What is included

- `public/index.html` — the web app UI.
- `functions/api/[[path]].js` — Cloudflare Pages Functions API.
- `migrations/0001_init.sql` — D1 database schema.
- `wrangler.toml` — Cloudflare config. Paste your D1 `database_id` before CLI deploy.
- `test/run-tests.js` — automated tests for date keys, player saves, admin flows, locking, export.

## Dashboard setup, no command line

1. Create a Cloudflare account.
2. Go to **Workers & Pages**.
3. Create a **D1 database** called `weekend-golf-db`.
4. Open the D1 database console and run the SQL from `migrations/0001_init.sql`.
5. Go to **Workers & Pages → Pages → Create application → Upload assets**.
6. Upload this project folder/ZIP.
7. After the Pages project exists, go to **Settings → Bindings → Add → D1 database bindings**.
8. Set variable name exactly: `DB`.
9. Select the `weekend-golf-db` database.
10. Redeploy the Pages project.
11. Open the `*.pages.dev` URL.

## CLI setup

```bash
npm install
npx wrangler login
npx wrangler d1 create weekend-golf-db
```

Paste the returned database UUID into `wrangler.toml` under `database_id`, then run:

```bash
npx wrangler d1 execute weekend-golf-db --file=migrations/0001_init.sql
npx wrangler pages deploy public --project-name=weekend-golf
```

Then bind the D1 database named `DB` to the Pages project in the Cloudflare dashboard and redeploy.

## Admin PIN

The admin PIN is currently `2727`, matching your existing app.

It appears in both:

- `public/index.html`
- `functions/api/[[path]].js`

Change both if you want a different PIN.

## Tested behaviours

The included test suite checks:

1. Clean date keys stay in `YYYY-MM-DD` format.
2. Old Google Sheet date strings normalise correctly.
3. Duplicate / blank player names are cleaned.
4. Player add saves to the exact requested date.
5. Player remove records `removed_self` audit.
6. Admin add requires the PIN.
7. Admin add saves to the correct date.
8. Admin lock generates a draw.
9. Public save is blocked when locked.
10. Admin competition edit persists.
11. Schedule read returns the stored data.
12. Admin export requires the PIN.
13. API routing returns JSON errors instead of hanging.

Run tests with:

```bash
npm test
```
