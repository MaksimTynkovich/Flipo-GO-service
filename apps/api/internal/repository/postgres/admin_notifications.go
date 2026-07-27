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

func applyAdminNotificationFilter(q *gorm.DB, filter domain.AdminNotificationFilter) *gorm.DB {
	if cat := strings.TrimSpace(filter.Category); cat != "" && cat != "all" {
		q = q.Where("category = ?", cat)
	}
	if filter.UnreadOnly {
		q = q.Where("read_at IS NULL")
	}
	if search := strings.TrimSpace(filter.Query); search != "" {
		like := "%" + escapeILIKE(search) + "%"
		q = q.Where(`(
			title ILIKE ? ESCAPE '\' OR
			summary ILIKE ? ESCAPE '\' OR
			body ILIKE ? ESCAPE '\' OR
			kind ILIKE ? ESCAPE '\' OR
			actor_username ILIKE ? ESCAPE '\' OR
			actor_first_name ILIKE ? ESCAPE '\' OR
			actor_last_name ILIKE ? ESCAPE '\' OR
			CAST(actor_telegram_id AS TEXT) ILIKE ? ESCAPE '\'
		)`, like, like, like, like, like, like, like, like)
	}
	return q
}

func escapeILIKE(s string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(s)
}

func (r *AdminNotificationRepo) ListAdminNotifications(ctx context.Context, filter domain.AdminNotificationFilter) ([]domain.AdminNotification, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 300 {
		limit = 300
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	q := applyAdminNotificationFilter(r.db.WithContext(ctx).Model(&domain.AdminNotification{}), filter)
	var items []domain.AdminNotification
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&items).Error
	return items, err
}

func (r *AdminNotificationRepo) CountAdminNotifications(ctx context.Context, filter domain.AdminNotificationFilter) (int64, error) {
	q := applyAdminNotificationFilter(r.db.WithContext(ctx).Model(&domain.AdminNotification{}), filter)
	var count int64
	err := q.Count(&count).Error
	return count, err
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
