# Weekend Golf v57 Patch — Quick Booking text cleanup

Small UI cleanup on top of v56.

## Changes

- Removed the extra explanatory sentence under the QUICK BOOKING banner when the full-list view is active:
  - "Optional simpler view. The normal full-list view is still the default."
- Kept the full booking list as the default view.
- Kept the QUICK BOOKING banner/button directly below MY BOOKINGS.
- Kept the existing behaviour where opening Quick Booking hides the full-list booking screen to reduce confusion.

## Files changed

- `public/index.html`
- `package.json`
- `test/run-tests.js` included for alignment from v56
- `functions/api/[[path]].js` included for alignment from v56, unchanged

## Database

No D1 migration required.

## Deployment note

Do not overwrite `wrangler.toml`.
