# v24 descriptive activity log patch

This patch builds on v23 and keeps the DB-backed live activity log.

## Changes

- Bumps the visible app version to `LIVE- v24`.
- Enriches every new `audit_events.details` record with:
  - `dateKey`
  - `dateLabel`, for example `Saturday 6 June`
  - previous/new values where available
  - player/group counts for lock and draw actions
- Updates the admin activity log text so it says what booking/day was amended.
- No `wrangler.toml` is included.
- No new D1 SQL is required if v23 `audit_events` already exists.

## Files included

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `test/live-api-tests.js`
- `test/soak-test.js`
- `package.json`
- `README_TESTING.md`
