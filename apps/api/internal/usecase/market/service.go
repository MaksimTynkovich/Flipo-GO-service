package market

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ListingView struct {
	ID           string `json:"id"`
	PriceNanoton int64  `json:"price_nanoton"`
	Source       string `json:"source"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
	Seller       struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	} `json:"seller"`
	Item struct {
		ID                string          `json:"id"`
		Name              string          `json:"name"`
		SubName           string          `json:"sub_name"`
		Model             string          `json:"model,omitempty"`
		Symbol            string          `json:"symbol,omitempty"`
		Backdrop          string          `json:"backdrop,omitempty"`
		ImageURL          string          `json:"image_url"`
		CollectionSlug    string          `json:"collection_slug"`
		FloorPriceNanoton int64           `json:"floor_price_nanoton"`
		Metadata          json.RawMessage `json:"metadata,omitempty"`
	} `json:"item"`
}

type Service struct {
	market    domain.MarketRepository
	inventory domain.InventoryRepository
	users     domain.UserRepository
	valuator  *gifts.Valuator
	feeBps    int
	notifier  balance.BalanceNotifier
}

func NewService(market domain.MarketRepository, inventory domain.InventoryRepository, users domain.UserRepository, feeBps int) *Service {
	return &Service{market: market, inventory: inventory, users: users, feeBps: feeBps}
}

func (s *Service) SetValuator(valuator *gifts.Valuator) {
	s.valuator = valuator
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) List(ctx context.Context, limit, offset int, sort string) ([]ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	// Player storefront is bot-only.
	source := domain.ListingSourceBot
	listings, err := s.market.ListActive(ctx, limit, offset, sort, &source)
	if err != nil {
		return nil, err
	}
	out := make([]ListingView, 0, len(listings))
	for _, l := range listings {
		// Soft-reprice from cache/DB only — no Portals/MRKT HTTP. Live refresh stays on Get/Purchase.
		out = append(out, toListingView(s.refreshBotListingCached(ctx, l)))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (*ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	listing, err := s.market.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if listing.Source != domain.ListingSourceBot || listing.Status != domain.ListingActive {
		return nil, gorm.ErrRecordNotFound
	}
	refreshed := s.refreshBotListing(ctx, *listing)
	v := toListingView(refreshed)
	return &v, nil
}

func (s *Service) ListMine(ctx context.Context, userID uuid.UUID) ([]ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	listings, err := s.market.ListBySeller(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]ListingView, 0, len(listings))
	for _, l := range listings {
		out = append(out, toListingView(l))
	}
	return out, nil
}

// CreateListing is disabled for players — market is bot-only.
func (s *Service) CreateListing(ctx context.Context, userID, itemID uuid.UUID, priceNanoton int64) (*ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	_ = userID
	_ = itemID
	_ = priceNanoton
	return nil, domain.ErrForbidden
}

func (s *Service) CancelListing(ctx context.Context, userID, listingID uuid.UUID) error {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return err
	}
	return s.market.CancelListing(ctx, listingID, userID)
}

func (s *Service) EnsureBotUser(ctx context.Context) (*domain.User, error) {
	return s.market.EnsureBotUser(ctx)
}

// CancelActiveListingForItem cancels a bot/user listing for the item if one is active.
// Skips the public market feature gate (internal reconcile / cleanup).
func (s *Service) CancelActiveListingForItem(ctx context.Context, sellerID, itemID uuid.UUID) error {
	listing, err := s.market.FindActiveByItemID(ctx, itemID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.market.CancelListing(ctx, listing.ID, sellerID)
}

func (s *Service) Purchase(ctx context.Context, buyerID, listingID uuid.UUID) (*domain.User, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	listing, err := s.market.FindByID(ctx, listingID)
	if err != nil {
		return nil, err
	}
	listing = ptrListing(s.refreshBotListing(ctx, *listing))
	if listing.Status != domain.ListingActive {
		return nil, domain.ErrNotFound
	}

	price := listing.PriceNanoton
	fee := price * int64(s.feeBps) / 10000
	sellerProceeds := price - fee
	sellerID := listing.SellerID

	_, err = s.market.Purchase(ctx, listingID, buyerID, price, sellerProceeds, s.feeBps)
	if err != nil {
		return nil, err
	}

	balance.NotifyUser(ctx, s.users, s.notifier, buyerID, -price, domain.LedgerMarketBuy)
	if sellerProceeds > 0 && sellerID != buyerID {
		balance.NotifyUser(ctx, s.users, s.notifier, sellerID, sellerProceeds, domain.LedgerMarketSell)
	}

	user, err := s.users.FindByID(ctx, buyerID)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// BuybackFromUser pays the seller and lists the gift on the market under the bot account.
func (s *Service) BuybackFromUser(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error) {
	balanceAfter, err := s.market.SellToBot(ctx, sellerID, itemID, payout, listPrice)
	if err != nil {
		return 0, err
	}
	balance.NotifyUser(ctx, s.users, s.notifier, sellerID, payout, domain.LedgerLiquidate)
	return balanceAfter, nil
}

// SettleCaseClaim credits the user for a case-claim cashout and liquidates the inventory item.
func (s *Service) SettleCaseClaim(ctx context.Context, userID, itemID uuid.UUID, payout int64) (int64, error) {
	balanceAfter, err := s.market.SettleCaseClaim(ctx, userID, itemID, payout)
	if err != nil {
		return 0, err
	}
	balance.NotifyUser(ctx, s.users, s.notifier, userID, payout, domain.LedgerCaseCashout)
	return balanceAfter, nil
}

// AddBotGift registers a gift received by the bot and lists it on the market.
func (s *Service) AddBotGift(ctx context.Context, transfer BotGiftInput) (*ListingView, error) {
	botUser, err := s.market.EnsureBotUser(ctx)
	if err != nil {
		return nil, err
	}

	meta, _ := json.Marshal(map[string]string{
		"sub_name": transfer.SubName,
		"model":    transfer.Model,
		"symbol":   transfer.Symbol,
		"backdrop": transfer.Backdrop,
	})

	now := time.Now().UTC()
	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            botUser.ID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    transfer.GiftID,
		CollectionSlug:    transfer.CollectionSlug,
		TokenID:           transfer.TokenID,
		Name:              transfer.Name,
		ImageURL:          transfer.ImageURL,
		Metadata:          datatypes.JSON(meta),
		FloorPriceNanoton: transfer.PriceNanoton,
		Status:            domain.InvLocked,
		DepositedAt:       now,
		TelegramTxRef:     transfer.TxRef,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.inventory.Create(ctx, item); err != nil {
		return nil, err
	}

	listing := &domain.MarketListing{
		ID:              uuid.New(),
		SellerID:        botUser.ID,
		InventoryItemID: item.ID,
		PriceNanoton:    transfer.PriceNanoton,
		Status:          domain.ListingActive,
		Source:          domain.ListingSourceBot,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.market.CreateListing(ctx, listing); err != nil {
		return nil, err
	}

	full, err := s.market.FindByID(ctx, listing.ID)
	if err != nil {
		return nil, err
	}
	v := toListingView(*full)
	return &v, nil
}

type BotGiftInput struct {
	GiftID         string
	CollectionSlug string
	TokenID        string
	Name           string
	SubName        string
	Model          string
	Symbol         string
	Backdrop       string
	ImageURL       string
	PriceNanoton   int64
	TxRef          string
}

func (s *Service) ListActiveBotListings(ctx context.Context) ([]domain.MarketListing, error) {
	return s.market.ListActiveBySource(ctx, domain.ListingSourceBot)
}

func (s *Service) RepriceListing(ctx context.Context, listingID, itemID uuid.UUID, priceNanoton int64) error {
	if priceNanoton <= 0 {
		return domain.ErrInvalidAmount
	}
	if err := s.market.UpdateListingPrice(ctx, listingID, priceNanoton); err != nil {
		return err
	}
	return s.inventory.UpdateFloorPriceNanoton(ctx, itemID, priceNanoton)
}

// RelistBotGiftIfNeeded creates a market listing when the bot owns an available/locked
// inventory item without an active listing (e.g. after cancel, or house stock still on the account).
func (s *Service) RelistBotGiftIfNeeded(ctx context.Context, item *domain.InventoryItem, priceNanoton int64) (bool, error) {
	if item == nil || priceNanoton <= 0 {
		return false, nil
	}
	botUser, err := s.market.EnsureBotUser(ctx)
	if err != nil {
		return false, err
	}
	if item.UserID != botUser.ID {
		return false, nil
	}
	if item.Status != domain.InvAvailable && item.Status != domain.InvLocked {
		return false, nil
	}
	if domain.IsProfileVirtualItem(*item) {
		return false, nil
	}
	if _, err := s.market.FindActiveByItemID(ctx, item.ID); err == nil {
		return false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, err
	}

	wasAvailable := item.Status == domain.InvAvailable
	if wasAvailable {
		if err := s.inventory.UpdateStatus(ctx, item.ID, domain.InvAvailable, domain.InvLocked); err != nil {
			return false, err
		}
	}

	now := time.Now().UTC()
	listing := &domain.MarketListing{
		ID:              uuid.New(),
		SellerID:        botUser.ID,
		InventoryItemID: item.ID,
		PriceNanoton:    priceNanoton,
		Status:          domain.ListingActive,
		Source:          domain.ListingSourceBot,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.market.CreateListing(ctx, listing); err != nil {
		if wasAvailable {
			_ = s.inventory.UpdateStatus(ctx, item.ID, domain.InvLocked, domain.InvAvailable)
		}
		return false, err
	}
	if err := s.inventory.UpdateFloorPriceNanoton(ctx, item.ID, priceNanoton); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Service) refreshBotListing(ctx context.Context, listing domain.MarketListing) domain.MarketListing {
	if s.valuator == nil || listing.Source != domain.ListingSourceBot {
		return listing
	}
	gift := gifts.ScannedGiftFromItem(listing.Item)
	price, _ := s.valuator.QuoteValuation(ctx, gift)
	return s.applyBotListingPrice(ctx, listing, price)
}

// refreshBotListingCached syncs listing price from trait cache/DB without live market HTTP.
func (s *Service) refreshBotListingCached(ctx context.Context, listing domain.MarketListing) domain.MarketListing {
	if s.valuator == nil || listing.Source != domain.ListingSourceBot {
		return listing
	}
	gift := gifts.ScannedGiftFromItem(listing.Item)
	price, _ := s.valuator.QuoteValuationCached(ctx, gift)
	return s.applyBotListingPrice(ctx, listing, price)
}

func (s *Service) applyBotListingPrice(ctx context.Context, listing domain.MarketListing, price int64) domain.MarketListing {
	if price <= 0 || price == listing.PriceNanoton {
		return listing
	}
	if err := s.RepriceListing(ctx, listing.ID, listing.InventoryItemID, price); err != nil {
		return listing
	}
	listing.PriceNanoton = price
	listing.Item.FloorPriceNanoton = price
	return listing
}

func ptrListing(l domain.MarketListing) *domain.MarketListing {
	return &l
}

func toListingView(l domain.MarketListing) ListingView {
	meta := parseGiftMeta(l.Item.Metadata)
	sellerName := l.Seller.Username
	if sellerName == "" {
		sellerName = l.Seller.FirstName
	}
	if l.Source == domain.ListingSourceBot {
		sellerName = "Flipo Bot"
	}

	v := ListingView{
		ID:           l.ID.String(),
		PriceNanoton: l.PriceNanoton,
		Source:       string(l.Source),
		Status:       string(l.Status),
		CreatedAt:    l.CreatedAt.Format(time.RFC3339),
	}
	v.Seller.ID = l.SellerID.String()
	v.Seller.Username = sellerName
	v.Item.ID = l.Item.ID.String()
	v.Item.Name = l.Item.Name
	v.Item.SubName = meta.SubName
	v.Item.Model = meta.Model
	v.Item.Symbol = meta.Symbol
	v.Item.Backdrop = meta.Backdrop
	v.Item.ImageURL = l.Item.ImageURL
	v.Item.CollectionSlug = l.Item.CollectionSlug
	v.Item.FloorPriceNanoton = l.Item.FloorPriceNanoton
	if len(l.Item.Metadata) > 0 {
		v.Item.Metadata = json.RawMessage(l.Item.Metadata)
	}
	return v
}

type giftMeta struct {
	SubName  string `json:"sub_name"`
	Model    string `json:"model"`
	Symbol   string `json:"symbol"`
	Backdrop string `json:"backdrop"`
}

func parseGiftMeta(raw datatypes.JSON) giftMeta {
	if len(raw) == 0 {
		return giftMeta{}
	}
	var m giftMeta
	if err := json.Unmarshal(raw, &m); err != nil {
		return giftMeta{}
	}
	return m
}

type AdminListingPage struct {
	Items []ListingView `json:"items"`
	Total int64         `json:"total"`
}

type AdminListingIDsPage struct {
	IDs   []string `json:"ids"`
	Total int64    `json:"total"`
}

func (s *Service) AdminListListings(ctx context.Context, filter domain.MarketListingFilter) (*AdminListingPage, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	listings, total, err := s.market.ListFiltered(ctx, filter)
	if err != nil {
		return nil, err
	}
	out := make([]ListingView, 0, len(listings))
	for _, l := range listings {
		out = append(out, toListingView(l))
	}
	return &AdminListingPage{Items: out, Total: total}, nil
}

func (s *Service) AdminListListingIDs(ctx context.Context, filter domain.MarketListingFilter) (*AdminListingIDsPage, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	ids, total, err := s.market.ListFilteredIDs(ctx, filter)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return &AdminListingIDsPage{IDs: out, Total: total}, nil
}

func (s *Service) AdminCancelListing(ctx context.Context, listingID uuid.UUID) error {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return err
	}
	listing, err := s.market.FindByID(ctx, listingID)
	if err != nil {
		return err
	}
	if listing.Status != domain.ListingActive {
		return domain.ErrNotFound
	}
	return s.market.CancelListing(ctx, listing.ID, listing.SellerID)
}

type BulkActionResult struct {
	Updated int      `json:"updated"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors,omitempty"`
}

