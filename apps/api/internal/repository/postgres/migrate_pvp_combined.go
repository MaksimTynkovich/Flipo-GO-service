package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migratePvPCombinedStakes(db *gorm.DB) error {
	table := "pvp_room_players"
	if !tableExists(db, table) {
		return nil
	}

	if !columnExists(db, table, "balance_nanoton") {
		if err := db.Exec(`ALTER TABLE pvp_room_players ADD COLUMN balance_nanoton BIGINT NOT NULL DEFAULT 0`).Error; err != nil {
			return fmt.Errorf("add balance_nanoton to pvp_room_players: %w", err)
		}
	}

	if err := db.Exec(`
		UPDATE pvp_room_players
		SET balance_nanoton = stake_nanoton
		WHERE funding_type = 'balance'
		  AND balance_nanoton = 0
		  AND stake_nanoton > 0
	`).Error; err != nil {
		return fmt.Errorf("backfill balance_nanoton: %w", err)
	}

	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS pvp_room_player_gifts (
			room_id UUID NOT NULL REFERENCES pvp_rooms(id) ON DELETE CASCADE,
			user_id UUID NOT NULL,
			inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
			value_nanoton BIGINT NOT NULL DEFAULT 0,
			PRIMARY KEY (room_id, user_id, inventory_item_id)
		)
	`).Error; err != nil {
		return fmt.Errorf("create pvp_room_player_gifts: %w", err)
	}

	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_pvp_room_player_gifts_room
			ON pvp_room_player_gifts(room_id)
	`).Error; err != nil {
		return fmt.Errorf("index pvp_room_player_gifts: %w", err)
	}

	if err := db.Exec(`
		INSERT INTO pvp_room_player_gifts (room_id, user_id, inventory_item_id, value_nanoton)
		SELECT
			p.room_id,
			p.user_id,
			p.inventory_item_id,
			CASE
				WHEN p.funding_type IN ('gift', 'combined') THEN GREATEST(p.stake_nanoton - COALESCE(p.balance_nanoton, 0), 0)
				ELSE 0
			END
		FROM pvp_room_players p
		WHERE p.inventory_item_id IS NOT NULL
		ON CONFLICT DO NOTHING
	`).Error; err != nil {
		return fmt.Errorf("backfill pvp_room_player_gifts: %w", err)
	}

	return nil
}
