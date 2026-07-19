-- Move mass from 0.01 → 0.005: 0.005 = 70%, 0.01 = 29.85%.
-- Remaining ≥0.05 unchanged at 0.15% (weights / 100000).

UPDATE wheel_segments
SET weight = 70000
WHERE id = 'a1000000-0000-4000-8000-000000000001';

UPDATE wheel_segments
SET weight = 29850
WHERE id = 'a1000000-0000-4000-8000-000000000002';
