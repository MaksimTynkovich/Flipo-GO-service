package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateDailyWheel(db *gorm.DB) error {
	// Active weights sum to 100000. 0.01+0.02 = 99.85%; ≥0.05 = 0.15%; 5/25/50 off.
	seeds := []domain.WheelSegment{
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000001"), Label: "Почти пусто", AmountNanoton: 10_000_000, Weight: 62394, SortOrder: 1, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000002"), Label: "Мелкий", AmountNanoton: 20_000_000, Weight: 37456, SortOrder: 2, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000003"), Label: "Малый", AmountNanoton: 50_000_000, Weight: 71, SortOrder: 3, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000004"), Label: "Средний", AmountNanoton: 100_000_000, Weight: 35, SortOrder: 4, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000005"), Label: "Хороший", AmountNanoton: 250_000_000, Weight: 22, SortOrder: 5, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000006"), Label: "Отличный", AmountNanoton: 500_000_000, Weight: 14, SortOrder: 6, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000007"), Label: "Крупный", AmountNanoton: 1_000_000_000, Weight: 8, SortOrder: 7, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000008"), Label: "Джекпот", AmountNanoton: 5_000_000_000, Weight: 1, SortOrder: 8, Active: false},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000009"), Label: "Мега", AmountNanoton: 25_000_000_000, Weight: 1, SortOrder: 9, Active: false},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-00000000000a"), Label: "Легенда", AmountNanoton: 50_000_000_000, Weight: 1, SortOrder: 10, Active: false},
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
