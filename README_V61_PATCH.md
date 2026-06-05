# Weekend Golf v61 - WhatsApp message copy cleanup

This patch is based on v60.

## Changes

1. Confirmed attendee WhatsApp copy
   - Adds tee-time information between the competition and player list.
   - If tee times are already saved, the message shows the confirmed tee times.
   - If tee times are not saved yet, the message shows the number of tee times needed using the existing app calculation.

2. Day-by-day reminder WhatsApp copy
   - Keeps Saturday and Sunday grouped separately.
   - Adds day-specific deep links for each day that needs a response, for example `?date=YYYY-MM-DD&day=sat` or `?date=YYYY-MM-DD&day=sun`.
   - The app now reads those links and opens the matching weekend/day.

3. Weekend not-booked WhatsApp copy
   - Clarifies the wording so it lists players with no response for either Saturday or Sunday.
   - The existing logic already excluded anyone who had responded on at least one day; this patch makes that clearer in the copy.

4. BRS reconciliation wording
   - Updates the result labels and copied summary to make the required action clearer:
     - Confirmed and found in BRS (no action needed)
     - Confirmed in Weekend Golf App but not found in BRS (need adding in BRS)
     - Found in BRS but not confirmed in Weekend Golf App (need removing from BRS)

## Files changed

- public/index.html
- package.json
- test/run-tests.js

functions/api/[[path]].js is included for alignment but unchanged from v60.

No D1 schema update is required.
Do not overwrite wrangler.toml.