func (s *Service) AdminBulkListings(ctx context.Context, action string, ids []uuid.UUID, percent float64) (*BulkActionResult, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	result := &BulkActionResult{}
	switch action {
	case "cancel":
		for _, id := range ids {
			if err := s.AdminCancelListing(ctx, id); err != nil {
				result.Failed++
				result.Errors = append(result.Errors, id.String()+": "+err.Error())
				continue
			}
			result.Updated++
		}
	case "reprice_percent":
		if percent <= -100 {
			return nil, domain.ErrInvalidAmount
		}
		mult := 1 + percent/100
		for _, id := range ids {
			listing, err := s.market.FindByID(ctx, id)
			if err != nil {
				result.Failed++
				result.Errors = append(result.Errors, id.String()+": "+err.Error())
				continue
			}
			if listing.Status != domain.ListingActive {
				result.Failed++
				result.Errors = append(result.Errors, id.String()+": not active")
				continue
			}
			newPrice := int64(float64(listing.PriceNanoton) * mult)
			if newPrice <= 0 {
				result.Failed++
				result.Errors = append(result.Errors, id.String()+": invalid price")
				continue
			}
			if err := s.RepriceListing(ctx, listing.ID, listing.InventoryItemID, newPrice); err != nil {
				result.Failed++
				result.Errors = append(result.Errors, id.String()+": "+err.Error())
				continue
			}
			result.Updated++
		}
	default:
		return nil, domain.ErrInvalidAmount
	}
	return result, nil
}

type BotStockItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	SubName           string `json:"sub_name"`
	Model             string `json:"model,omitempty"`
	Symbol            string `json:"symbol,omitempty"`
	Backdrop          string `json:"backdrop,omitempty"`
	ImageURL          string `json:"image_url"`
	CollectionSlug    string `json:"collection_slug"`
	FloorPriceNanoton int64  `json:"floor_price_nanoton"`
	Status            string `json:"status"`
	Listed            bool   `json:"listed"`
	ListingID         string `json:"listing_id,omitempty"`
	ListingPrice      int64  `json:"listing_price_nanoton,omitempty"`
	SuggestedPrice    int64  `json:"suggested_price_nanoton,omitempty"`
}

type BotStockPage struct {
	Items []BotStockItem `json:"items"`
	Total int64          `json:"total"`
}

func (s *Service) AdminListBotStock(ctx context.Context, q string, listed *bool, limit, offset int) (*BotStockPage, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	botUser, err := s.market.EnsureBotUser(ctx)
	if err != nil {
		return nil, err
	}
	items, err := s.inventory.ListByUser(ctx, botUser.ID, nil)
	if err != nil {
		return nil, err
	}

	out := make([]BotStockItem, 0, len(items))
	for _, item := range items {
		if item.Status != domain.InvAvailable && item.Status != domain.InvLocked {
			continue
		}
		if domain.IsProfileVirtualItem(item) {
			continue
		}
		meta := parseGiftMeta(item.Metadata)
		if q != "" {
			ql := strings.ToLower(q)
			hay := strings.ToLower(item.Name + " " + item.CollectionSlug + " " + meta.Model + " " + meta.SubName)
			if !strings.Contains(hay, ql) {
				continue
			}
		}
		row := BotStockItem{
			ID:                item.ID.String(),
			Name:              item.Name,
			SubName:           meta.SubName,
			Model:             meta.Model,
			Symbol:            meta.Symbol,
			Backdrop:          meta.Backdrop,
			ImageURL:          item.ImageURL,
			CollectionSlug:    item.CollectionSlug,
			FloorPriceNanoton: item.FloorPriceNanoton,
			Status:            string(item.Status),
		}
		if listing, err := s.market.FindActiveByItemID(ctx, item.ID); err == nil {
			row.Listed = true
			row.ListingID = listing.ID.String()
			row.ListingPrice = listing.PriceNanoton
		}
		if listed != nil && *listed != row.Listed {
			continue
		}
		if !row.Listed && s.valuator != nil {
			gift := gifts.ScannedGiftFromItem(item)
			if price, _ := s.valuator.QuoteValuation(ctx, gift); price > 0 {
				row.SuggestedPrice = price
			}
		}
		out = append(out, row)
	}

	total := int64(len(out))
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	if offset > len(out) {
		offset = len(out)
	}
	end := offset + limit
	if end > len(out) {
		end = len(out)
	}
	return &BotStockPage{Items: out[offset:end], Total: total}, nil
}

