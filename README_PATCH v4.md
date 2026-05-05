# bazandnobbyschool Cloudflare D1 v4 patch

Replace these files in your GitHub repo:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`

Do not overwrite your existing `wrangler.toml` because it contains your real D1 database ID.

## Changes in v4

- Removed competition names from the weekend dropdown.
- Dropdown now only shows labels like `This weekend — 9 – 10 May`.
- Kept the competition name visible on the selected day card, where it belongs.
- Kept v3 fixes: 8-week public dropdown limit, admin WhatsApp reminder/confirmed list, safer competition edit reset.
- Updated tests to ensure competition names do not appear in dropdown labels.
