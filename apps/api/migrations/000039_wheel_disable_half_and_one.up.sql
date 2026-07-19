-- Disable 0.5 TON and 1 TON segments (0% chance).
-- Remaining active weights sum to 99978; odds renormalize slightly among them.

UPDATE wheel_segments
SET active = FALSE, weight = 1
WHERE id IN (
    'a1000000-0000-4000-8000-000000000006', -- 0.5 TON
    'a1000000-0000-4000-8000-000000000007'  -- 1 TON
);
