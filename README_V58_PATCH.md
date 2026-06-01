# Weekend Golf v58 — BRS tee-time extraction from copied text

## Summary
Adds a practical tee-time helper inside the existing admin-only BRS reconciliation modal.

Admins can paste copied BRS tee sheet text, preview detected tee times, and apply those tee times to the selected day with one button.

## Included
- Detects tee times in pasted BRS text using formats like `08:08` or `8.16`.
- Shows detected tee times before saving.
- Shows current app tee times for comparison.
- Adds button: `Use detected tee times for <date>`.
- Keeps the existing manual `Add/Edit tee times` option.
- Uses the existing `admin/tee-times` API endpoint and audit trail.

## Not included
- No screenshot/image OCR.
- No automatic saving without admin confirmation.
- No database schema change.

## Files changed
- `public/index.html`
- `package.json`
- `test/run-tests.js` (included for alignment)
- `functions/api/[[path]].js` (included for alignment)

## Deployment
Replace the matching files in GitHub. Do not overwrite `wrangler.toml`.
