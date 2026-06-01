# Weekend Golf v54 - Optional Quick Booking toggle

## Summary

This patch changes Quick Booking so the full booking list remains the default view. Logged-in non-admin players can now open Quick Booking using a clear top button.

## Changes

- Full list view is the default again.
- Added a top Quick Booking toggle for logged-in non-admin users.
- Quick Booking is shown above the weekend/date selector when enabled, avoiding confusion with the Saturday/Sunday date tabs.
- Existing Quick Booking behaviour remains: day-by-day cards, one opposite-status change button, clear closed/locked messages, day-specific booking-message confirmation, and booking source tracking.

## Files changed

- public/index.html
- package.json
- test/run-tests.js

No D1 database migration is required.

Do not overwrite wrangler.toml.
