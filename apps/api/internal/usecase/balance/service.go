package balance

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type Service struct {
	users domain.UserRepository
}

func NewService(users domain.UserRepository) *Service {
	return &Service{users: users}
}

func (s *Service) Debit(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	if amount <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	return s.users.UpdateBalance(ctx, userID, -amount, ledgerType, refType, refID)
}

func (s *Service) Credit(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	if amount <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	return s.users.UpdateBalance(ctx, userID, amount, ledgerType, refType, refID)
}

func (s *Service) GetBalance(ctx context.Context, userID uuid.UUID) (int64, error) {
	return s.users.GetBalanceForUpdate(ctx, userID)
}
