-- Per-route selling prices (micro-USD / 1M tokens) for pricing_mode = 'auto':
-- a model whose routes serve different upstream models (e.g. `fast`) bills at the price of the
-- route that actually answered. price_ref = the OpenRouter id the price was copied from, or
-- 'manual' when the admin typed it (the auto refresh never overwrites those).
ALTER TABLE model_routes ADD COLUMN price_in INTEGER;
ALTER TABLE model_routes ADD COLUMN price_out INTEGER;
ALTER TABLE model_routes ADD COLUMN price_cache_read INTEGER;
ALTER TABLE model_routes ADD COLUMN price_cache_write INTEGER;
ALTER TABLE model_routes ADD COLUMN price_ref TEXT;
