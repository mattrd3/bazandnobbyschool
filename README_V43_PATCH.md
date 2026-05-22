# v43 Patch — Tee times, smarter calendar and draw tee-time display

Built from the uploaded live/main v42 codebase.

## Changes

- Added optional admin tee-time entry for each day.
- Tee-time entry adapts to the number of tee times needed from the confirmed player count.
- Saved tee times display compactly under the confirmed-player / tees-needed summary.
- If no tee times are saved, nothing extra is displayed to normal users.
- Google Calendar invite now uses the first saved tee time as the start time and ends five hours later.
- If no tee times are saved, Google Calendar invite defaults to 08:00–13:00.
- Draw display now shows saved tee times against groups where available.
- Admin WhatsApp draw copy now includes tee times where available.
- Existing draw rules are preserved.
- No D1 schema or SQL change is required.

## Files changed

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `package.json`
- `README_TESTING.md`

## Not included

- `wrangler.toml` is intentionally not included.
