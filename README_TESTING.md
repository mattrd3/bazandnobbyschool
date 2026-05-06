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

## v15 additions

This release adds player PIN identity, admin-managed PINs, early tee priority and a visible audit log.

New quick checks:

- public users must log in with their own player PIN before changing status;
- a logged-in player cannot change someone else's booking;
- admin can create/clear player PINs in-app;
- admin can mark confirmed players as early tee priority;
- generated draws place priority players into the earliest groups;
- admin activity log records actor, action and before/after state.

Run:

```powershell
npm test
$env:SITE_URL="https://bazandnobbyschool.pages.dev"; $env:ADMIN_PIN="2727"; npm run test:live
$env:SITE_URL="https://bazandnobbyschool.pages.dev"; $env:ADMIN_PIN="2727"; npm run test:soak:quick
```


## v15 removed Maybe status

The Maybe playing feature has been removed. Tests now confirm the UI no longer shows Maybe controls and the API rejects `status: "maybe"` with a 400 response. Existing stored `maybes` values are ignored when schedules are read.


## v20 additions

This release adds a weekend-navigation UI fix:

- when the user changes weekend from the dropdown, the selected day now resets to Saturday for the newly selected weekend;
- moving from a Sunday view to another weekend no longer carries Sunday across;
- the visible app version marker is now `LIVE- v20`.

The quick regression suite now checks that weekend changes explicitly call `setActiveDay("sat")`.


## v21 additions

This release adds a logged-in-player ordering improvement:

- when a player is logged in, their own row is pinned to the top of each open booking list;
- if the date is locked/closed and that logged-in player is confirmed, their row remains at the top;
- if the date is locked/closed and that logged-in player is not playing, the normal confirmed-players-first order is preserved;
- the visible app version marker is now `LIVE- v21`.

The quick regression suite now checks the pinning helper and the locked/not-playing exception.


## v22 additions

This release adds a logged-in player UI cleanup:

- once a player successfully logs in, the large player login box is hidden;
- a compact `LOG OFF <name>` button appears in the top-right header below the admin button;
- selecting log off clears the saved player PIN/session flag and brings the login box back;
- the visible app version marker is now `LIVE- v22`.

The quick regression suite now checks that the logged-in logout button exists and that the login panel is only rendered when no player is logged in.


## v23 additions

This release makes the admin activity log DB-first and live-refreshing:

- new activity events are written to the dedicated D1 `audit_events` table instead of being appended into each day JSON blob;
- legacy `day.audit` entries are migrated into `audit_events` the first time that day's log is opened;
- the admin activity panel now reads directly from `/api/admin/audit` and refreshes every 5 seconds while open;
- after admin/player changes, the open activity log is refreshed from D1 immediately;
- the visible app version marker is now `LIVE- v23`.

The quick regression suite now checks DB-backed audit reads, legacy audit migration, and the live DB activity-log UI.


## v24 additions

This release makes the DB-backed activity log more descriptive:

- each new audit event includes the amended booking `dateKey` and a readable day/date label, for example `Sunday 7 June`;
- player booking changes show the affected player, date and previous/new status;
- admin lock/unlock, draw, priority and competition changes include the affected booking date and useful context;
- no new D1 table or SQL migration is required because the extra context is stored in the existing `details` field;
- the visible app version marker is now `LIVE- v24`.

The quick regression suite now checks descriptive date/context fields in DB audit events and the activity-log display copy.


## v25 additions

This patch saves header UI space by moving the visible live/version status into the top-left of the sticky header.

Expected behaviour:

- the app still shows the visible marker `LIVE- v25`;
- the marker appears at the top-left of the header rather than underneath the main title/subtitle;
- the admin button and player log-off button remain on the top-right;
- no database or SQL changes are required.


## v26 compact header/banner
- Top header/banner is slimmer to save vertical UI space.
- Golf icon and `WHO'S PLAYING?` message are retained.
- `LIVE- v26` remains in the top-left and admin/logoff controls remain top-right.

## v27 mobile-safe header controls and clickable release notes

This patch reorganises the sticky header to avoid long logged-in player names overlapping the app logo/title on mobile.

- the player logoff control moves to the top-left;
- the logoff control is now a compact two-row button with `LOG OFF` above the logged-in player name;
- the logged-in player name is displayed in capitals for consistency with the other header buttons;
- long player names are safely truncated instead of overwriting the logo/title;
- the Admin button remains top-right;
- `LIVE- v27` moves under the Admin button and is clickable;
- clicking the version label opens an in-app release notes modal covering recent changes.
