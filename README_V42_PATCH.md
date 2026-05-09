# v42 Current-weekend dropdown fix

## Summary
- Fixes the weekend dropdown calculation so `This weekend` stays on the current Saturday/Sunday during Saturday and Sunday.
- The app only rolls forward to the next weekend after Monday 00:01 UK/local time.
- Keeps the existing Saturday-default behaviour when changing weekends.

## Files changed
- `public/index.html`
- `package.json`
- `test/run-tests.js`
- `README_TESTING.md`

## Notes
- No SQL or D1 schema change required.
- `wrangler.toml` is intentionally not included in the patch zip.
