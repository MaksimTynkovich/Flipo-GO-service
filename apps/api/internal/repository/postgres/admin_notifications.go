package postgres

import (
	"context"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AdminNotificationRepo struct {
	db *gorm.DB
}

func NewAdminNotificationRepo(db *gorm.DB) *AdminNotificationRepo {
	return &AdminNotificationRepo{db: db}
}

func (r *AdminNotificationRepo) CreateAdminNotification(ctx context.Context, n *domain.AdminNotification) error {
	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now().UTC()
	}
	if n.Severity == "" {
		n.Severity = "info"
	}
	if n.Meta == nil {
		n.Meta = []byte("{}")
	}
	return r.db.WithContext(ctx).Create(n).Error
}

func (r *AdminNotificationRepo) ListAdminNotifications(ctx context.Context, filter domain.AdminNotificationFilter) ([]domain.AdminNotification, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 300 {
		limit = 300
	}
	q := r.db.WithContext(ctx).Model(&domain.AdminNotification{})
	if cat := strings.TrimSpace(filter.Category); cat != "" && cat != "all" {
		q = q.Where("category = ?", cat)
	}
	if filter.UnreadOnly {
		q = q.Where("read_at IS NULL")
	}
	var items []domain.AdminNotification
	err := q.Order("created_at DESC").Limit(limit).Find(&items).Error
	return items, err
}

func (r *AdminNotificationRepo) CountUnreadAdminNotifications(ctx context.Context, category string) (int64, error) {
	q := r.db.WithContext(ctx).Model(&domain.AdminNotification{}).Where("read_at IS NULL")
	if cat := strings.TrimSpace(category); cat != "" && cat != "all" {
		q = q.Where("category = ?", cat)
	}
	var count int64
	err := q.Count(&count).Error
	return count, err
}

func (r *AdminNotificationRepo) MarkAdminNotificationRead(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.AdminNotification{}).
		Where("id = ? AND read_at IS NULL", id).
		Update("read_at", now).Error
}

func (r *AdminNotificationRepo) MarkAllAdminNotificationsRead(ctx context.Context, category string) (int64, error) {
	now := time.Now().UTC()
	q := r.db.WithContext(ctx).Model(&domain.AdminNotification{}).Where("read_at IS NULL")
	if cat := strings.TrimSpace(category); cat != "" && cat != "all" {
		q = q.Where("category = ?", cat)
	}
	res := q.Update("read_at", now)
	return res.RowsAffected, res.Error
}
