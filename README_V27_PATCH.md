# v27 mobile-safe header controls and clickable release notes

Replace these files in the Cloudflare Pages project:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `test/live-api-tests.js`
- `test/soak-test.js`
- `package.json`
- `README_TESTING.md`

Do not overwrite `wrangler.toml`.

Changes:

- moved the logged-in player logoff control to the top-left;
- changed it to a compact two-row button: `LOG OFF` plus the player name;
- displays the player name in capitals and truncates long names safely;
- moved the live/version label to the top-right under Admin;
- made the version label clickable to show recent release notes.
