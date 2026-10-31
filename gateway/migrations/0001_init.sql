-- abdalgani gateway — D1 schema
-- All money is stored in micro-USD (1 USD = 1_000_000) as INTEGER to avoid float drift.

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  note        TEXT,
  disabled    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'default',
  key_hash    TEXT NOT NULL UNIQUE,
  prefix      TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- Upstream providers (z.ai coding plan, OpenRouter, Anthropic, OpenAI, ...)
CREATE TABLE IF NOT EXISTS providers (
  id                 TEXT PRIMARY KEY,          -- slug: zai, openrouter, anthropic, openai
  name               TEXT NOT NULL,
  openai_base_url    TEXT,                      -- base that hosts /chat/completions
  anthropic_base_url TEXT,                      -- base that hosts /v1/messages (nullable)
  auth_style         TEXT NOT NULL DEFAULT 'bearer', -- bearer | x-api-key
  extra_headers      TEXT,                      -- JSON object
  enabled            INTEGER NOT NULL DEFAULT 1,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Many keys per provider → load-balancing + failover. Keys are AES-GCM encrypted.
CREATE TABLE IF NOT EXISTS provider_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  key_enc        TEXT NOT NULL,
  key_hint       TEXT NOT NULL,                 -- last 4 chars, for display
  enabled        INTEGER NOT NULL DEFAULT 1,
  weight         INTEGER NOT NULL DEFAULT 1,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  fail_count     INTEGER NOT NULL DEFAULT 0,
  used_count     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Model categories that coupons/subscriptions can be bound to.
CREATE TABLE IF NOT EXISTS model_groups (
  id          TEXT PRIMARY KEY,                 -- e.g. coding, premium, cheap
  name        TEXT NOT NULL,
  description TEXT
);

-- Public models (what users see / request).
CREATE TABLE IF NOT EXISTS models (
  id              TEXT PRIMARY KEY,             -- public id, e.g. glm-5.2
  name            TEXT NOT NULL,
  group_id        TEXT REFERENCES model_groups(id) ON DELETE SET NULL,
  context_length  INTEGER NOT NULL DEFAULT 128000,
  max_output      INTEGER NOT NULL DEFAULT 8192,
  reasoning       INTEGER NOT NULL DEFAULT 0,
  -- pricing_mode: token    = admin price table (micro-USD per 1M tokens)
  --               request  = flat price per request
  --               provider = cost reported by the upstream (e.g. OpenRouter usage.cost), else token table
  pricing_mode    TEXT NOT NULL DEFAULT 'token',
  price_in        INTEGER NOT NULL DEFAULT 0,   -- micro-USD per 1M input tokens
  price_out       INTEGER NOT NULL DEFAULT 0,   -- micro-USD per 1M output tokens
  price_cache_read INTEGER NOT NULL DEFAULT 0,  -- micro-USD per 1M cached input tokens
  price_request   INTEGER NOT NULL DEFAULT 0,   -- micro-USD per request
  markup_pct      INTEGER NOT NULL DEFAULT 0,   -- added on top of computed cost
  status          TEXT NOT NULL DEFAULT 'active', -- new | active | legacy | hidden
  description     TEXT,
  sort            INTEGER NOT NULL DEFAULT 100,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Routing table (OpenRouter style): one public model → ordered upstream routes.
CREATE TABLE IF NOT EXISTS model_routes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id       TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  upstream_model TEXT NOT NULL,
  priority       INTEGER NOT NULL DEFAULT 0,    -- lower = tried first
  enabled        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_routes_model ON model_routes(model_id);

-- Coupons: the ONLY way a user gets credit. No self sign-up, no purchase, no trial.
CREATE TABLE IF NOT EXISTS coupons (
  code            TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,                -- usd | tokens
  amount          INTEGER NOT NULL,             -- micro-USD or tokens
  group_id        TEXT REFERENCES model_groups(id) ON DELETE SET NULL, -- NULL = all models
  valid_days      INTEGER NOT NULL DEFAULT 30,  -- subscription lifetime after redemption
  max_uses        INTEGER NOT NULL DEFAULT 1,
  used_count      INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER,                      -- coupon must be redeemed before this
  note            TEXT,
  disabled        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (coupon_code, user_id)
);

-- A subscription = one wallet created from a coupon (or granted by admin).
CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                    -- usd | tokens
  group_id    TEXT REFERENCES model_groups(id) ON DELETE SET NULL,
  total       INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  source      TEXT,                             -- coupon:<code> | admin
  starts_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER,
  disabled    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

-- Per-user model switching: tools point at stable aliases (abd-main, abd-fast...)
-- and the student re-maps them from the dashboard without touching their tools.
CREATE TABLE IF NOT EXISTS user_aliases (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias    TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, alias)
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL,
  api_key_id        INTEGER,
  model_id          TEXT NOT NULL,
  provider_id       TEXT,
  provider_key_id   INTEGER,
  endpoint          TEXT,
  status            INTEGER NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens     INTEGER NOT NULL DEFAULT 0,
  cost              INTEGER NOT NULL DEFAULT 0,  -- micro-USD
  subscription_id   INTEGER,
  charged           INTEGER NOT NULL DEFAULT 0,  -- units taken from subscription
  latency_ms        INTEGER,
  error             TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
