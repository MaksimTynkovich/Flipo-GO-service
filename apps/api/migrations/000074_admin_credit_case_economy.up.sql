ALTER TABLE users
    ADD COLUMN IF NOT EXISTS admin_credit_nanoton BIGINT NOT NULL DEFAULT 0;

ALTER TABLE case_opens
    ADD COLUMN IF NOT EXISTS admin_funded_nanoton BIGINT NOT NULL DEFAULT 0;

-- Conservative backfill: net admin_adjust (credits minus admin clawbacks), capped by current balance.
-- Overstating remaining admin credit is safer for case bank (non-organic spend won't top up the pool).
UPDATE users u
SET admin_credit_nanoton = LEAST(
    u.betting_balance,
    GREATEST(
        COALESCE((
            SELECT SUM(bl.amount_nanoton)
            FROM balance_ledgers bl
            WHERE bl.user_id = u.id
              AND bl.type = 'admin_adjust'
        ), 0),
        0
    )
)
WHERE EXISTS (
    SELECT 1 FROM balance_ledgers bl
    WHERE bl.user_id = u.id AND bl.type = 'admin_adjust'
);
