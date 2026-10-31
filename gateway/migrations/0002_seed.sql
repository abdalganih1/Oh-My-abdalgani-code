-- Default providers (keys are added later from the admin panel — never in SQL/git).
INSERT OR IGNORE INTO providers (id, name, openai_base_url, anthropic_base_url, auth_style, extra_headers) VALUES
  ('zai',        'Z.AI Coding Plan', 'https://api.z.ai/api/coding/paas/v4', 'https://api.z.ai/api/anthropic', 'bearer',    NULL),
  ('openrouter', 'OpenRouter',       'https://openrouter.ai/api/v1',        'https://openrouter.ai/api',      'bearer',    '{"HTTP-Referer":"https://abdalgani.com","X-Title":"abdalgani"}'),
  ('anthropic',  'Anthropic',        'https://api.anthropic.com/v1',        'https://api.anthropic.com',      'x-api-key', NULL),
  ('openai',     'OpenAI Platform',  'https://api.openai.com/v1',           NULL,                             'bearer',    NULL);

INSERT OR IGNORE INTO model_groups (id, name, description) VALUES
  ('coding',  'Coding',  'نماذج البرمجة الأساسية (z.ai coding plan)'),
  ('premium', 'Premium', 'نماذج قوية مكلفة (Anthropic / OpenAI)'),
  ('cheap',   'Cheap',   'نماذج سريعة ورخيصة');

-- Starter catalog: the z.ai coding-plan models that were already verified live in the
-- previous LiteLLM setup (context/output copied from setup.js AGENT_MODELS).
-- Prices are 0 on purpose: set them from the admin panel before handing out USD coupons.
INSERT OR IGNORE INTO models (id, name, group_id, context_length, max_output, reasoning, pricing_mode, status, sort) VALUES
  ('glm-5.2', 'GLM-5.2', 'coding', 1000000, 131072, 1, 'request', 'new',    10),
  ('glm-5.1', 'GLM-5.1', 'coding', 204800,  131072, 1, 'request', 'active', 20),
  ('glm-4.7', 'GLM-4.7', 'coding', 204800,  131072, 1, 'request', 'legacy', 30);

INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.2', 'zai', 'glm-5.2', 0 WHERE NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id='glm-5.2');
INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-5.1', 'zai', 'glm-5.1', 0 WHERE NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id='glm-5.1');
INSERT INTO model_routes (model_id, provider_id, upstream_model, priority)
  SELECT 'glm-4.7', 'zai', 'glm-4.7', 0 WHERE NOT EXISTS (SELECT 1 FROM model_routes WHERE model_id='glm-4.7');

-- Stable aliases every tool is configured with; students re-map them in the dashboard.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('aliases', '{"abd-main":"glm-5.2","abd-fast":"glm-4.7","abd-think":"glm-5.2"}');
