CREATE TABLE IF NOT EXISTS days (
  dateKey TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_days_updatedAt ON days(updatedAt);
