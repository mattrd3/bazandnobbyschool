# Weekend Golf v63 Push Beta

## Scope
- Opt-in Web Push subscription per device and player.
- Notification settings page linked from Full and Simple View.
- Admin subscriber list and harmless test-send facility.
- Push display and click handling in the shared service worker.
- No automatic reminders yet.

## Required Cloudflare Pages environment variables
Generate keys locally with `npm run generate:vapid`, then add these under **Workers & Pages → bazandnobbyschool → Settings → Variables and Secrets** for Production (and Preview if required):
- `VAPID_PUBLIC_KEY` — plain text is acceptable.
- `VAPID_PRIVATE_KEY` — store as an encrypted secret.
- `VAPID_SUBJECT` — use `mailto:your-real-email-address`.

Never commit the private key to GitHub. Keep the same key pair permanently; changing it requires every device to subscribe again.

## D1
The API creates the table safely on first use. `migrations/0005_push_subscriptions.sql` is also included for explicit/manual schema management.

## Testing
1. Deploy and add the three VAPID variables.
2. Open the installed PWA and log in as a player.
3. Open Notification Settings and tap Turn On Notifications.
4. Log into Admin in Full View, reopen Notification Settings, enter the admin PIN and load subscribers.
5. Select the player and send a test.

On iPhone/iPad, Web Push requires the app to be added to the Home Screen and notification permission must be requested from a user tap.
