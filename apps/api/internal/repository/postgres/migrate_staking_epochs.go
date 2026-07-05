package postgres

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var legacyStakingEpochID = uuid.MustParse("00000000-0000-4000-8000-000000000001")

func migrateStakingEpochs(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS staking_epochs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			starts_at TIMESTAMPTZ NOT NULL,
			ends_at TIMESTAMPTZ NOT NULL,
			status VARCHAR(16) NOT NULL DEFAULT 'active',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`).Error; err != nil {
		return fmt.Errorf("create staking_epochs: %w", err)
	}

	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_staking_epochs_status ON staking_epochs(status)`).Error; err != nil {
		return err
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_staking_epochs_ends_at ON staking_epochs(ends_at)`).Error; err != nil {
		return err
	}

	if !columnExists(db, "staking_positions", "epoch_id") {
		if err := db.Exec(`ALTER TABLE staking_positions ADD COLUMN epoch_id UUID`).Error; err != nil {
			return fmt.Errorf("add epoch_id: %w", err)
		}
	}
	if !columnExists(db, "staking_positions", "gift_slug") {
		if err := db.Exec(`ALTER TABLE staking_positions ADD COLUMN gift_slug VARCHAR(128) NOT NULL DEFAULT ''`).Error; err != nil {
			return fmt.Errorf("add gift_slug: %w", err)
		}
	}
	if !columnExists(db, "staking_positions", "source") {
		if err := db.Exec(`ALTER TABLE staking_positions ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'inventory'`).Error; err != nil {
			return fmt.Errorf("add source: %w", err)
		}
	}
	if !columnExists(db, "staking_positions", "revoked_reason") {
		if err := db.Exec(`ALTER TABLE staking_positions ADD COLUMN revoked_reason VARCHAR(32)`).Error; err != nil {
			return fmt.Errorf("add revoked_reason: %w", err)
		}
	}

	var legacyCount int64
	if err := db.Raw(`SELECT COUNT(*) FROM staking_epochs WHERE id = ?`, legacyStakingEpochID).Scan(&legacyCount).Error; err != nil {
		return err
	}
	if legacyCount == 0 {
		now := time.Now().UTC()
		legacyStart := now.AddDate(0, 0, -14)
		if err := db.Exec(`
			INSERT INTO staking_epochs (id, starts_at, ends_at, status, created_at, updated_at)
			VALUES (?, ?, ?, 'settled', ?, ?)
		`, legacyStakingEpochID, legacyStart, now, now, now).Error; err != nil {
			return fmt.Errorf("insert legacy epoch: %w", err)
		}
	}

	// Close pre-migration active stakes; they belong to the old always-on model.
	if err := db.Exec(`
		UPDATE staking_positions
		SET is_active = FALSE,
		    unstaked_at = COALESCE(unstaked_at, NOW()),
		    revoked_reason = COALESCE(revoked_reason, 'epoch_end'),
		    updated_at = NOW()
		WHERE epoch_id IS NULL AND is_active = TRUE
	`).Error; err != nil {
		return fmt.Errorf("deactivate legacy active positions: %w", err)
	}

	if err := db.Exec(`
		UPDATE inventory_items ii
		SET status = 'available', updated_at = NOW()
		FROM staking_positions sp
		WHERE sp.inventory_item_id = ii.id
		  AND ii.status = 'staked'
		  AND sp.is_active = FALSE
		  AND sp.epoch_id IS NULL
	`).Error; err != nil {
		return fmt.Errorf("release legacy staked inventory: %w", err)
	}

	if err := db.Exec(`
		UPDATE staking_positions sp
		SET gift_slug = COALESCE(NULLIF(ii.telegram_gift_id, ''), ii.collection_slug, sp.id::text)
		FROM inventory_items ii
		WHERE sp.inventory_item_id = ii.id
		  AND (sp.gift_slug IS NULL OR sp.gift_slug = '')
	`).Error; err != nil {
		return fmt.Errorf("backfill gift_slug: %w", err)
	}

	if err := db.Exec(`
		UPDATE staking_positions sp
		SET source = 'profile'
		FROM inventory_items ii
		WHERE sp.inventory_item_id = ii.id
		  AND ii.telegram_tx_ref LIKE 'profile:%'
		  AND sp.source = 'inventory'
	`).Error; err != nil {
		return fmt.Errorf("backfill source: %w", err)
	}

	if err := db.Exec(`
		UPDATE staking_positions
		SET epoch_id = ?
		WHERE epoch_id IS NULL
	`, legacyStakingEpochID).Error; err != nil {
		return fmt.Errorf("backfill epoch_id: %w", err)
	}

	if err := db.Exec(`ALTER TABLE staking_positions ALTER COLUMN epoch_id SET NOT NULL`).Error; err != nil {
		return fmt.Errorf("set epoch_id not null: %w", err)
	}

	if err := db.Exec(`ALTER TABLE staking_positions DROP CONSTRAINT IF EXISTS staking_positions_inventory_item_id_key`).Error; err != nil {
		return err
	}
	if err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_positions_item_active
		ON staking_positions(inventory_item_id) WHERE is_active = TRUE
	`).Error; err != nil {
		return err
	}
	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_staking_positions_epoch_active
		ON staking_positions(epoch_id) WHERE is_active = TRUE
	`).Error; err != nil {
		return err
	}
	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_staking_positions_gift_slug_active
		ON staking_positions(gift_slug) WHERE is_active = TRUE
	`).Error; err != nil {
		return err
	}

	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS staking_gift_claims (
			gift_slug VARCHAR(128) PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id),
			position_id UUID NOT NULL REFERENCES staking_positions(id) ON DELETE CASCADE,
			epoch_id UUID NOT NULL REFERENCES staking_epochs(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`).Error; err != nil {
		return fmt.Errorf("create staking_gift_claims: %w", err)
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_staking_gift_claims_user ON staking_gift_claims(user_id)`).Error; err != nil {
		return err
	}

	// GORM may have created a wrongly-named table on a prior failed migrate.
	if err := db.Exec(`DROP TABLE IF EXISTS staking_epoches CASCADE`).Error; err != nil {
		return fmt.Errorf("drop staking_epoches: %w", err)
	}

	return nil
}

func columnExists(db *gorm.DB, table, column string) bool {
	var exists bool
	db.Raw(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = CURRENT_SCHEMA()
			  AND table_name = ?
			  AND column_name = ?
		)
	`, table, column).Scan(&exists)
	return exists
}
