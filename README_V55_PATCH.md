# Weekend Golf v55 Patch - Quick Booking isolated view

## Summary

This patch keeps the normal full-list booking screen as the default, but makes the optional Quick Booking mode more clearly separate.

When a logged-in non-admin player opens Quick Booking, the normal weekend selector, Saturday/Sunday tabs and full player list are hidden. The player can return using the top button.

## Changes

- Version bumped to v55 / 1.0.55.
- Quick Booking remains optional and off by default.
- Button now says `Back to full booking list` when Quick Booking is open.
- Quick Booking open-state helper text now says the full booking list is hidden to keep the view simple.
- Full-list controls are no longer shown underneath Quick Booking, preventing confusion with the selected Saturday/Sunday date.
- Booking rules, cutoff rules, admin lock rules and source tracking are unchanged.

## Files changed

- public/index.html
- package.json
- test/run-tests.js

## Database changes

None.

## Deployment note

Do not overwrite wrangler.toml.
