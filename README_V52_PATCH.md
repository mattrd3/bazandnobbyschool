# Weekend Golf App v52 Patch — Admin Menu Order Cleanup

## Purpose

This is a small UI-only patch on top of v51. It reorders the admin menu so the most frequently used operational controls appear first and the rarely used roster management section moves to the bottom.

## Changes

- Moved **Lock list & generate draw** to the top of the admin menu.
- Kept **Re-draw** directly underneath when the list is locked.
- Grouped the WhatsApp copy actions directly after the lock/draw controls:
  - Confirmed attendee list
  - Day-by-day reminder
  - Not-booked weekend list
- Moved **BRS reconciliation helper** after the WhatsApp tools.
- Moved **Add/Edit day booking message** after BRS reconciliation.
- Moved **Roster Management** to the end of the admin menu.
- No booking, draw, reminder, BRS, API, or database logic changed.

## Files to replace

- `public/index.html`
- `package.json`
- `test/run-tests.js`

## Database changes

None.

## Deployment note

Do not overwrite `wrangler.toml`.
