# Weekend Golf v49 Emergency Rollback

This package restores the known-good v46 code path after the v47/v48 frontend issue.

## Replace in GitHub

- public/index.html
- functions/api/[[path]].js
- package.json
- test/run-tests.js

Optional:

- README_V49_ROLLBACK.md

## Notes

- No D1 database changes are required.
- Do not overwrite wrangler.toml.
- This restores v46 functionality: admin menu, BRS reconciliation, day messages, early/late tee preference.
- It removes the v47 draw-heading WhatsApp button change until it can be safely reworked.
