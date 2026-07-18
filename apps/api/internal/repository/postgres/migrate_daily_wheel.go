package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateDailyWheel(db *gorm.DB) error {
	// Weights sum to 10000. Listed odds leave 1.85% — folded into ≤0.10 TON
	// so everything above 0.10 stays relatively rare (~5.15% combined).
	seeds := []domain.WheelSegment{
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000001"), Label: "Почти пусто", AmountNanoton: 10_000_000, Weight: 5099, SortOrder: 1, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000002"), Label: "Мелкий", AmountNanoton: 20_000_000, Weight: 3060, SortOrder: 2, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000003"), Label: "Малый", AmountNanoton: 50_000_000, Weight: 1020, SortOrder: 3, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000004"), Label: "Средний", AmountNanoton: 100_000_000, Weight: 306, SortOrder: 4, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000005"), Label: "Хороший", AmountNanoton: 250_000_000, Weight: 200, SortOrder: 5, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000006"), Label: "Отличный", AmountNanoton: 500_000_000, Weight: 150, SortOrder: 6, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000007"), Label: "Крупный", AmountNanoton: 1_000_000_000, Weight: 100, SortOrder: 7, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000008"), Label: "Джекпот", AmountNanoton: 5_000_000_000, Weight: 50, SortOrder: 8, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000009"), Label: "Мега", AmountNanoton: 25_000_000_000, Weight: 10, SortOrder: 9, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-00000000000a"), Label: "Легенда", AmountNanoton: 50_000_000_000, Weight: 5, SortOrder: 10, Active: true},
	}
	for _, seg := range seeds {
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{"label", "amount_nanoton", "weight", "sort_order", "active"}),
		}).Create(&seg).Error; err != nil {
			return fmt.Errorf("seed wheel segment %s: %w", seg.Label, err)
		}
	}
	return nil
}
