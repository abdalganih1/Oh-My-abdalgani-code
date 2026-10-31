-- v2.3: finance & reports — what we pay providers vs what students paid us.

-- what this request really cost US upstream (µ$). OpenRouter-style reported cost, else the
-- route's cost table, else the model's price without markup; 0 on fixed-fee plans.
ALTER TABLE usage_logs ADD COLUMN upstream_cost INTEGER NOT NULL DEFAULT 0;

-- how a provider bills us: 'usage' (pay per request) or 'subscription' (fixed monthly fee)
ALTER TABLE providers ADD COLUMN billing TEXT NOT NULL DEFAULT 'usage';
ALTER TABLE providers ADD COLUMN monthly_fee INTEGER NOT NULL DEFAULT 0;   -- µ$ / month

-- optional upstream price per route (µ$ / 1M tokens) for usage-billed providers
ALTER TABLE model_routes ADD COLUMN cost_in INTEGER;
ALTER TABLE model_routes ADD COLUMN cost_out INTEGER;

-- real money the student paid for a coupon / grant (µ$); face value ≠ price (e.g. 10M tokens sold for $3)
ALTER TABLE coupons ADD COLUMN sale_price INTEGER;                          -- per use
ALTER TABLE subscriptions ADD COLUMN sale_price INTEGER NOT NULL DEFAULT 0;

-- anything else paid out: top-ups, one-off plans, domains…
CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  amount      INTEGER NOT NULL,              -- µ$
  note        TEXT,
  spent_at    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_expenses_time ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS idx_subs_created ON subscriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_model_time ON usage_logs(model_id, created_at);

-- coding plans are flat monthly subscriptions; set the fee in the admin panel
UPDATE providers SET billing = 'subscription' WHERE id IN ('zai', 'nvidia');
