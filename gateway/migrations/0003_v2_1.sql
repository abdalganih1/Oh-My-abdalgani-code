-- v2.1: real-model visibility, per-provider compatibility, vision flag, NVIDIA + OpenCode Zen.

-- Which alias the student sent and which upstream model actually answered.
ALTER TABLE usage_logs ADD COLUMN requested_model TEXT;
ALTER TABLE usage_logs ADD COLUMN upstream_model TEXT;

-- Per-provider request normalization (JSON):
--   max_tokens_field: "max_tokens" | "max_completion_tokens"   (rename the other one)
--   developer_role:   false → "developer" messages are sent as "system"
--   efforts:          accepted reasoning_effort values; others are mapped to the nearest
--                     (Hermes always sends one; unsupported values make some upstreams 400)
ALTER TABLE providers ADD COLUMN compat TEXT;

ALTER TABLE models ADD COLUMN vision INTEGER NOT NULL DEFAULT 0;

UPDATE providers SET compat = '{"max_tokens_field":"max_tokens","developer_role":false,"efforts":["none","minimal","low","medium","high","xhigh","max"]}' WHERE id = 'zai' AND compat IS NULL;
UPDATE providers SET compat = '{"efforts":["none","minimal","low","medium","high","xhigh"]}' WHERE id = 'openrouter' AND compat IS NULL;
UPDATE providers SET compat = '{"max_tokens_field":"max_completion_tokens","efforts":["none","minimal","low","medium","high","xhigh"]}' WHERE id = 'openai' AND compat IS NULL;
UPDATE providers SET compat = '{"developer_role":false,"efforts":["low","medium","high"]}' WHERE id = 'anthropic' AND compat IS NULL;

INSERT OR IGNORE INTO providers (id, name, openai_base_url, anthropic_base_url, auth_style, extra_headers, compat) VALUES
  ('nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', NULL, 'bearer', NULL,
   '{"max_tokens_field":"max_tokens","developer_role":false,"efforts":["low","medium","high"]}'),
  -- OpenCode Zen = pay-as-you-go API (team workspaces allowed). Every text model is served on
  -- chat/completions; Claude-family models also natively on the Anthropic endpoint.
  ('opencode-zen', 'OpenCode Zen', 'https://opencode.ai/inference/openai/v1', 'https://opencode.ai/inference/anthropic', 'x-api-key', NULL,
   '{"efforts":["none","minimal","low","medium","high","xhigh"]}');
