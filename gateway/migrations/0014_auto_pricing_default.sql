-- Prices follow OpenRouter automatically by default: every model priced from a hand-kept token
-- table (or left at 0) becomes 'auto'. Flat paid per-request prices and 'provider' (real
-- OpenRouter cost) stay as they are. The next maintenance run / "refresh prices" fills route prices.
UPDATE models SET pricing_mode = 'auto' WHERE pricing_mode = 'token' OR (pricing_mode = 'request' AND price_request = 0);
