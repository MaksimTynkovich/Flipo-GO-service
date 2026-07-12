DROP TABLE IF EXISTS referral_milestones;
DROP TABLE IF EXISTS referral_perks;

ALTER TABLE promo_redemptions DROP COLUMN IF EXISTS max_cashout_nanoton;

ALTER TABLE platform_yield_settings DROP COLUMN IF EXISTS referral_monthly_payout_cap_nanoton;
ALTER TABLE platform_yield_settings DROP COLUMN IF EXISTS referral_milestone_monthly_cap;
ALTER TABLE platform_yield_settings DROP COLUMN IF EXISTS referral_milestone_nanoton;
ALTER TABLE platform_yield_settings DROP COLUMN IF EXISTS referral_ggr_share_percent;

DELETE FROM promo_codes WHERE code = 'REF_WELCOME';
