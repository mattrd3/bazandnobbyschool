# bazandnobbyschool release note — v44

## v44 — Tee-time admin control fix

Produced: 2026-05-22

Base inspected:
- Uploaded live `public/index.html`
- Uploaded live `functions/api/[[path]].js`

Changes:
- Added the missing admin-facing **Add tee times / Edit tee times** control beside the confirmed player / tees-needed summary.
- Existing v43 tee-time behaviour remains unchanged:
  - tee times are saved through `/api/admin/tee-times`
  - saved tee times display compactly under the confirmed/tees-needed summary
  - calendar invites use the first saved tee time plus five hours
  - draw display and WhatsApp draw copy include tee times

Deployment notes:
- Copy the patch contents into the repo root, replacing matching files.
- `wrangler.toml` is intentionally not included.
- No SQL or D1 schema change is required.
