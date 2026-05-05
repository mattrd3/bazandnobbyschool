# v25 patch - top-left live status

This patch moves the visible live/version status into the top-left of the header to save vertical UI space.

## Files included

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `test/live-api-tests.js`
- `test/soak-test.js`
- `package.json`
- `README_TESTING.md`

`wrangler.toml` is intentionally not included.

## Notes

No SQL migration is required for v25.
