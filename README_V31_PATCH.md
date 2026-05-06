# v31 Shorter weekend dropdown wording patch

Replace these files in the repo root:

- `public/index.html`
- `functions/api/[[path]].js`
- `test/run-tests.js`
- `test/live-api-tests.js`
- `test/soak-test.js`
- `package.json`
- `README_TESTING.md`

Do not overwrite `wrangler.toml`.

## Change

- Future weekend selector labels now use shorter week-based wording: `In 1 week`, `In 2 weeks`, etc.
- Personal booking icons remain unchanged.
- No SQL or D1 schema change is required.
