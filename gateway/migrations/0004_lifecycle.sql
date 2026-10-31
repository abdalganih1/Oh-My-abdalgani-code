-- v2.2: automatic model lifecycle — discovery, "new" for 7 days, health-based archiving.

-- providers: catalog sync + health + archive + auto-publish policy
ALTER TABLE providers ADD COLUMN auto TEXT;              -- JSON policy, see below
ALTER TABLE providers ADD COLUMN last_sync_at INTEGER;
ALTER TABLE providers ADD COLUMN sync_error TEXT;
ALTER TABLE providers ADD COLUMN last_ok_at INTEGER;     -- last successful inference
ALTER TABLE providers ADD COLUMN first_fail_at INTEGER;  -- first failure since last success
ALTER TABLE providers ADD COLUMN last_fail_at INTEGER;
ALTER TABLE providers ADD COLUMN last_fail_error TEXT;
ALTER TABLE providers ADD COLUMN archived_at INTEGER;
ALTER TABLE providers ADD COLUMN archived_reason TEXT;

-- routes: same health signals per (model, provider)
ALTER TABLE model_routes ADD COLUMN last_ok_at INTEGER;
ALTER TABLE model_routes ADD COLUMN first_fail_at INTEGER;
ALTER TABLE model_routes ADD COLUMN last_fail_at INTEGER;
ALTER TABLE model_routes ADD COLUMN last_fail_error TEXT;
ALTER TABLE model_routes ADD COLUMN archived_at INTEGER;
ALTER TABLE model_routes ADD COLUMN archived_reason TEXT;

-- models: archive bookkeeping (status gains the value 'archived')
ALTER TABLE models ADD COLUMN archived_at INTEGER;
ALTER TABLE models ADD COLUMN archived_reason TEXT;
ALTER TABLE models ADD COLUMN auto_source TEXT;          -- provider id when auto-published

-- Everything each provider's /models returned, so we can diff between syncs.
CREATE TABLE IF NOT EXISTS provider_models (
  provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  upstream_id    TEXT NOT NULL,
  name           TEXT,
  context_length INTEGER,
  max_output     INTEGER,
  price_in       INTEGER,
  price_out      INTEGER,
  price_cache_read INTEGER,
  free           INTEGER NOT NULL DEFAULT 0,
  vision         INTEGER,
  reasoning      INTEGER,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  missing_since  INTEGER,
  baseline       INTEGER NOT NULL DEFAULT 0,          -- seen on the provider's first sync
  dismissed      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, upstream_id)
);

-- Admin feed: new models, archived/restored models & providers, sync errors.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,      -- model_discovered | model_published | model_archived | model_restored | provider_archived | provider_restored | sync_error | model_promoted
  provider_id TEXT,
  model_id    TEXT,
  message     TEXT NOT NULL,
  data        TEXT,
  notified    INTEGER NOT NULL DEFAULT 0,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);

-- auto policy (JSON):
--   publish        true  → new upstream models become public models automatically (status "new")
--   free_only      true  → only auto-publish free models
--   group          model group for auto-published models
--   pricing_mode / price_request / markup_pct  → pricing for auto-published models
--   match          optional regex an upstream id must match to be published
UPDATE providers SET auto = '{"publish":true,"group":"coding","pricing_mode":"request","price_request":0}' WHERE id = 'zai' AND auto IS NULL;
UPDATE providers SET auto = '{"publish":true,"free_only":true,"group":"cheap","pricing_mode":"token"}' WHERE id IN ('openrouter','opencode-zen') AND auto IS NULL;
UPDATE providers SET auto = '{"publish":false}' WHERE id IN ('nvidia','anthropic','openai') AND auto IS NULL;

-- Nous Portal (the inference API behind Hermes' "nous" provider).
INSERT OR IGNORE INTO providers (id, name, openai_base_url, anthropic_base_url, auth_style, compat, auto) VALUES
  ('nous', 'Nous Portal', 'https://inference-api.nousresearch.com/v1', NULL, 'bearer',
   '{"developer_role":false}', '{"publish":false}');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('lifecycle', '{"archive_after_hours":6,"new_days":7,"missing_hours":6}');
