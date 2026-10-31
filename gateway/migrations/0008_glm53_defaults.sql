-- GLM-5.3 family becomes the default (abd-main / abd-think → glm-5.3, abd-fast → glm-5.3-flash).
-- Prices = OpenRouter's public list price for the same model (µ$ per 1M tokens), token mode.
-- Route order: z.ai coding plan first, OpenRouter as automatic fallback when z.ai is rate-limited/down.

INSERT OR IGNORE INTO models (id, name, group_id, context_length, max_output, reasoning, pricing_mode, price_in, price_out, price_cache_read, status, sort, description) VALUES
  ('glm-5.3',       'GLM-5.3',       'coding', 1048576, 131072, 1, 'token', 69900, 1400000, 68900, 'new', 5, 'النموذج الأساسي — ذكي وسياق مليون توكن'),
  ('glm-5.3-flash', 'GLM-5.3 Flash', 'coding', 1048576, 131072, 1, 'token', 16300, 147900,  16300, 'new', 6, 'سريع ورخيص جداً للأسئلة القصيرة');

INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.3', 'zai', 'glm-5.3', 0 WHERE NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id = 'glm-5.3');
INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.3', 'openrouter', 'z-ai/glm-5.3', 1
  WHERE EXISTS (SELECT 1 FROM providers WHERE id = 'openrouter')
    AND NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id = 'glm-5.3' AND provider_id = 'openrouter');
INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.3-flash', 'zai', 'glm-5.3-flash', 0 WHERE NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id = 'glm-5.3-flash');
INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.3-flash', 'openrouter', 'z-ai/glm-5.3-flash', 1
  WHERE EXISTS (SELECT 1 FROM providers WHERE id = 'openrouter')
    AND NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id = 'glm-5.3-flash' AND provider_id = 'openrouter');

-- glm-5.2 is no longer the headline model
UPDATE models SET status = 'active' WHERE id = 'glm-5.2' AND status = 'new';

-- switch the default aliases only if the admin never edited them
UPDATE settings SET value = '{"abd-main":"glm-5.3","abd-fast":"glm-5.3-flash","abd-think":"glm-5.3"}'
  WHERE key = 'aliases' AND value = '{"abd-main":"glm-5.2","abd-fast":"glm-4.7","abd-think":"glm-5.2"}';
