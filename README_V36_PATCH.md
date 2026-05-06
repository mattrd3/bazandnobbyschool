# v36 — Admin booking stats

## Summary

Adds an admin-only Booking Stats panel so the organiser can review player activity over time without taking up space on the normal booking screen.

## Changes

- App version bumped to `v36`.
- Package version bumped to `1.0.36`.
- Added DB-backed admin endpoint: `/api/admin/booking-stats`.
- Added admin-only `📊 Booking stats` button in Admin Controls.
- Booking Stats panel shows each roster player’s:
  - booked days,
  - unavailable days,
  - no-response days.
- Added period filters:
  - Last 4 weeks,
  - Last 8 weeks,
  - Last 12 weeks,
  - All time.
- Added sorting:
  - Most booked,
  - Least booked,
  - Most no response.
- Help panel now mentions Booking Stats.

## Database / SQL

No new SQL table or schema migration is required.

The stats are calculated from existing booking/status data, including the existing `player_status` and day records.

## Files changed

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `package.json`
- `README_TESTING.md`

## Test result

```text
PASS: 33 API/helper tests passed
PASS: v36 UI regression checks passed
```

## Important

`wrangler.toml` is intentionally not included in the patch.
