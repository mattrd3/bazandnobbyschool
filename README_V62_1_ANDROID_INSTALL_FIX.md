# Weekend Golf v62.1 Android installation fix

This release corrects the Full View installation experience.

Changes:
- The Full View button always says INSTALL APP.
- On tap, the app waits for Chrome's native install event rather than falling back immediately.
- If Chrome still does not offer the native prompt, Android-specific instructions are shown.
- The service-worker cache and manifest query have been versioned to ensure the updated shell loads.

No API, D1, migration, or wrangler.toml changes are required.
