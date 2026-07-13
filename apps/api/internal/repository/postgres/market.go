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

type MarketRepo struct {
	db *gorm.DB
}

func NewMarketRepo(db *gorm.DB) *MarketRepo {
	return &MarketRepo{db: db}
}

func (r *MarketRepo) ListActive(ctx context.Context, limit, offset int) ([]domain.MarketListing, error) {
	var listings []domain.MarketListing
	q := r.db.WithContext(ctx).
		Preload("Item").
		Preload("Seller").
		Where("status = ?", domain.ListingActive).
		Order("price_nanoton DESC, created_at DESC")
	if limit > 0 {
		q = q.Limit(limit).Offset(offset)
	}
	err := q.Find(&listings).Error
	return listings, err
}

func (r *MarketRepo) ListActiveBySource(ctx context.Context, source domain.ListingSource) ([]domain.MarketListing, error) {
	var listings []domain.MarketListing
	err := r.db.WithContext(ctx).
		Preload("Item").
		Where("status = ? AND source = ?", domain.ListingActive, source).
		Order("created_at DESC").
		Find(&listings).Error
	return listings, err
}

func (r *MarketRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.MarketListing, error) {
	var listing domain.MarketListing
	err := r.db.WithContext(ctx).
		Preload("Item").
		Preload("Seller").
		First(&listing, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &listing, nil
}

func (r *MarketRepo) ListBySeller(ctx context.Context, sellerID uuid.UUID) ([]domain.MarketListing, error) {
	var listings []domain.MarketListing
	err := r.db.WithContext(ctx).
		Preload("Item").
		Where("seller_id = ?", sellerID).
		Order("created_at DESC").
		Find(&listings).Error
	return listings, err
}

func (r *MarketRepo) FindActiveByItemID(ctx context.Context, itemID uuid.UUID) (*domain.MarketListing, error) {
	var listing domain.MarketListing
	err := r.db.WithContext(ctx).
		Where("inventory_item_id = ? AND status = ?", itemID, domain.ListingActive).
		First(&listing).Error
	if err != nil {
		return nil, err
	}
	return &listing, nil
}

func (r *MarketRepo) CreateListing(ctx context.Context, listing *domain.MarketListing) error {
	return r.db.WithContext(ctx).Create(listing).Error
}

func (r *MarketRepo) UpdateListingPrice(ctx context.Context, listingID uuid.UUID, priceNanoton int64) error {
	if priceNanoton <= 0 {
		return domain.ErrInvalidAmount
	}
	res := r.db.WithContext(ctx).Model(&domain.MarketListing{}).
		Where("id = ? AND status = ?", listingID, domain.ListingActive).
		Updates(map[string]interface{}{
			"price_nanoton": priceNanoton,
			"updated_at":    time.Now().UTC(),
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *MarketRepo) CancelListing(ctx context.Context, id, sellerID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var listing domain.MarketListing
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&listing, "id = ? AND seller_id = ? AND status = ?", id, sellerID, domain.ListingActive).Error; err != nil {
			return err
		}

		if err := tx.Model(&listing).Updates(map[string]interface{}{
			"status":     domain.ListingCancelled,
			"updated_at": time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		res := tx.Model(&domain.InventoryItem{}).
			Where("id = ? AND status = ?", listing.InventoryItemID, domain.InvLocked).
			Update("status", domain.InvAvailable)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("inventory item not locked")
		}
		return nil
	})
}

func (r *MarketRepo) Purchase(ctx context.Context, listingID, buyerID uuid.UUID, price, sellerProceeds int64, feeBps int) (*domain.MarketListing, error) {
	var result domain.MarketListing
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var listing domain.MarketListing
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Item").
			First(&listing, "id = ? AND status = ?", listingID, domain.ListingActive).Error; err != nil {
			return err
		}

		if listing.SellerID == buyerID {
			return domain.ErrForbidden
		}

		if listing.PriceNanoton != price {
			return domain.ErrInvalidAmount
		}

		var buyer domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&buyer, "id = ?", buyerID).Error; err != nil {
			return err
		}
		if buyer.BettingBalance < price {
			return domain.ErrInsufficientFunds
		}
		available := buyer.BettingBalance - buyer.PromoBalance
		if available < price {
			return domain.ErrPromoFundsRestricted
		}

		var seller domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&seller, "id = ?", listing.SellerID).Error; err != nil {
			return err
		}

		buyerBalance := buyer.BettingBalance - price
		if err := tx.Model(&buyer).Update("betting_balance", buyerBalance).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.BalanceLedger{
			UserID:        buyerID,
			Type:          domain.LedgerMarketBuy,
			AmountNanoton: -price,
			BalanceAfter:  buyerBalance,
			ReferenceType: "market_listing",
			ReferenceID:   listingID,
			CreatedAt:     time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		if sellerProceeds > 0 {
			sellerBalance := seller.BettingBalance + sellerProceeds
			if err := tx.Model(&seller).Update("betting_balance", sellerBalance).Error; err != nil {
				return err
			}
			if err := tx.Create(&domain.BalanceLedger{
				UserID:        listing.SellerID,
				Type:          domain.LedgerMarketSell,
				AmountNanoton: sellerProceeds,
				BalanceAfter:  sellerBalance,
				ReferenceType: "market_listing",
				ReferenceID:   listingID,
				CreatedAt:     time.Now().UTC(),
			}).Error; err != nil {
				return err
			}
		}

		now := time.Now().UTC()
		if err := tx.Model(&listing).Updates(map[string]interface{}{
			"status":     domain.ListingSold,
			"buyer_id":   buyerID,
			"sold_at":    now,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		res := tx.Model(&domain.InventoryItem{}).
			Where("id = ? AND status = ?", listing.InventoryItemID, domain.InvLocked).
			Updates(map[string]interface{}{
				"user_id":    buyerID,
				"status":     domain.InvAvailable,
				"updated_at": now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("inventory item not locked")
		}

		_ = feeBps
		result = listing
		result.Status = domain.ListingSold
		result.BuyerID = &buyerID
		result.SoldAt = &now
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *MarketRepo) SellToBot(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error) {
	if payout <= 0 || listPrice <= 0 {
		return 0, domain.ErrInvalidAmount
	}

	var newBalance int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item domain.InventoryItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&item, "id = ? AND user_id = ? AND status = ?", itemID, sellerID, domain.InvAvailable).Error; err != nil {
			return err
		}
		if domain.IsProfileVirtualItem(item) {
			return domain.ErrInvalidAmount
		}

		botUser, err := ensureBotUserTx(tx)
		if err != nil {
			return err
		}

		var seller domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&seller, "id = ?", sellerID).Error; err != nil {
			return err
		}

		sellerBalance := seller.BettingBalance + payout
		if err := tx.Model(&seller).Update("betting_balance", sellerBalance).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.BalanceLedger{
			UserID:        sellerID,
			Type:          domain.LedgerLiquidate,
			AmountNanoton: payout,
			BalanceAfter:  sellerBalance,
			ReferenceType: "inventory",
			ReferenceID:   itemID,
			CreatedAt:     time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		now := time.Now().UTC()
		if err := tx.Model(&item).Updates(map[string]interface{}{
			"user_id":    botUser.ID,
			"status":     domain.InvLocked,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}

		listing := domain.MarketListing{
			ID:              uuid.New(),
			SellerID:        botUser.ID,
			InventoryItemID: itemID,
			PriceNanoton:    listPrice,
			Status:          domain.ListingActive,
			Source:          domain.ListingSourceBot,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := tx.Create(&listing).Error; err != nil {
			return err
		}

		newBalance = sellerBalance
		return nil
	})
	if err != nil {
		return 0, err
	}
	return newBalance, nil
}

func (r *MarketRepo) AcquireGiftFromBet(ctx context.Context, itemID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item domain.InventoryItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&item, "id = ? AND status = ?", itemID, domain.InvInBet).Error; err != nil {
			return err
		}

		botUser, err := ensureBotUserTx(tx)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		return tx.Model(&item).Updates(map[string]interface{}{
			"user_id":    botUser.ID,
			"status":     domain.InvLocked,
			"updated_at": now,
		}).Error
	})
}

func ensureBotUserTx(tx *gorm.DB) (*domain.User, error) {
	var user domain.User
	err := tx.Where("telegram_id = ?", domain.BotTelegramID).First(&user).Error
	if err == nil {
		return &user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	user = domain.User{
		ID:             uuid.New(),
		TelegramID:     domain.BotTelegramID,
		Username:       "flipo_bot",
		FirstName:      "Flipo Bot",
		BettingBalance: 0,
		StakingTier:    domain.TierBase,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := tx.Create(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *MarketRepo) EnsureBotUser(ctx context.Context) (*domain.User, error) {
	var user domain.User
	err := r.db.WithContext(ctx).Where("telegram_id = ?", domain.BotTelegramID).First(&user).Error
	if err == nil {
		return &user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	user = domain.User{
		ID:             uuid.New(),
		TelegramID:     domain.BotTelegramID,
		Username:       "flipo_bot",
		FirstName:      "Flipo Bot",
		BettingBalance: 0,
		StakingTier:    domain.TierBase,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := r.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *MarketRepo) CountActive(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.MarketListing{}).
		Where("status = ?", domain.ListingActive).Count(&count).Error
	return count, err
}

var _ domain.MarketRepository = (*MarketRepo)(nil)
