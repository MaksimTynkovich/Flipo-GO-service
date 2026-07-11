ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS gift_buy_adjust_percent DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE platform_yield_settings
    ADD COLUMN IF NOT EXISTS gift_valuation_adjust_percent DECIMAL(8,2) NOT NULL DEFAULT 0;

-- Per-collection absolute overrides are no longer used.
UPDATE nft_floor_prices
SET buy_price_nanoton = 0,
    valuation_nanoton = 0
WHERE buy_price_nanoton <> 0
   OR valuation_nanoton <> 0;
