# Weekend Golf v64.1 reminder route fix

The existing `functions/api/[[path]].js` catch-all intercepts `/api/cron/booking-reminders`.

This patch moves the reminder Function to:

`functions/cron/booking-reminders.js`

The GitHub Action now calls:

`https://bazandnobbyschool.pages.dev/cron/booking-reminders`

Delete the old conflicting file if present:

`functions/api/cron/booking-reminders.js`

No secret, D1, or wrangler changes are required.