func (s *Service) AdminCreateBotListing(ctx context.Context, itemID uuid.UUID, priceNanoton int64) (*ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	botUser, err := s.market.EnsureBotUser(ctx)
	if err != nil {
		return nil, err
	}
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item.UserID != botUser.ID {
		return nil, domain.ErrForbidden
	}
	if domain.IsProfileVirtualItem(*item) {
		return nil, domain.ErrInvalidAmount
	}
	if _, err := s.market.FindActiveByItemID(ctx, itemID); err == nil {
		return nil, domain.ErrAlreadyListed
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if priceNanoton <= 0 && s.valuator != nil {
		gift := gifts.ScannedGiftFromItem(*item)
		priceNanoton, _ = s.valuator.QuoteValuation(ctx, gift)
	}
	if priceNanoton <= 0 {
		priceNanoton = item.FloorPriceNanoton
	}
	if priceNanoton <= 0 {
		return nil, domain.ErrInvalidAmount
	}

	switch item.Status {
	case domain.InvAvailable:
		if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvLocked); err != nil {
			return nil, err
		}
	case domain.InvLocked:
		// already locked — list as-is
	default:
		return nil, domain.ErrInvalidAmount
	}

	now := time.Now().UTC()
	listing := &domain.MarketListing{
		ID:              uuid.New(),
		SellerID:        botUser.ID,
		InventoryItemID: itemID,
		PriceNanoton:    priceNanoton,
		Status:          domain.ListingActive,
		Source:          domain.ListingSourceBot,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.market.CreateListing(ctx, listing); err != nil {
		if item.Status == domain.InvAvailable {
			_ = s.inventory.UpdateStatus(ctx, itemID, domain.InvLocked, domain.InvAvailable)
		}
		return nil, err
	}
	_ = s.inventory.UpdateFloorPriceNanoton(ctx, itemID, priceNanoton)

	full, err := s.market.FindByID(ctx, listing.ID)
	if err != nil {
		return nil, err
	}
	v := toListingView(*full)
	return &v, nil
}

func (s *Service) AdminStats(ctx context.Context, since *time.Time) (*domain.MarketStats, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	return s.market.MarketStats(ctx, since)
}
