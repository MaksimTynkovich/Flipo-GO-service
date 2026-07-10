package postgres

import (
	"fmt"

	"gorm.io/gorm"
)

func migratePvPPlayerStake(db *gorm.DB) error {
	for _, table := range []string{"pv_p_room_players", "pvp_room_players"} {
		if !tableExists(db, table) {
			continue
		}
		roomsTable := "pv_p_rooms"
		if table == "pvp_room_players" {
			roomsTable = "pvp_rooms"
		}
		if !tableExists(db, roomsTable) {
			roomsTable = "pvp_rooms"
			if !tableExists(db, roomsTable) {
				roomsTable = "pv_p_rooms"
			}
		}

		if !columnExists(db, table, "stake_nanoton") {
			if err := db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN stake_nanoton BIGINT`, table)).Error; err != nil {
				return fmt.Errorf("add stake_nanoton to %s: %w", table, err)
			}
		}

		if err := db.Exec(fmt.Sprintf(`
			UPDATE %s p
			SET stake_nanoton = r.bet_amount_nanoton
			FROM %s r
			WHERE p.room_id = r.id
			  AND (p.stake_nanoton IS NULL OR p.stake_nanoton = 0)
		`, table, roomsTable)).Error; err != nil {
			return fmt.Errorf("backfill stake_nanoton on %s: %w", table, err)
		}

		if err := db.Exec(fmt.Sprintf(`UPDATE %s SET stake_nanoton = 0 WHERE stake_nanoton IS NULL`, table)).Error; err != nil {
			return fmt.Errorf("normalize stake_nanoton on %s: %w", table, err)
		}

		if err := db.Exec(fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN stake_nanoton SET DEFAULT 0`, table)).Error; err != nil {
			return fmt.Errorf("set stake_nanoton default on %s: %w", table, err)
		}

		if err := db.Exec(fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN stake_nanoton SET NOT NULL`, table)).Error; err != nil {
			return fmt.Errorf("set stake_nanoton not null on %s: %w", table, err)
		}
	}
	return nil
}

func tableExists(db *gorm.DB, table string) bool {
	var exists bool
	db.Raw(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = CURRENT_SCHEMA()
			  AND table_name = ?
		)
	`, table).Scan(&exists)
	return exists
}
