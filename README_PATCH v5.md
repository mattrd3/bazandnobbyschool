# bazandnobbyschool Cloudflare D1 v5 — booking window fix

Replace these files in your GitHub repo:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`

Do not overwrite `wrangler.toml`.

## Fixes

- Public users can still view players for future dates inside the booking window, but cannot add/remove themselves once sign-up has closed.
- Sign-up closes 10 local calendar days before the playing date at 6:50pm UK time.
  - Saturday closes on the Wednesday 10 days before.
  - Sunday closes on the Thursday 10 days before.
- Admin can still amend closed/locked dates.
- API now enforces the booking window too, so it cannot be bypassed by a direct request.
- UI now shows the close time and explains that closed lists remain visible.

## Tests

The test suite now checks the Wednesday/Saturday and Thursday/Sunday cutoff calculations, API lock behaviour, dropdown cleanliness, WhatsApp buttons, competition-edit safety, and UI close-window messaging.
