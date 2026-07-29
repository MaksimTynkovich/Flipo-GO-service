package inventory

import (
	"context"

	"github.com/google/uuid"
)

type LiquidationBroker interface {
	BuybackFromUser(ctx context.Context, sellerID, itemID uuid.UUID, payout, listPrice int64) (int64, error)
	SettleCaseClaim(ctx context.Context, userID, itemID uuid.UUID, payout int64) (int64, error)
}
