package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateDailyWheel(db *gorm.DB) error {
	// Active weights sum to 99978. 0.005≈70.02%, 0.01≈29.86%; ≥0.05≈0.13%; 0.5/1/5/25/50 off.
	// Use maps (not structs) so Active=false is written — GORM omits zero-value bools on Create.
	seeds := []map[string]any{
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000001"), "label": "Почти пусто", "amount_nanoton": int64(5_000_000), "weight": 70000, "sort_order": 1, "active": true},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000002"), "label": "Мелкий", "amount_nanoton": int64(10_000_000), "weight": 29850, "sort_order": 2, "active": true},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000003"), "label": "Малый", "amount_nanoton": int64(50_000_000), "weight": 71, "sort_order": 3, "active": true},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000004"), "label": "Средний", "amount_nanoton": int64(100_000_000), "weight": 35, "sort_order": 4, "active": true},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000005"), "label": "Хороший", "amount_nanoton": int64(250_000_000), "weight": 22, "sort_order": 5, "active": true},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000006"), "label": "Отличный", "amount_nanoton": int64(500_000_000), "weight": 1, "sort_order": 6, "active": false},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000007"), "label": "Крупный", "amount_nanoton": int64(1_000_000_000), "weight": 1, "sort_order": 7, "active": false},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000008"), "label": "Джекпот", "amount_nanoton": int64(5_000_000_000), "weight": 1, "sort_order": 8, "active": false},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-000000000009"), "label": "Мега", "amount_nanoton": int64(25_000_000_000), "weight": 1, "sort_order": 9, "active": false},
		{"id": uuid.MustParse("a1000000-0000-4000-8000-00000000000a"), "label": "Легенда", "amount_nanoton": int64(50_000_000_000), "weight": 1, "sort_order": 10, "active": false},
	}
	for _, seg := range seeds {
		label, _ := seg["label"].(string)
		if err := db.Table(domain.WheelSegment{}.TableName()).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{"label", "amount_nanoton", "weight", "sort_order", "active"}),
		}).Create(seg).Error; err != nil {
			return fmt.Errorf("seed wheel segment %s: %w", label, err)
		}
	}
	return nil
}
