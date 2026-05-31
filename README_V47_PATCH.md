# Weekend Golf App v47 Patch

Incremental patch on top of v46.

## Changes

- Moves the admin WhatsApp draw copy action into the draw heading beside “TEE TIME DRAW”.
- Keeps the button visible with the draw details instead of hiding it as a final draw group/admin-menu-style action.
- Removes early/late tee preference markers from the visible draw output. The preferences still guide the draw, but players do not see who requested early or late.
- Confirms the WhatsApp draw copy continues to list only tee times/groups/player names and does not expose early/late preference details.

## Files changed

- `public/index.html`
- `package.json`
- `test/run-tests.js`
- `README_V47_PATCH.md`

## Database changes

None.

## Deployment note

Do not overwrite `wrangler.toml`. This patch does not include it.
