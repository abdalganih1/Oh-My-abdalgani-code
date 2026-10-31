-- Prompt-cache writes: Anthropic models bill them at ~125% of the input price (OpenRouter
-- "input_cache_write"). Price them explicitly so students aren't under-charged, and log them.
ALTER TABLE models ADD COLUMN price_cache_write INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_models ADD COLUMN price_cache_write INTEGER;
ALTER TABLE usage_logs ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
