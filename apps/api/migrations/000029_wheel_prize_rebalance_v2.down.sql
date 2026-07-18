-- Restore 000028 wheel prize table.

UPDATE wheel_segments
SET active = FALSE
WHERE id = 'a1000000-0000-4000-8000-00000000000a';

INSERT INTO wheel_segments (id, label, amount_nanoton, weight, sort_order, active)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Почти пусто', 10000000, 5165, 1, TRUE),
    ('a1000000-0000-4000-8000-000000000002', 'Мелкий', 20000000, 3100, 2, TRUE),
    ('a1000000-0000-4000-8000-000000000003', 'Малый', 50000000, 1040, 3, TRUE),
    ('a1000000-0000-4000-8000-000000000004', 'Средний', 100000000, 310, 4, TRUE),
    ('a1000000-0000-4000-8000-000000000005', 'Хороший', 250000000, 200, 5, TRUE),
    ('a1000000-0000-4000-8000-000000000006', 'Крупный', 1000000000, 100, 6, TRUE),
    ('a1000000-0000-4000-8000-000000000007', 'Джекпот', 5000000000, 50, 7, TRUE),
    ('a1000000-0000-4000-8000-000000000008', 'Мега', 25000000000, 25, 8, TRUE),
    ('a1000000-0000-4000-8000-000000000009', 'Легенда', 50000000000, 10, 9, TRUE)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    amount_nanoton = EXCLUDED.amount_nanoton,
    weight = EXCLUDED.weight,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;
