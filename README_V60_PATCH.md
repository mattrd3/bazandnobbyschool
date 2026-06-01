# Weekend Golf App v60 - Tighter BRS tee-time matching

## Purpose
Fixes overly loose BRS tee-time detection where short app names or nicknames could match the wrong BRS player, for example Dean matching unrelated Dean entries or shared-name players.

## What changed
- Tee-time extraction now requires exact, stronger BRS name matching.
- Single-word app names/nicknames are ignored for tee-time matching unless a reliable explicit BRS map exists.
- Single-word mapped names are only used when unique enough in the pasted BRS text.
- The BRS reconciliation helper highlights confirmed players that need a stronger BRS full-name map.
- Helper text now advises admins to enter full BRS names, e.g. `Dean Morris` rather than `Dean`.

## Files changed
- public/index.html
- package.json
- test/run-tests.js
- README_V60_PATCH.md

No database schema update is required.

Do not overwrite wrangler.toml.
