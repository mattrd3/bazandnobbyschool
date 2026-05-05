# Baz and Nobby School v20 patch

Changed files:

- `public/index.html`
- `test/run-tests.js`
- `package.json`
- `README_TESTING.md`

Do not overwrite `wrangler.toml`. It is intentionally not included in this patch zip.

## v20 change

When a user changes weekend using the weekend dropdown, the selected day now resets to Saturday for the newly selected weekend.

Example: if the user is viewing Sunday 31 May and changes to weekend 6–7 June, the app now selects Saturday 6 June by default.

## Validation

Ran:

```bash
npm test
```

Result:

```text
PASS: 27 API/helper tests passed
PASS: v20 UI regression checks passed
```
