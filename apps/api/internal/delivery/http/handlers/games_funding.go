package handlers

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	"github.com/google/uuid"
)

func parseStakeInput(funding string, amountNanoton int64, inventoryItemID string, inventoryItemIDs []string) (betfunding.StakeInput, error) {
	return parseStakeInputOpts(funding, amountNanoton, inventoryItemID, inventoryItemIDs, false)
}

// parseStakeInputAllowZeroBalance is for PvP join: room stake is applied server-side for TON-only joins.
func parseStakeInputAllowZeroBalance(funding string, amountNanoton int64, inventoryItemID string, inventoryItemIDs []string) (betfunding.StakeInput, error) {
	return parseStakeInputOpts(funding, amountNanoton, inventoryItemID, inventoryItemIDs, true)
}

func parseStakeInputOpts(funding string, amountNanoton int64, inventoryItemID string, inventoryItemIDs []string, allowZeroBalance bool) (betfunding.StakeInput, error) {
	ids, err := parseInventoryItemIDs(inventoryItemID, inventoryItemIDs)
	if err != nil {
		return betfunding.StakeInput{}, err
	}

	ft := betfunding.ParseFundingType(funding)
	if len(ids) > 0 && amountNanoton > 0 {
		ft = domain.BetFundingCombined
	} else if len(ids) > 0 {
		ft = domain.BetFundingGift
	} else if funding == "" {
		ft = domain.BetFundingBalance
	}

	in := betfunding.StakeInput{
		FundingType:      ft,
		AmountNanoton:    amountNanoton,
		InventoryItemIDs: ids,
	}
	if len(ids) > 0 {
		first := ids[0]
		in.InventoryItemID = &first
	}

	if len(ids) > 0 {
		return in, nil
	}
	if amountNanoton <= 0 && !allowZeroBalance {
		return betfunding.StakeInput{}, domain.ErrInvalidAmount
	}
	return in, nil
}

func parseInventoryItemIDs(singular string, plural []string) ([]uuid.UUID, error) {
	seen := make(map[uuid.UUID]struct{})
	out := make([]uuid.UUID, 0, len(plural)+1)
	add := func(raw string) error {
		if raw == "" {
			return nil
		}
		id, err := uuid.Parse(raw)
		if err != nil {
			return domain.ErrGiftNotAvailable
		}
		if _, ok := seen[id]; ok {
			return nil
		}
		seen[id] = struct{}{}
		out = append(out, id)
		return nil
	}
	if err := add(singular); err != nil {
		return nil, err
	}
	for _, raw := range plural {
		if err := add(raw); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (h *GameHandler) stakeAmount(ctx context.Context, userID uuid.UUID, stake betfunding.StakeInput) (int64, error) {
	return h.funding.QuoteStake(ctx, userID, stake)
}
