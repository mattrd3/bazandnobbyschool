# Weekend Golf App v51 Patch

## Purpose

Improves the admin WhatsApp reminder so it is day-specific instead of weekend-wide.

## Changes

- The reminder now checks Saturday and Sunday independently.
- Players who have responded for Sunday but not Saturday are now included under Saturday, and vice versa.
- The WhatsApp wording now clearly asks players to update each day as Playing or Unavailable before the Wednesday / Thursday tee booking windows.
- The admin button label now says `Copy day-by-day reminder for WhatsApp`.
- No database schema changes.

## Files changed

- `public/index.html`
- `package.json`
- `test/run-tests.js`

## Deployment

Replace the matching files in GitHub. Do not overwrite `wrangler.toml`.
