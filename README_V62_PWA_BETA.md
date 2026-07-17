# Weekend Golf v62 — Installable PWA beta

## What changed
- One shared Weekend Golf PWA for Full View and Simple View.
- Full app: installation is available inside Help, alongside Open Simple View.
- Simple View: an install banner appears at the bottom in browser mode and hides in installed/standalone mode.
- The installed icon launches `/launch/`, which opens the last view selected on that device.
- `/api/*` is network-only and is never cached. Navigation is network-first with a simple offline page.

## Files to upload
- `public/index.html`
- `public/simple/index.html`
- `public/launch/index.html`
- `public/manifest.webmanifest`
- `public/service-worker.js`
- `public/offline.html`
- `public/icons/*`
- `package.json`
- `test/run-tests.js`

No API file, D1 migration, or wrangler.toml change is required.
