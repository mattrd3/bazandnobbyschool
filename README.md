# bazandnobbyschool — Cloudflare Pages + D1

This is the Cloudflare-hosted replacement for the Google Sheets / Apps Script version.

The project, repository, Pages project, and D1 database are all intended to use the same clean name:

```text
bazandnobbyschool
```

The visible app title still says **Weekend Golf**, because that is what users see in the app.

## What is included

- `public/index.html` — the web app UI.
- `functions/api/[[path]].js` — Cloudflare Pages Functions API.
- `migrations/0001_init.sql` — D1 database schema.
- `wrangler.toml` — Cloudflare config using project/database name `bazandnobbyschool`.
- `test/run-tests.js` — automated tests for date keys, player saves, admin flows, locking, and export.

## Cloudflare setup

### 1. D1 database

Create a D1 database called:

```text
bazandnobbyschool
```

Open the D1 SQL console and run the SQL from:

```text
migrations/0001_init.sql
```

### 2. GitHub repository

Create or use a repository called:

```text
bazandnobbyschool
```

Upload these files/folders to the repository root:

```text
public/index.html
functions/api/[[path]].js
migrations/0001_init.sql
wrangler.toml
package.json
README.md
test/run-tests.js
```

### 3. Cloudflare Pages project

Create a Pages project called:

```text
bazandnobbyschool
```

Use these build settings:

```text
Framework preset: None
Build command: leave blank
Build output directory: public
Root directory: /
```

Do not use `npx wrangler deploy` as the build command.

### 4. D1 binding

In the Pages project settings, add a D1 database binding:

```text
Variable name: DB
Database: bazandnobbyschool
```

The binding variable must be exactly `DB`, because the API code uses `context.env.DB`.

After adding the binding, redeploy the Pages project.

## CLI setup, optional

```bash
npm install
npx wrangler login
npx wrangler d1 create bazandnobbyschool
```

Paste the returned database UUID into `wrangler.toml` under `database_id`, then run:

```bash
npx wrangler d1 execute bazandnobbyschool --file=migrations/0001_init.sql
npx wrangler pages deploy public --project-name=bazandnobbyschool
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
