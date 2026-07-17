CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  playerName TEXT NOT NULL,
  subscriptionJson TEXT NOT NULL,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  lastSuccessAt INTEGER,
  lastFailureAt INTEGER,
  lastFailureStatus INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_player ON push_subscriptions (playerName, enabled);
