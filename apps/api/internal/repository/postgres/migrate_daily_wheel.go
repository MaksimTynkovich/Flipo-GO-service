package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateDailyWheel(db *gorm.DB) error {
	// Weights sum to 100000. >0.05 TON segments total 1.5%; tops fixed rare.
	seeds := []domain.WheelSegment{
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000001"), Label: "Почти пусто", AmountNanoton: 10_000_000, Weight: 54720, SortOrder: 1, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000002"), Label: "Мелкий", AmountNanoton: 20_000_000, Weight: 32830, SortOrder: 2, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000003"), Label: "Малый", AmountNanoton: 50_000_000, Weight: 10950, SortOrder: 3, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000004"), Label: "Средний", AmountNanoton: 100_000_000, Weight: 584, SortOrder: 4, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000005"), Label: "Хороший", AmountNanoton: 250_000_000, Weight: 386, SortOrder: 5, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000006"), Label: "Отличный", AmountNanoton: 500_000_000, Weight: 282, SortOrder: 6, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000007"), Label: "Крупный", AmountNanoton: 1_000_000_000, Weight: 187, SortOrder: 7, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000008"), Label: "Джекпот", AmountNanoton: 5_000_000_000, Weight: 50, SortOrder: 8, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000009"), Label: "Мега", AmountNanoton: 25_000_000_000, Weight: 10, SortOrder: 9, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-00000000000a"), Label: "Легенда", AmountNanoton: 50_000_000_000, Weight: 1, SortOrder: 10, Active: true},
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
