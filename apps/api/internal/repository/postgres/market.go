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

func (r *MarketRepo) ListActive(ctx context.Context, limit, offset int, sort string, source *domain.ListingSource) ([]domain.MarketListing, error) {
	var listings []domain.MarketListing
	order := marketListOrder(sort)
	q := r.db.WithContext(ctx).
		Preload("Item").
		Preload("Seller").
		Where("status = ?", domain.ListingActive).
		Order(order)
	if source != nil {
		q = q.Where("source = ?", *source)
	}
	if limit > 0 {
		q = q.Limit(limit).Offset(offset)
	}
	err := q.Find(&listings).Error
	return listings, err
}

func applyMarketListingFilters(q *gorm.DB, filter domain.MarketListingFilter) *gorm.DB {
	if filter.Source != nil {
		q = q.Where("market_listings.source = ?", *filter.Source)
	}
	if filter.Status != nil {
		q = q.Where("market_listings.status = ?", *filter.Status)
	} else {
		q = q.Where("market_listings.status = ?", domain.ListingActive)
	}
	if filter.PriceMin != nil {
		q = q.Where("market_listings.price_nanoton >= ?", *filter.PriceMin)
	}
	if filter.PriceMax != nil {
		q = q.Where("market_listings.price_nanoton <= ?", *filter.PriceMax)
	}
	if filter.Collection != "" || filter.Query != "" {
		q = q.Joins("JOIN inventory_items ON inventory_items.id = market_listings.inventory_item_id")
	}
	if filter.Collection != "" {
		q = q.Where("inventory_items.collection_slug = ?", filter.Collection)
	}
	if filter.Query != "" {
		like := "%" + filter.Query + "%"
		q = q.Where(
			"(inventory_items.name ILIKE ? OR inventory_items.collection_slug ILIKE ? OR COALESCE(inventory_items.metadata::text, '') ILIKE ?)",
			like, like, like,
		)
	}
	return q
}

func (r *MarketRepo) ListFiltered(ctx context.Context, filter domain.MarketListingFilter) ([]domain.MarketListing, int64, error) {
	var total int64
	countQ := applyMarketListingFilters(r.db.WithContext(ctx).Model(&domain.MarketListing{}), filter)
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	var listings []domain.MarketListing
	err := applyMarketListingFilters(r.db.WithContext(ctx).Model(&domain.MarketListing{}), filter).
		Preload("Item").
		Preload("Seller").
		Order(marketListOrderPrefixed(filter.Sort)).
		Limit(limit).
		Offset(offset).
		Find(&listings).Error
	return listings, total, err
}

const marketFilteredIDsCap = 10_000

func (r *MarketRepo) ListFilteredIDs(ctx context.Context, filter domain.MarketListingFilter) ([]uuid.UUID, int64, error) {
	var total int64
	countQ := applyMarketListingFilters(r.db.WithContext(ctx).Model(&domain.MarketListing{}), filter)
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var ids []uuid.UUID
	err := applyMarketListingFilters(r.db.WithContext(ctx).Model(&domain.MarketListing{}), filter).
		Order(marketListOrderPrefixed(filter.Sort)).
		Limit(marketFilteredIDsCap).
		Pluck("market_listings.id", &ids).Error
	return ids, total, err
}

func marketListOrder(sort string) string {
	switch sort {
	case "price_asc":
		return "price_nanoton ASC, created_at DESC"
	case "price_desc":
		return "price_nanoton DESC, created_at DESC"
	default: // newest
		return "created_at DESC, price_nanoton DESC"
	}
}

func marketListOrderPrefixed(sort string) string {
	switch sort {
	case "price_asc":
		return "market_listings.price_nanoton ASC, market_listings.created_at DESC"
	case "price_desc":
		return "market_listings.price_nanoton DESC, market_listings.created_at DESC"
	default:
		return "market_listings.created_at DESC, market_listings.price_nanoton DESC"
	}
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

		var seller domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&seller, "id = ?", listing.SellerID).Error; err != nil {
			return err
		}

		buyerBalance := buyer.BettingBalance - price
		if err := tx.Model(&buyer).Update("betting_balance", buyerBalance).Error; err != nil {
			return err
		}
		buyer.BettingBalance = buyerBalance
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
		if !domain.CanMarketBuyback(item) {
			return domain.ErrGiftNotInBotCustody
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

func (r *MarketRepo) SettleCaseClaim(ctx context.Context, userID, itemID uuid.UUID, payout int64) (int64, error) {
	if payout <= 0 {
		return 0, domain.ErrInvalidAmount
	}

	var newBalance int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item domain.InventoryItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&item, "id = ? AND user_id = ? AND status = ?", itemID, userID, domain.InvAvailable).Error; err != nil {
			return err
		}
		if !domain.IsCaseClaimItem(item) || domain.CaseClaimCashoutNanoton(item.Metadata) <= 0 {
			return domain.ErrInvalidAmount
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, "id = ?", userID).Error; err != nil {
			return err
		}

		newBalance = user.BettingBalance + payout
		if err := tx.Model(&user).Update("betting_balance", newBalance).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.BalanceLedger{
			UserID:        userID,
			Type:          domain.LedgerCaseCashout,
			AmountNanoton: payout,
			BalanceAfter:  newBalance,
			ReferenceType: "case_claim",
			ReferenceID:   itemID,
			CreatedAt:     time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		if err := tx.Model(&item).Updates(map[string]any{
			"status":        domain.InvLiquidated,
			"liquidated_at": now,
			"updated_at":    now,
		}).Error; err != nil {
			return err
		}
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

func (r *MarketRepo) MarketStats(ctx context.Context, since *time.Time) (*domain.MarketStats, error) {
	stats := &domain.MarketStats{}

	countQ := r.db.WithContext(ctx).Model(&domain.MarketListing{}).Where("status = ?", domain.ListingSold)
	if since != nil {
		countQ = countQ.Where("sold_at >= ?", *since)
	}
	if err := countQ.Count(&stats.SoldCount).Error; err != nil {
		return nil, err
	}

	volQ := r.db.WithContext(ctx).Model(&domain.MarketListing{}).Where("status = ?", domain.ListingSold)
	if since != nil {
		volQ = volQ.Where("sold_at >= ?", *since)
	}
	if err := volQ.Select("COALESCE(SUM(price_nanoton), 0)").Scan(&stats.VolumeNanoton).Error; err != nil {
		return nil, err
	}

	var buyAbs, sellSum int64
	buyQ := r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("type = ?", domain.LedgerMarketBuy)
	sellQ := r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("type = ?", domain.LedgerMarketSell)
	if since != nil {
		buyQ = buyQ.Where("created_at >= ?", *since)
		sellQ = sellQ.Where("created_at >= ?", *since)
	}
	if err := buyQ.Select("COALESCE(SUM(ABS(amount_nanoton)), 0)").Scan(&buyAbs).Error; err != nil {
		return nil, err
	}
	if err := sellQ.Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&sellSum).Error; err != nil {
		return nil, err
	}
	stats.FeesNanoton = buyAbs - sellSum
	if stats.FeesNanoton < 0 {
		stats.FeesNanoton = 0
	}

	active, err := r.CountActive(ctx)
	if err != nil {
		return nil, err
	}
	stats.ActiveCount = active
	return stats, nil
}

var _ domain.MarketRepository = (*MarketRepo)(nil)
