# v23 DB-backed live activity log patch

Replace these files in the repo:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `test/live-api-tests.js`
- `test/soak-test.js`
- `package.json`
- `README_TESTING.md`

Do not replace `wrangler.toml`.

## Change

The admin activity log is now DB-first. New events write to the D1 `audit_events` table, legacy day-level audit arrays are migrated on lookup, and the open admin activity panel polls `/api/admin/audit` every 5 seconds.
