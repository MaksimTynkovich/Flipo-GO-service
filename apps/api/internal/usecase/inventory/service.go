package inventory

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type Service struct {
	inventory domain.InventoryRepository
	users     domain.UserRepository
	deposit   *telegram.DepositService
}

func NewService(inventory domain.InventoryRepository, users domain.UserRepository, deposit *telegram.DepositService) *Service {
	return &Service{inventory: inventory, users: users, deposit: deposit}
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]domain.InventoryItem, error) {
	status := domain.InvAvailable
	return s.inventory.ListByUser(ctx, userID, &status)
}

func (s *Service) ListAll(ctx context.Context, userID uuid.UUID) ([]domain.InventoryItem, error) {
	return s.inventory.ListByUser(ctx, userID, nil)
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

	balance, err := s.users.UpdateBalance(ctx, userID, item.FloorPriceNanoton, domain.LedgerLiquidate, "inventory", itemID)
	if err != nil {
		return 0, err
	}
	_ = now
	return balance, nil
}

func (s *Service) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	return s.inventory.SetFloorPrice(ctx, slug, price)
}
