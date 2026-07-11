ALTER TABLE platform_yield_settings
    DROP COLUMN IF EXISTS gift_buy_adjust_percent;

ALTER TABLE platform_yield_settings
    DROP COLUMN IF EXISTS gift_valuation_adjust_percent;
