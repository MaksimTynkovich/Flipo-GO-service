package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateDailyWheel(db *gorm.DB) error {
	seeds := []domain.WheelSegment{
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000001"), Label: "Почти пусто", AmountNanoton: 10_000_000, Weight: 350, SortOrder: 1, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000002"), Label: "Мелкий", AmountNanoton: 20_000_000, Weight: 250, SortOrder: 2, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000003"), Label: "Малый", AmountNanoton: 50_000_000, Weight: 200, SortOrder: 3, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000004"), Label: "Средний", AmountNanoton: 100_000_000, Weight: 120, SortOrder: 4, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000005"), Label: "Хороший", AmountNanoton: 250_000_000, Weight: 50, SortOrder: 5, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000006"), Label: "Крупный", AmountNanoton: 500_000_000, Weight: 25, SortOrder: 6, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000007"), Label: "Джекпот", AmountNanoton: 1_000_000_000, Weight: 4, SortOrder: 7, Active: true},
		{ID: uuid.MustParse("a1000000-0000-4000-8000-000000000008"), Label: "Мега", AmountNanoton: 2_000_000_000, Weight: 1, SortOrder: 8, Active: true},
	}
	for _, seg := range seeds {
		if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&seg).Error; err != nil {
			return fmt.Errorf("seed wheel segment %s: %w", seg.Label, err)
		}
	}
	return nil
}
