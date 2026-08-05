package balance

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type BalanceNotifier interface {
	BalanceUpdated(userID uuid.UUID, balanceNanoton, deltaNanoton int64, ledgerType domain.LedgerType)
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
	balanceAfter, _, err := s.DebitDetailed(ctx, userID, amount, ledgerType, refType, refID)
	return balanceAfter, err
}

// DebitDetailed debits balance and reports how much of the spend came from admin_adjust credit.
func (s *Service) DebitDetailed(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (balanceAfter, adminFunded int64, err error) {
	if amount <= 0 {
		return 0, 0, domain.ErrInvalidAmount
	}
	balanceAfter, adminFunded, err = s.users.UpdateBalance(ctx, userID, -amount, ledgerType, refType, refID)
	if err != nil {
		return 0, 0, err
	}
	s.notifyBalance(ctx, userID, balanceAfter, -amount, ledgerType)
	return balanceAfter, adminFunded, nil
}

func (s *Service) Credit(ctx context.Context, userID uuid.UUID, amount int64, ledgerType domain.LedgerType, refType string, refID uuid.UUID) (int64, error) {
	if amount <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	balanceAfter, _, err := s.users.UpdateBalance(ctx, userID, amount, ledgerType, refType, refID)
	if err == nil {
		s.notifyBalance(ctx, userID, balanceAfter, amount, ledgerType)
	}
	return balanceAfter, err
}

func (s *Service) RestoreAdminCredit(ctx context.Context, userID uuid.UUID, amount int64) error {
	return s.users.RestoreAdminCredit(ctx, userID, amount)
}

func (s *Service) notifyBalance(_ context.Context, userID uuid.UUID, balanceNanoton, deltaNanoton int64, ledgerType domain.LedgerType) {
	if s.notifier == nil {
		return
	}
	s.notifier.BalanceUpdated(userID, balanceNanoton, deltaNanoton, ledgerType)
}

func (s *Service) GetBalance(ctx context.Context, userID uuid.UUID) (int64, error) {
	return s.users.GetBalanceForUpdate(ctx, userID)
}
