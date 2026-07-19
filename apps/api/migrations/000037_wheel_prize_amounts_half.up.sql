-- Halve the two most common wheel prizes: 0.01 → 0.005, 0.02 → 0.01.
-- Weights/chances unchanged (0.005+0.01 = 99.85%; ≥0.05 = 0.15%).

UPDATE wheel_segments
SET amount_nanoton = 5000000
WHERE id = 'a1000000-0000-4000-8000-000000000001';

UPDATE wheel_segments
SET amount_nanoton = 10000000
WHERE id = 'a1000000-0000-4000-8000-000000000002';
