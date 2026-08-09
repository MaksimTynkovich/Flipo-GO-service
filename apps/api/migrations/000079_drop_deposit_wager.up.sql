-- Drop deposit playthrough (отыгрыш после депозита).
ALTER TABLE users
  DROP COLUMN IF EXISTS wager_required_nanoton,
  DROP COLUMN IF EXISTS wager_progress_nanoton;

ALTER TABLE platform_withdrawal_settings
  DROP COLUMN IF EXISTS deposit_wager_enabled,
  DROP COLUMN IF EXISTS crash_wager_target;
