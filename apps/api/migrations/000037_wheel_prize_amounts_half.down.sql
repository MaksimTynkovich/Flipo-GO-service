-- Restore pre-half amounts: 0.005 → 0.01, 0.01 → 0.02.

UPDATE wheel_segments
SET amount_nanoton = 10000000
WHERE id = 'a1000000-0000-4000-8000-000000000001';

UPDATE wheel_segments
SET amount_nanoton = 20000000
WHERE id = 'a1000000-0000-4000-8000-000000000002';
