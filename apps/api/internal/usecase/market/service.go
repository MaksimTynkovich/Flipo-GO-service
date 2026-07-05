package market

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
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
	feeBps    int
}

func NewService(market domain.MarketRepository, inventory domain.InventoryRepository, users domain.UserRepository, feeBps int) *Service {
	return &Service{market: market, inventory: inventory, users: users, feeBps: feeBps}
}

func (s *Service) List(ctx context.Context, limit, offset int) ([]ListingView, error) {
	listings, err := s.market.ListActive(ctx, limit, offset)
	if err != nil {
		return nil, err
	}
	out := make([]ListingView, 0, len(listings))
	for _, l := range listings {
		out = append(out, toListingView(l))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (*ListingView, error) {
	listing, err := s.market.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	v := toListingView(*listing)
	return &v, nil
}

func (s *Service) ListMine(ctx context.Context, userID uuid.UUID) ([]ListingView, error) {
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
	return s.market.CancelListing(ctx, listingID, userID)
}

func (s *Service) Purchase(ctx context.Context, buyerID, listingID uuid.UUID) (int64, error) {
	listing, err := s.market.FindByID(ctx, listingID)
	if err != nil {
		return 0, err
	}
	if listing.Status != domain.ListingActive {
		return 0, domain.ErrNotFound
	}

	price := listing.PriceNanoton
	fee := price * int64(s.feeBps) / 10000
	sellerProceeds := price - fee

	_, err = s.market.Purchase(ctx, listingID, buyerID, price, sellerProceeds, s.feeBps)
	if err != nil {
		return 0, err
	}

	user, err := s.users.FindByID(ctx, buyerID)
	if err != nil {
		return 0, err
	}
	return user.BettingBalance, nil
}

// BuybackFromUser pays the seller and lists the gift on the market under the bot account.
func (s *Service) BuybackFromUser(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error) {
	return s.market.SellToBot(ctx, sellerID, itemID, payout, listPrice)
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
