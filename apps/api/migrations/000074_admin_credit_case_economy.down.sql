ALTER TABLE case_opens
    DROP COLUMN IF EXISTS admin_funded_nanoton;

ALTER TABLE users
    DROP COLUMN IF EXISTS admin_credit_nanoton;
