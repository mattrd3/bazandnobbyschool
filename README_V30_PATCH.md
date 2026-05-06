# v30 patch — not-booked WhatsApp copy message

This patch adds a third admin WhatsApp copy option for the selected weekend.

## Changes

- Version bumped to `v30`.
- Package version bumped to `1.0.30`.
- Admin controls now include `Copy not-booked weekend list for WhatsApp`.
- The message lists roster players who are not booked for either Saturday or Sunday in the currently selected weekend.
- Existing confirmed-attendee and sign-up reminder copy buttons remain unchanged.

## Notes

- No D1 schema changes required.
- `wrangler.toml` is intentionally not included.
