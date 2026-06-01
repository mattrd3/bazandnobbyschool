# Weekend Golf v59 Patch — Smarter BRS Tee-Time Matching

## What changed

The BRS reconciliation tee-time helper is now more selective. Instead of suggesting every tee time found in pasted BRS text, it only suggests tee times where the surrounding BRS line/block appears to contain one of the confirmed Weekend Golf players for the selected day.

This uses the existing nickname-to-BRS-full-name map, so app nicknames can still match BRS full names.

## Behaviour

- Paste copied BRS tee sheet text as before.
- The helper scans for tee times.
- It checks the nearby lines for confirmed Weekend Golf players or their mapped BRS names.
- Only matched tee times are shown.
- Other tee times from unrelated groups are ignored.
- Nothing is saved until admin presses the confirm button.
- Manual tee-time editing remains available.

## Files changed

- `public/index.html`
- `package.json`
- `test/run-tests.js`

`functions/api/[[path]].js` is included for alignment but unchanged from v58.

No D1 schema update is needed. Do not overwrite `wrangler.toml`.
