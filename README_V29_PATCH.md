# v29 personal weekend booking icons patch

This patch replaces the v28 open/closed weekend selector icons with personalised booking indicators for the logged-in player.

- `🟢🟢` = logged-in player is booked Saturday and Sunday.
- `🟢` = logged-in player is booked on one of the two days.
- `🔴` = logged-in player is not booked that weekend.

The lookup is DB-backed via `/api/player/weekend-summary`, so different players can see different dropdown indicators.

`wrangler.toml` is not included in this patch.
