-- Drop legacy gift condition from item metadata
UPDATE inventory_items
SET metadata = metadata - 'condition'
WHERE metadata ? 'condition';
