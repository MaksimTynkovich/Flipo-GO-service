-- Restore pre-rebalance weights for the two lowest segments.

UPDATE wheel_segments
SET weight = 62394
WHERE id = 'a1000000-0000-4000-8000-000000000001';

UPDATE wheel_segments
SET weight = 37456
WHERE id = 'a1000000-0000-4000-8000-000000000002';
