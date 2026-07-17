CREATE TABLE IF NOT EXISTS push_reminder_log (
  reminderKey TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  playerName TEXT NOT NULL,
  dateKey TEXT NOT NULL,
  sentAt INTEGER NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (reminderKey, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_reminder_log_date ON push_reminder_log (dateKey, sentAt);
