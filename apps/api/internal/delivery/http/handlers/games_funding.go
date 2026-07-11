package handlers

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	"github.com/google/uuid"
)

func parseStakeInput(funding string, amountNanoton int64, inventoryItemID string) (betfunding.StakeInput, error) {
	return parseStakeInputOpts(funding, amountNanoton, inventoryItemID, false)
}

// parseStakeInputAllowZeroBalance is for PvP join: room stake is applied server-side.
func parseStakeInputAllowZeroBalance(funding string, amountNanoton int64, inventoryItemID string) (betfunding.StakeInput, error) {
	return parseStakeInputOpts(funding, amountNanoton, inventoryItemID, true)
}

func parseStakeInputOpts(funding string, amountNanoton int64, inventoryItemID string, allowZeroBalance bool) (betfunding.StakeInput, error) {
	ft := betfunding.ParseFundingType(funding)
	in := betfunding.StakeInput{
		FundingType:   ft,
		AmountNanoton: amountNanoton,
	}
	if ft == domain.BetFundingGift {
		if inventoryItemID == "" {
			return betfunding.StakeInput{}, domain.ErrGiftNotAvailable
		}
		id, err := uuid.Parse(inventoryItemID)
		if err != nil {
			return betfunding.StakeInput{}, domain.ErrGiftNotAvailable
		}
		in.InventoryItemID = &id
		return in, nil
	}
	if amountNanoton <= 0 && !allowZeroBalance {
		return betfunding.StakeInput{}, domain.ErrInvalidAmount
	}
	return in, nil
}

func (h *GameHandler) stakeAmount(ctx context.Context, userID uuid.UUID, stake betfunding.StakeInput) (int64, error) {
	if stake.FundingType == domain.BetFundingGift {
		if stake.InventoryItemID == nil {
			return 0, domain.ErrGiftNotAvailable
		}
		return h.funding.QuoteGift(ctx, userID, *stake.InventoryItemID)
	}
	return stake.AmountNanoton, nil
}
