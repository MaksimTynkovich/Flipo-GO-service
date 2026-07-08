package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UserRepo struct {
	db *gorm.DB
}

func NewUserRepo(db *gorm.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	var user domain.User
	if err := r.db.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) FindByTelegramID(ctx context.Context, telegramID int64) (*domain.User, error) {
	var user domain.User
	if err := r.db.WithContext(ctx).Where("telegram_id = ?", telegramID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) Upsert(ctx context.Context, user *domain.User) error {
	now := time.Now().UTC()
	user.LastLoginAt = &now
	user.UpdatedAt = now
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "telegram_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"username", "first_name", "last_name", "photo_url", "last_login_at", "updated_at"}),
	}).Create(user).Error
}

func (r *UserRepo) UpdateWallet(ctx context.Context, userID uuid.UUID, wallet string) error {
	return r.db.WithContext(ctx).Model(&domain.User{}).Where("id = ?", userID).Update("ton_wallet", wallet).Error
}

func (r *UserRepo) GetBalanceForUpdate(ctx context.Context, userID uuid.UUID) (int64, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).
		Select("betting_balance").First(&user, "id = ?", userID).Error
	if err != nil {
		return 0, err
	}
	return user.BettingBalance, nil
}

func (r *UserRepo) UpdateBalance(ctx context.Context, userID uuid.UUID, delta int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	var balanceAfter int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", userID).Error; err != nil {
			return err
		}
		newBalance := user.BettingBalance + delta
		if newBalance < 0 {
			return domain.ErrInsufficientFunds
		}

		updates := map[string]interface{}{
			"betting_balance": newBalance,
		}
		newPromoBalance := user.PromoBalance
		if delta > 0 && ledgerType == domain.LedgerPromoBonus {
			newPromoBalance += delta
			updates["promo_balance"] = newPromoBalance
		}
		if delta < 0 {
			promoConsumed := min(-delta, user.PromoBalance)
			if promoConsumed > 0 {
				newPromoBalance -= promoConsumed
				updates["promo_balance"] = newPromoBalance
			}
		}

		if err := tx.Model(&user).Updates(updates).Error; err != nil {
			return err
		}
		ledger := domain.BalanceLedger{
			UserID:        userID,
			Type:          ledgerType,
			AmountNanoton: delta,
			BalanceAfter:  newBalance,
			ReferenceType: refType,
			ReferenceID:   refID,
			CreatedAt:     time.Now().UTC(),
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}
		balanceAfter = newBalance
		return nil
	})
	return balanceAfter, err
}

func (r *UserRepo) ReleasePromoBalance(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&domain.User{}).
		Where("id = ? AND promo_balance > 0", userID).
		Update("promo_balance", 0).Error
}

func (r *UserRepo) UpdateStakingTier(ctx context.Context, userID uuid.UUID, tier domain.StakingTier) error {
	return r.db.WithContext(ctx).Model(&domain.User{}).Where("id = ?", userID).Update("staking_tier", tier).Error
}

func (r *UserRepo) SetReferrerIfEmpty(ctx context.Context, userID, referrerID uuid.UUID) error {
	res := r.db.WithContext(ctx).Model(&domain.User{}).
		Where("id = ? AND referrer_id IS NULL AND id != ?", userID, referrerID).
		Update("referrer_id", referrerID)
	if res.Error != nil {
		return res.Error
	}
	return nil
}

func (r *UserRepo) CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.User{}).
		Where("referrer_id = ?", referrerID).
		Count(&count).Error
	return count, err
}

func (r *UserRepo) SumReferralEarnings(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("user_id = ? AND type = ?", userID, domain.LedgerReferralBonus).
		Select("COALESCE(SUM(amount_nanoton), 0)").
		Scan(&total).Error
	return total, err
}

func (r *UserRepo) ListTelegramIDs(ctx context.Context, limit, offset int) ([]int64, error) {
	if limit <= 0 {
		limit = 100
	}
	var ids []int64
	err := r.db.WithContext(ctx).Model(&domain.User{}).
		Where("deleted_at IS NULL AND telegram_id > 0").
		Order("created_at ASC").
		Limit(limit).
		Offset(offset).
		Pluck("telegram_id", &ids).Error
	return ids, err
}

func (r *UserRepo) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.User{}).
		Where("deleted_at IS NULL AND telegram_id > 0").
		Count(&count).Error
	return count, err
}

var _ domain.UserRepository = (*UserRepo)(nil)

type InventoryRepo struct {
	db *gorm.DB
}

func NewInventoryRepo(db *gorm.DB) *InventoryRepo {
	return &InventoryRepo{db: db}
}

func (r *InventoryRepo) ListByUser(ctx context.Context, userID uuid.UUID, status *domain.InventoryStatus) ([]domain.InventoryItem, error) {
	var items []domain.InventoryItem
	q := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if status != nil {
		q = q.Where("status = ?", *status)
	}
	err := q.Order("deposited_at DESC").Find(&items).Error
	return items, err
}

func (r *InventoryRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	if err := r.db.WithContext(ctx).First(&item, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepo) FindByTelegramGiftID(ctx context.Context, userID uuid.UUID, giftID string) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND telegram_gift_id = ?", userID, giftID).
		Order("deposited_at DESC").
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepo) FindByGiftSlug(ctx context.Context, slug string) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	err := r.db.WithContext(ctx).
		Where("telegram_gift_id = ?", slug).
		Order("deposited_at DESC").
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepo) FindActiveByGiftSlug(ctx context.Context, slug string) (*domain.InventoryItem, error) {
	var item domain.InventoryItem
	err := r.db.WithContext(ctx).
		Where("telegram_gift_id = ? AND status IN ?", slug, []domain.InventoryStatus{
			domain.InvAvailable,
			domain.InvLocked,
			domain.InvStaked,
		}).
		Order("deposited_at DESC").
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepo) Create(ctx context.Context, item *domain.InventoryItem) error {
	return r.db.WithContext(ctx).Create(item).Error
}

func (r *InventoryRepo) UpdateStatus(ctx context.Context, id uuid.UUID, from, to domain.InventoryStatus) error {
	res := r.db.WithContext(ctx).Model(&domain.InventoryItem{}).
		Where("id = ? AND status = ?", id, from).
		Update("status", to)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("inventory item not in expected status")
	}
	return nil
}

func (r *InventoryRepo) TransferOwnership(ctx context.Context, itemID, newUserID uuid.UUID, fromStatus domain.InventoryStatus) error {
	now := time.Now().UTC()
	res := r.db.WithContext(ctx).Model(&domain.InventoryItem{}).
		Where("id = ? AND status = ?", itemID, fromStatus).
		Updates(map[string]interface{}{
			"user_id":    newUserID,
			"status":     domain.InvAvailable,
			"updated_at": now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("inventory item not in expected status")
	}
	return nil
}

func (r *InventoryRepo) GetFloorPrice(ctx context.Context, collectionSlug string) (int64, error) {
	var fp domain.NFTFloorPrice
	err := r.db.WithContext(ctx).First(&fp, "collection_slug = ?", collectionSlug).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, fmt.Errorf("floor price not found for %s", collectionSlug)
	}
	return fp.PriceNanoton, err
}

func (r *InventoryRepo) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	fp := domain.NFTFloorPrice{
		CollectionSlug: slug,
		PriceNanoton:   price,
		UpdatedAt:      time.Now().UTC(),
	}
	return r.db.WithContext(ctx).Save(&fp).Error
}

var _ domain.InventoryRepository = (*InventoryRepo)(nil)
