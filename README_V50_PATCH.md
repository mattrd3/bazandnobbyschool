# Weekend Golf v50 Patch

## Purpose

Small, low-risk patch on top of the stable v49 rollback baseline.

## Changes

- Adds a more obvious admin-only `Copy WhatsApp draw message` button directly inside the draw panel, immediately below the `🎲 TEE TIME DRAW` banner.
- Keeps the existing draw logic unchanged.
- Removes early/late tee preference indicators from the draw display so the draw does not flag who requested early or late.
- The copied WhatsApp draw message continues to include tee times/groups/player names only, with no early/late preference detail.

## Files changed

- `public/index.html`
- `package.json`
- `test/run-tests.js` included unchanged for convenience

## Database changes

None.

## Deployment notes

Do not overwrite `wrangler.toml`. It is not included in this patch.
