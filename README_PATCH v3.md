# bazandnobbyschool Cloudflare D1 v3 patch

Replace these files in your GitHub repo:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`

Do not overwrite your `wrangler.toml` if it already contains your real D1 database UUID.

## Changes

- Non-admin users see only 8 future weekends in the weekend dropdown.
- Admin users retain the wider admin range.
- Restored WhatsApp reminder copy button in admin mode.
- Restored WhatsApp confirmed attendee list copy button in admin mode.
- Competition edit is now tied to the current selected date only. Changing date/weekend while editing closes the draft to prevent accidental carry-over.
- Added a Cancel button for competition edits.
- Added static/UI tests for the above.
