package balance

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func NotifyUser(ctx context.Context, users domain.UserRepository, notifier BalanceNotifier, userID uuid.UUID, deltaNanoton int64, ledgerType domain.LedgerType) {
	if notifier == nil {
		return
	}
	user, err := users.FindByID(ctx, userID)
	if err != nil {
		return
	}
	notifier.BalanceUpdated(userID, user.BettingBalance, deltaNanoton, ledgerType)
}
