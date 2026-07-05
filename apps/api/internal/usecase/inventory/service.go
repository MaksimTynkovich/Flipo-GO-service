package inventory

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type ItemView struct {
	domain.InventoryItem
	BuybackPriceNanoton int64 `json:"buyback_price_nanoton"`
}

type Service struct {
	inventory domain.InventoryRepository
	users     domain.UserRepository
	deposit   *telegram.DepositService
	valuator  *gifts.Valuator
}

func NewService(inventory domain.InventoryRepository, users domain.UserRepository, deposit *telegram.DepositService, valuator *gifts.Valuator) *Service {
	return &Service{inventory: inventory, users: users, deposit: deposit, valuator: valuator}
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
		out = append(out, s.toItemView(ctx, item))
	}
	return out, nil
}

func (s *Service) toItemView(ctx context.Context, item domain.InventoryItem) ItemView {
	return BuildItemView(ctx, s.valuator, item)
}

func BuildItemView(ctx context.Context, valuator *gifts.Valuator, item domain.InventoryItem) ItemView {
	view := ItemView{InventoryItem: item}
	if valuator == nil {
		view.BuybackPriceNanoton = item.FloorPriceNanoton
		return view
	}
	price, _ := valuator.QuoteInventoryBuyback(ctx, item)
	if price > 0 {
		view.BuybackPriceNanoton = price
	} else {
		view.BuybackPriceNanoton = applyBuybackFallback(item.FloorPriceNanoton)
	}
	return view
}

func applyBuybackFallback(floor int64) int64 {
	if floor <= 0 {
		return 0
	}
	return int64(float64(floor) * (1 - gifts.BuybackHaircut))
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

	now := time.Now().UTC()
	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvLiquidated); err != nil {
		return 0, err
	}

	payout := item.FloorPriceNanoton
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryBuyback(ctx, *item); price > 0 {
			payout = price
		} else {
			payout = applyBuybackFallback(item.FloorPriceNanoton)
		}
	}
	if payout <= 0 {
		return 0, domain.ErrInvalidAmount
	}

	balance, err := s.users.UpdateBalance(ctx, userID, payout, domain.LedgerLiquidate, "inventory", itemID)
	if err != nil {
		return 0, err
	}
	_ = now
	return balance, nil
}

func (s *Service) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	return s.inventory.SetFloorPrice(ctx, slug, price)
}
