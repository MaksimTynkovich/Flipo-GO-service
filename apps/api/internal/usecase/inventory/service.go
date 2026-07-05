package inventory

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type ItemView struct {
	domain.InventoryItem
	BuybackPriceNanoton int64  `json:"buyback_price_nanoton"`
	Model               string `json:"model,omitempty"`
	Symbol              string `json:"symbol,omitempty"`
	Backdrop            string `json:"backdrop,omitempty"`
}

type Service struct {
	inventory domain.InventoryRepository
	users     domain.UserRepository
	deposit   *telegram.DepositService
	valuator  *gifts.Valuator
	market    LiquidationBroker
}

func NewService(inventory domain.InventoryRepository, users domain.UserRepository, deposit *telegram.DepositService, valuator *gifts.Valuator, market LiquidationBroker) *Service {
	return &Service{inventory: inventory, users: users, deposit: deposit, valuator: valuator, market: market}
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]domain.InventoryItem, error) {
	status := domain.InvAvailable
	return s.inventory.ListByUser(ctx, userID, &status)
}

func (s *Service) ListAll(ctx context.Context, userID uuid.UUID) ([]ItemView, error) {
	items, err := s.inventory.ListByUser(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	out := make([]ItemView, 0, len(items))
	for _, item := range items {
		if isProfileVirtualItem(item) {
			continue
		}
		out = append(out, s.toItemView(ctx, item))
	}
	return out, nil
}

func (s *Service) toItemView(ctx context.Context, item domain.InventoryItem) ItemView {
	return BuildItemView(ctx, s.valuator, item)
}

func BuildItemView(ctx context.Context, valuator *gifts.Valuator, item domain.InventoryItem) ItemView {
	view := ItemView{InventoryItem: item}
	attrs := gifts.ItemAttributes(item.Metadata)
	view.Model = attrs.Model
	view.Symbol = attrs.Symbol
	view.Backdrop = attrs.Backdrop

	if valuator == nil {
		view.BuybackPriceNanoton = gifts.ApplyBuybackHaircut(item.FloorPriceNanoton)
		return view
	}
	price, _ := valuator.QuoteInventoryBuyback(ctx, item)
	if price > 0 {
		view.BuybackPriceNanoton = price
	} else {
		view.BuybackPriceNanoton = gifts.ApplyBuybackHaircut(item.FloorPriceNanoton)
	}
	return view
}

func (s *Service) Deposit(ctx context.Context, userID uuid.UUID, txRef string) (*domain.InventoryItem, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.deposit.ProcessDeposit(ctx, user, txRef)
}

func (s *Service) Liquidate(ctx context.Context, userID, itemID uuid.UUID) (int64, error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return 0, err
	}
	if item.UserID != userID {
		return 0, domain.ErrInvalidAmount
	}
	if item.Status != domain.InvAvailable {
		return 0, domain.ErrInvalidAmount
	}
	if isProfileVirtualItem(*item) {
		return 0, domain.ErrInvalidAmount
	}

	payout := item.FloorPriceNanoton
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryBuyback(ctx, *item); price > 0 {
			payout = price
		} else {
			payout = gifts.ApplyBuybackHaircut(item.FloorPriceNanoton)
		}
	}
	if payout <= 0 {
		return 0, domain.ErrInvalidAmount
	}

	if s.market == nil {
		return 0, domain.ErrInvalidAmount
	}

	return s.market.BuybackFromUser(ctx, userID, itemID, payout, payout)
}

func (s *Service) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	return s.inventory.SetFloorPrice(ctx, slug, price)
}

func isProfileVirtualItem(item domain.InventoryItem) bool {
	return domain.IsProfileVirtualItem(item)
}
