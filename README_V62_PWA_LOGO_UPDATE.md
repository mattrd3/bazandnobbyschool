# Weekend Golf v62 PWA Logo Update

This release keeps the existing v62 PWA functionality and replaces the installed-app artwork with the approved Weekend Golf landscape logo.

## Add or replace

- public/index.html
- public/simple/index.html
- public/manifest.webmanifest
- public/service-worker.js
- public/icons/icon-192-v2.png
- public/icons/icon-512-v2.png
- public/icons/maskable-512-v2.png
- public/icons/apple-touch-icon-v2.png

The remaining files are included so the ZIP can also be used as a complete v62 PWA release.

No API, D1, migration, or wrangler.toml change is required.

## Existing installations

Android/Chromium should detect the changed manifest and versioned icon URLs, though icon refresh timing is controlled by the browser/OS. iPhone users may need to remove and reinstall the home-screen app to see the new icon immediately.
