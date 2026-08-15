package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migrateStakingSettleUnique(db *gorm.DB) error {
	if !tableExists(db, "balance_ledgers") || !tableExists(db, "staking_epochs") {
		return nil
	}
	statements := []string{
		clawbackRacedDailyPayoutsSQL,
		relabelHistoricalDailyPayoutDupesSQL,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_ledgers_staking_daily_unique
			ON balance_ledgers (user_id, reference_id)
			WHERE type = 'stake_yield' AND reference_type = 'staking_daily'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_ledgers_referral_daily_unique
			ON balance_ledgers (user_id, reference_id)
			WHERE type = 'referral_bonus' AND reference_type = 'referral_daily'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_ledgers_referral_ggr_unique
			ON balance_ledgers (user_id, reference_id)
			WHERE type = 'referral_bonus' AND reference_type = 'referral_ggr'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_epochs_starts_at_unique
			ON staking_epochs (starts_at)`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migrate staking settle unique: %w", err)
		}
	}
	return nil
}

// clawbackRacedDailyPayoutsSQL reverses extra same-second daily credits, then
// deletes those duplicate ledger rows so the unique indexes can be created.
const clawbackRacedDailyPayoutsSQL = `
DO $$
DECLARE
  extra RECORD;
  claw BIGINT;
  new_bal BIGINT;
  reversal_type TEXT;
BEGIN
  FOR extra IN
    SELECT d.id, d.user_id, d.amount_nanoton, d.reference_type
    FROM (
      SELECT
        id,
        user_id,
        amount_nanoton,
        reference_type,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, type, reference_type, reference_id
          ORDER BY created_at, id
        ) AS rn,
        MAX(created_at) OVER (
          PARTITION BY user_id, type, reference_type, reference_id
        ) - MIN(created_at) OVER (
          PARTITION BY user_id, type, reference_type, reference_id
        ) AS span
      FROM balance_ledgers
      WHERE type IN ('stake_yield', 'referral_bonus')
        AND reference_type IN ('staking_daily', 'referral_daily')
        AND amount_nanoton > 0
    ) d
    WHERE d.rn > 1
      AND d.span < INTERVAL '5 seconds'
  LOOP
    reversal_type := CASE extra.reference_type
      WHEN 'referral_daily' THEN 'referral_daily_reversal'
      ELSE 'staking_daily_reversal'
    END;

    SELECT betting_balance INTO new_bal
    FROM users
    WHERE id = extra.user_id
    FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1
      FROM balance_ledgers r
      WHERE r.reference_type = reversal_type
        AND r.reference_id = extra.id
    ) THEN
      claw := LEAST(new_bal, extra.amount_nanoton);
      IF claw < 0 THEN
        claw := 0;
      END IF;
      new_bal := new_bal - claw;

      UPDATE users
      SET betting_balance = new_bal
      WHERE id = extra.user_id;

      IF claw > 0 THEN
        INSERT INTO balance_ledgers (
          id, user_id, type, amount_nanoton, balance_after,
          reference_type, reference_id, created_at
        ) VALUES (
          gen_random_uuid(),
          extra.user_id,
          CASE extra.reference_type
            WHEN 'referral_daily' THEN 'referral_bonus'
            ELSE 'stake_yield'
          END,
          -claw,
          new_bal,
          reversal_type,
          extra.id,
          NOW()
        );
      END IF;
    END IF;

    DELETE FROM balance_ledgers WHERE id = extra.id;
  END LOOP;
END $$;
`

const relabelHistoricalDailyPayoutDupesSQL = `
UPDATE balance_ledgers bl
SET reference_type = CASE bl.reference_type
  WHEN 'referral_daily' THEN 'referral_daily_cutover'
  ELSE 'staking_daily_cutover'
END
FROM (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, type, reference_type, reference_id
        ORDER BY created_at, id
      ) AS rn
    FROM balance_ledgers
    WHERE type IN ('stake_yield', 'referral_bonus')
      AND reference_type IN ('staking_daily', 'referral_daily')
      AND amount_nanoton > 0
  ) ranked
  WHERE rn > 1
) extra
WHERE bl.id = extra.id;
`
