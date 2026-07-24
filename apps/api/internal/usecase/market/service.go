package market

import (
	"context"
	"encoding/json"
	"errors"
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
	listings, err := s.market.ListActive(ctx, limit, offset, sort)
	if err != nil {
		return nil, err
	}
	out := make([]ListingView, 0, len(listings))
	for _, l := range listings {
		l = s.refreshBotListing(ctx, l)
		out = append(out, toListingView(l))
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

func (s *Service) CreateListing(ctx context.Context, userID, itemID uuid.UUID, priceNanoton int64) (*ListingView, error) {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return nil, err
	}
	if priceNanoton <= 0 {
		return nil, domain.ErrInvalidAmount
	}

	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if item.UserID != userID {
		return nil, domain.ErrForbidden
	}
	if item.Status != domain.InvAvailable {
		return nil, domain.ErrInvalidAmount
	}
	if domain.IsProfileVirtualItem(*item) {
		return nil, domain.ErrInvalidAmount
	}

	if _, err := s.market.FindActiveByItemID(ctx, itemID); err == nil {
		return nil, domain.ErrAlreadyListed
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvLocked); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	listing := &domain.MarketListing{
		ID:              uuid.New(),
		SellerID:        userID,
		InventoryItemID: itemID,
		PriceNanoton:    priceNanoton,
		Status:          domain.ListingActive,
		Source:          domain.ListingSourceUser,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := s.market.CreateListing(ctx, listing); err != nil {
		_ = s.inventory.UpdateStatus(ctx, itemID, domain.InvLocked, domain.InvAvailable)
		return nil, err
	}

	full, err := s.market.FindByID(ctx, listing.ID)
	if err != nil {
		return nil, err
	}
	v := toListingView(*full)
	return &v, nil
}

func (s *Service) CancelListing(ctx context.Context, userID, listingID uuid.UUID) error {
	if err := domain.EnsureMarketEnabled(); err != nil {
		return err
	}
	return s.market.CancelListing(ctx, listingID, userID)
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

// RelistBotGiftIfNeeded creates a market listing when the bot owns a locked inventory item
// without an active listing (e.g. gift returned after a lost bet).
func (s *Service) RelistBotGiftIfNeeded(ctx context.Context, item *domain.InventoryItem, priceNanoton int64) (bool, error) {
	if item == nil || priceNanoton <= 0 {
		return false, nil
	}
	botUser, err := s.market.EnsureBotUser(ctx)
	if err != nil {
		return false, err
	}
	if item.UserID != botUser.ID || item.Status != domain.InvLocked {
		return false, nil
	}
	if _, err := s.market.FindActiveByItemID(ctx, item.ID); err == nil {
		return false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, err
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
