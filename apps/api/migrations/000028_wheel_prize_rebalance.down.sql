-- Restore previous wheel segment defaults (000027).
-- Keep id …009 row but deactivate it (may be referenced by wheel_spins).

UPDATE wheel_segments
SET active = FALSE
WHERE id = 'a1000000-0000-4000-8000-000000000009';

UPDATE wheel_segments SET
    label = v.label,
    amount_nanoton = v.amount_nanoton,
    weight = v.weight,
    sort_order = v.sort_order,
    active = TRUE
FROM (VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'Почти пусто', 10000000::bigint, 350, 1),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 'Мелкий', 20000000::bigint, 250, 2),
    ('a1000000-0000-4000-8000-000000000003'::uuid, 'Малый', 50000000::bigint, 200, 3),
    ('a1000000-0000-4000-8000-000000000004'::uuid, 'Средний', 100000000::bigint, 120, 4),
    ('a1000000-0000-4000-8000-000000000005'::uuid, 'Хороший', 250000000::bigint, 50, 5),
    ('a1000000-0000-4000-8000-000000000006'::uuid, 'Крупный', 500000000::bigint, 25, 6),
    ('a1000000-0000-4000-8000-000000000007'::uuid, 'Джекпот', 1000000000::bigint, 4, 7),
    ('a1000000-0000-4000-8000-000000000008'::uuid, 'Мега', 2000000000::bigint, 1, 8)
) AS v(id, label, amount_nanoton, weight, sort_order)
WHERE wheel_segments.id = v.id;
