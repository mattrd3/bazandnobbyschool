# Weekend Golf v48 Hotfix

Emergency hotfix following the v47 WhatsApp draw-copy UI change.

## Fix

- Corrected a frontend JavaScript syntax issue that could cause the app to render a blank screen.
- Preserves the v47 behaviour: the WhatsApp draw-copy button appears beside the draw heading, and early/late tee preference details remain hidden from the visible draw and copied WhatsApp message.

## Files changed

- `public/index.html`
- `package.json`
- `README_V48_HOTFIX.md`

## Database changes

None.

## Deployment note

Do not overwrite `wrangler.toml`. This patch does not include it.
