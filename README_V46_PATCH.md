# Weekend Golf v46 Patch

Incremental patch based on the v45 patch / v44 live baseline.

## Included changes

### BRS reconciliation helper
- Adds an admin-only BRS reconciliation helper.
- Admin can paste copied BRS tee sheet / booking text for the selected day.
- The app checks the pasted BRS text against the selected day's confirmed Weekend Golf players.
- Results show:
  - confirmed in Weekend Golf and found in BRS
  - confirmed in Weekend Golf but not found in BRS
  - found in BRS text but not marked Playing in Weekend Golf
  - confirmed players without a BRS full-name mapping
- Includes a WhatsApp-friendly copy summary.

### Nickname to BRS full-name map
- Adds an editable admin-only map from app nickname/short name to BRS full name.
- Supports multiple possible BRS names per app player, separated by commas.
- Stored in the existing `days` table as config JSON under `__config_brs_name_map__`.
- No D1 migration is required.

### Compact admin menu
- Moves the growing admin controls behind a compact `☰ ADMIN MENU` toggle.
- Keeps the main booking screen cleaner while preserving existing admin tools.
- Reporting remains admin-only and is accessed from the compact admin menu bar.

### Day message editor
- Adds the missing admin UI for editing the v45 day-specific booking message.
- Users still see the message before confirming Playing.

## Files changed

- `public/index.html`
- `functions/api/[[path]].js`
- `package.json`
- `test/run-tests.js`
- `README_V46_PATCH.md`

## Database changes

No schema migration required.

The BRS name map is stored as JSON in the existing `days` table, similar to existing config records.

## Deployment note

Do not overwrite the live `wrangler.toml`.
