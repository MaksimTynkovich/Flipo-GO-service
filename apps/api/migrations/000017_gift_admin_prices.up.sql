ALTER TABLE nft_floor_prices
    ADD COLUMN IF NOT EXISTS buy_price_nanoton BIGINT NOT NULL DEFAULT 0;

ALTER TABLE nft_floor_prices
    ADD COLUMN IF NOT EXISTS valuation_nanoton BIGINT NOT NULL DEFAULT 0;

-- Existing floor rows become valuation defaults (no -12% haircut anymore).
UPDATE nft_floor_prices
SET valuation_nanoton = price_nanoton
WHERE valuation_nanoton = 0
  AND price_nanoton > 0;

UPDATE nft_floor_prices
SET buy_price_nanoton = price_nanoton
WHERE buy_price_nanoton = 0
  AND price_nanoton > 0;
