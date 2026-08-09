package postgres

import "gorm.io/gorm"

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
