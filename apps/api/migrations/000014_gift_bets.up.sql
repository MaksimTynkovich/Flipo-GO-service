ALTER TABLE game_bets
    ADD COLUMN IF NOT EXISTS funding_type VARCHAR(16) NOT NULL DEFAULT 'balance',
    ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id);

CREATE INDEX IF NOT EXISTS idx_game_bets_inventory_item_id ON game_bets(inventory_item_id);

ALTER TABLE pvp_room_players
    ADD COLUMN IF NOT EXISTS funding_type VARCHAR(16) NOT NULL DEFAULT 'balance',
    ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id);
