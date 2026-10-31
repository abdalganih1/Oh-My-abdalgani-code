-- v2.5: self-service accounts, student-controlled caps, abuse detection, live logs.

-- Students register themselves (credit still only comes from activation codes).
ALTER TABLE users ADD COLUMN password_hash TEXT;            -- pbkdf2$<iter>$<salt>$<hash>
ALTER TABLE users ADD COLUMN self_signup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN created_ip TEXT;
ALTER TABLE users ADD COLUMN login_fail INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;
-- spending caps the student controls (µ$). Daily is mandatory: starts at $5, can't be removed.
ALTER TABLE users ADD COLUMN daily_cap INTEGER NOT NULL DEFAULT 5000000;
ALTER TABLE users ADD COLUMN monthly_cap INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip         TEXT,
  ua         TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One row per (rule, subject, day) so a detector never spams the same alert.
CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule       TEXT NOT NULL,
  user_id    INTEGER,
  ip         TEXT,
  day        TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'warn',   -- info | warn | high
  message    TEXT NOT NULL,
  data       TEXT,
  action     TEXT,                           -- what the system already did (e.g. paused key)
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (rule, user_id, ip, day)
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(resolved, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_ip_time ON usage_logs(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_users_created_ip ON users(created_ip, created_at);

-- new knobs merged into the existing security settings
UPDATE settings SET value = json_patch(value, '{
  "user_cap_default_usd": 5,
  "user_cap_max_usd": 50,
  "signup_mode": "open",
  "signup_per_ip_day": 3,
  "alert_daily_requests": 1500,
  "alert_spike_factor": 4,
  "alert_ips_per_user": 4,
  "alert_users_per_ip": 4,
  "alert_error_rate": 0.5,
  "loop_guard_repeats": 25,
  "loop_guard_window_s": 120,
  "loop_guard_pause_min": 10
}') WHERE key = 'security';
