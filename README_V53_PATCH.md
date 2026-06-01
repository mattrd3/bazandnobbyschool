# Weekend Golf v53 Patch — Quick Booking View

## Summary

v53 adds a simpler logged-in player booking experience while preserving the existing full booking list and admin controls.

## Changes

- Adds a new Quick Booking section for logged-in non-admin users.
- Shows the next 8 weekends as separate Saturday/Sunday cards.
- Each card shows:
  - day and date
  - competition name
  - current player status
  - booking close time
  - clear booking buttons
- If the player has not responded, they see:
  - Yes, I’m playing
  - No, unavailable
- If already Playing, only one action is shown:
  - Change to unavailable
- If already Unavailable, only one action is shown:
  - Change to Playing
- Day-specific booking messages still appear before marking Playing.
- Quick Booking uses the same locked/cutoff rules as the full booking list.
- Closed/locked cards show a clear reason and ask the player to contact admin.
- Full booking list remains available below.
- Adds booking source tracking for changes made from:
  - Quick Booking
  - Full list
  - Admin
- Adds admin reporting summary for booking method usage.

## Files changed

- public/index.html
- functions/api/[[path]].js
- package.json
- test/run-tests.js

## Database update

No manual D1 schema update is required.

Source tracking is stored in the existing `audit_events.details` JSON for new booking changes. Older historic booking changes will show as older/untracked in the usage summary.

## Deployment note

Do not overwrite `wrangler.toml`.

## Testing

Validated with:

```bash
node --check frontend.js
node --check functions/api/[[path]].js
npm test
```
