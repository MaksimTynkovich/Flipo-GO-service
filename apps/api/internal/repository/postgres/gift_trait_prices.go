package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type GiftTraitPriceRepo struct {
	db *gorm.DB
}

func NewGiftTraitPriceRepo(db *gorm.DB) *GiftTraitPriceRepo {
	return &GiftTraitPriceRepo{db: db}
}

func (r *GiftTraitPriceRepo) Get(ctx context.Context, collectionSlug, model, backdrop string) (*domain.GiftTraitPrice, error) {
	var row domain.GiftTraitPrice
	err := r.db.WithContext(ctx).
		Where("collection_slug = ? AND model = ? AND backdrop = ?", collectionSlug, model, backdrop).
		Limit(1).
		Find(&row).Error
	if err != nil {
		return nil, err
	}
	if row.CollectionSlug == "" {
		return nil, nil
	}
	return &row, nil
}

func (r *GiftTraitPriceRepo) Upsert(ctx context.Context, price *domain.GiftTraitPrice) error {
	if price == nil {
		return fmt.Errorf("nil gift trait price")
	}
	now := time.Now().UTC()
	if price.FetchedAt.IsZero() {
		price.FetchedAt = now
	}
	price.UpdatedAt = now
	if price.CreatedAt.IsZero() {
		price.CreatedAt = now
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "collection_slug"},
			{Name: "model"},
			{Name: "backdrop"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"price_nanoton", "source", "fetched_at", "updated_at"}),
	}).Create(price).Error
}

func (r *GiftTraitPriceRepo) ListAll(ctx context.Context) ([]domain.GiftTraitPrice, error) {
	var rows []domain.GiftTraitPrice
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *GiftTraitPriceRepo) ListKeysFromInventory(ctx context.Context) ([]domain.GiftTraitPriceKey, error) {
	type row struct {
		CollectionSlug string
		Model          string
		Backdrop       string
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
		SELECT DISTINCT
			collection_slug,
			COALESCE(metadata->>'model', '') AS model,
			COALESCE(metadata->>'backdrop', '') AS backdrop
		FROM inventory_items
		WHERE collection_slug <> ''
		  AND COALESCE(metadata->>'model', '') <> ''
	`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]domain.GiftTraitPriceKey, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.GiftTraitPriceKey{
			CollectionSlug: item.CollectionSlug,
			Model:          item.Model,
			Backdrop:       item.Backdrop,
		})
	}
	return out, nil
}

func (r *GiftTraitPriceRepo) ListFiltered(ctx context.Context, filter domain.GiftTraitPriceFilter) ([]domain.GiftTraitPrice, int64, error) {
	q := r.db.WithContext(ctx).Model(&domain.GiftTraitPrice{})
	if filter.CollectionSlug != "" {
		q = q.Where("collection_slug = ?", filter.CollectionSlug)
	}
	if filter.Model != "" {
		q = q.Where("model = ?", filter.Model)
	}
	if filter.Backdrop != "" {
		if filter.Backdrop == "__empty__" {
			q = q.Where("backdrop = ''")
		} else {
			q = q.Where("backdrop = ?", filter.Backdrop)
		}
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	var rows []domain.GiftTraitPrice
	err := q.Order("collection_slug ASC, model ASC, backdrop ASC").
		Limit(limit).
		Offset(offset).
		Find(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (r *GiftTraitPriceRepo) ListFilterOptions(ctx context.Context, collectionSlug, model string) (domain.GiftTraitPriceFilterOptions, error) {
	var out domain.GiftTraitPriceFilterOptions

	if err := r.db.WithContext(ctx).Model(&domain.GiftTraitPrice{}).
		Distinct("collection_slug").
		Order("collection_slug ASC").
		Pluck("collection_slug", &out.Collections).Error; err != nil {
		return out, err
	}

	mq := r.db.WithContext(ctx).Model(&domain.GiftTraitPrice{})
	if collectionSlug != "" {
		mq = mq.Where("collection_slug = ?", collectionSlug)
	}
	if err := mq.Distinct("model").Order("model ASC").Pluck("model", &out.Models).Error; err != nil {
		return out, err
	}

	bq := r.db.WithContext(ctx).Model(&domain.GiftTraitPrice{})
	if collectionSlug != "" {
		bq = bq.Where("collection_slug = ?", collectionSlug)
	}
	if model != "" {
		bq = bq.Where("model = ?", model)
	}
	if err := bq.Distinct("backdrop").Order("backdrop ASC").Pluck("backdrop", &out.Backdrops).Error; err != nil {
		return out, err
	}
	return out, nil
}
