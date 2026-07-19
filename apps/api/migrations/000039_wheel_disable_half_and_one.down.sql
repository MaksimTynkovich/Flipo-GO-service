-- Re-enable 0.5 TON and 1 TON with prior weights from 000038 era.

UPDATE wheel_segments
SET active = TRUE, weight = 14
WHERE id = 'a1000000-0000-4000-8000-000000000006';

UPDATE wheel_segments
SET active = TRUE, weight = 8
WHERE id = 'a1000000-0000-4000-8000-000000000007';
