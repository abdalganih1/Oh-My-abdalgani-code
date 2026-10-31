-- Provider priority decides the order routes are tried for every model (lower = first):
-- your fixed-fee plan (z.ai) first, pay-as-you-go aggregators (OpenRouter) last.
-- A model can opt out with custom_order = 1 and use its own route order instead.
ALTER TABLE providers ADD COLUMN priority INTEGER NOT NULL DEFAULT 50;
ALTER TABLE models ADD COLUMN custom_order INTEGER NOT NULL DEFAULT 0;
UPDATE providers SET priority = 10 WHERE id = 'zai';
UPDATE providers SET priority = 30 WHERE id IN ('nvidia', 'opencode-zen');
UPDATE providers SET priority = 40 WHERE id = 'nous';
UPDATE providers SET priority = 60 WHERE id IN ('anthropic', 'openai');
UPDATE providers SET priority = 100 WHERE id = 'openrouter';
