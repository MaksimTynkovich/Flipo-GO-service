package balance

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type BalanceNotifier interface {
	BalanceUpdated(userID uuid.UUID, balanceNanoton int64)
}

type Service struct {
	users    domain.UserRepository
	notifier BalanceNotifier
}

func NewService(users domain.UserRepository) *Service {
	return &Service{users: users}
}

func (s *Service) SetNotifier(notifier BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) Debit(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	if amount <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	balanceAfter, err := s.users.UpdateBalance(ctx, userID, -amount, ledgerType, refType, refID)
	if err == nil {
		s.notifyBalance(userID, balanceAfter)
	}
	return balanceAfter, err
}

func (s *Service) Credit(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	if amount <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	balanceAfter, err := s.users.UpdateBalance(ctx, userID, amount, ledgerType, refType, refID)
	if err == nil {
		s.notifyBalance(userID, balanceAfter)
	}
	return balanceAfter, err
}

func (s *Service) notifyBalance(userID uuid.UUID, balanceNanoton int64) {
	if s.notifier == nil {
		return
	}
	s.notifier.BalanceUpdated(userID, balanceNanoton)
}

func (s *Service) GetBalance(ctx context.Context, userID uuid.UUID) (int64, error) {
	return s.users.GetBalanceForUpdate(ctx, userID)
}
