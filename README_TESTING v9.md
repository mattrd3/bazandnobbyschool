# Baz and Nobby School — Test Pack v7

This patch adds a regression and soak-testing package for the Cloudflare Pages + D1 app.

## Files to replace/add

Replace or add these files in the GitHub repo:

```text
functions/api/[[path]].js
public/index.html
test/run-tests.js
test/live-api-tests.js
test/soak-test.js
package.json
README_TESTING.md
```

Do **not** overwrite `wrangler.toml` if yours already contains the real D1 database UUID.

## What changed in the API

A PIN-protected test cleanup endpoint has been added:

```text
POST /api/admin/delete-day
```

Body:

```json
{ "adminPin": "2727", "dateKey": "2099-01-02" }
```

This lets live and soak tests clean up their synthetic test dates afterwards.

## Quick local regression tests

Run:

```bash
npm test
```

Covers:

- date normalisation;
- old Google Sheet date-key cleanup;
- duplicate player cleanup;
- signup cutoff helper logic;
- public add/remove;
- admin add/remove;
- admin lock/unlock;
- public locked-date blocking;
- competition save;
- export;
- test cleanup endpoint;
- UI static checks for dropdown, WhatsApp buttons, competition editor, booking-window copy, and short version label.

## Live API tests against deployed Cloudflare

Run:

```bash
SITE_URL=https://bazandnobbyschool.pages.dev ADMIN_PIN=2727 npm run test:live
```

This uses far-future synthetic dates like `2099-01-02`, then deletes them afterwards.

Covers:

- `/api/schedule` loads;
- public add saves to the exact date;
- saved player survives schedule reload;
- public remove works and audits;
- bad admin PIN is rejected;
- admin add works;
- competition edit persists;
- admin lock creates draw;
- locked public add is blocked;
- admin unlock allows public add again;
- public cutoff is blocked on a historical date;
- admin export works;
- synthetic test rows are cleaned up afterwards.

## One-hour soak test

Run:

```bash
SITE_URL=https://bazandnobbyschool.pages.dev ADMIN_PIN=2727 npm run test:soak
```

For a shorter check while developing:

```bash
SITE_URL=https://bazandnobbyschool.pages.dev ADMIN_PIN=2727 npm run test:soak:quick
```

The soak test repeatedly:

- picks random synthetic test dates;
- adds/removes random players;
- checks exact-date persistence;
- edits competitions;
- locks/unlocks dates;
- verifies locked public writes are blocked;
- verifies cutoff blocking;
- reads the full schedule repeatedly;
- checks there are no duplicate players;
- writes a report to `test/reports/`.

## Report output

Soak reports are written as both JSON and Markdown:

```text
test/reports/soak-<RUN_ID>.json
test/reports/soak-<RUN_ID>.md
```

A good one-hour report should end with something like:

```json
{
  "passed": true,
  "iterations": 700,
  "failures": 0,
  "averageMs": 120,
  "slowestMs": 900
}
```

## Important

The live and soak tests intentionally use dates in 2099 so they do not appear in the normal 2026 weekend UI. They also call the new admin cleanup endpoint at the end.


## v8 add confirmation coverage

The quick regression suite now fails if the UI no longer prompts before adding a player. The live and soak suites continue to validate the API/data layer repeatedly; the add confirmation itself is a browser/UI guard and is covered by static regression checks.
