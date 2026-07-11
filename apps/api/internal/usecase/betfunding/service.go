package betfunding

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type StakeInput struct {
	FundingType      domain.BetFundingType
	AmountNanoton    int64
	InventoryItemID  *uuid.UUID
	InventoryItemIDs []uuid.UUID
}

type ResolvedStake struct {
	AmountNanoton    int64
	BalanceNanoton   int64
	FundingType      domain.BetFundingType
	InventoryItemID  *uuid.UUID
	InventoryItemIDs []uuid.UUID
	GiftValues       map[uuid.UUID]int64
}

type Service struct {
	inventory domain.InventoryRepository
	market    domain.MarketRepository
	balance   *balance.Service
	valuator  *gifts.Valuator
}

func NewService(
	inventory domain.InventoryRepository,
	market domain.MarketRepository,
	balance *balance.Service,
	valuator *gifts.Valuator,
) *Service {
	return &Service{
		inventory: inventory,
		market:    market,
		balance:   balance,
		valuator:  valuator,
	}
}

func (in StakeInput) GiftIDs() []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	out := make([]uuid.UUID, 0, len(in.InventoryItemIDs)+1)
	add := func(id uuid.UUID) {
		if id == uuid.Nil {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if in.InventoryItemID != nil {
		add(*in.InventoryItemID)
	}
	for _, id := range in.InventoryItemIDs {
		add(id)
	}
	return out
}

func (s *Service) QuoteGift(ctx context.Context, userID, itemID uuid.UUID) (int64, error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return 0, err
	}
	if item.UserID != userID || item.Status != domain.InvAvailable || domain.IsProfileVirtualItem(*item) {
		return 0, domain.ErrGiftNotAvailable
	}
	valuation, _ := s.valuator.QuoteInventoryValuation(ctx, *item)
	if valuation <= 0 {
		valuation = item.FloorPriceNanoton
	}
	if valuation <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	return valuation, nil
}

func (s *Service) QuoteStake(ctx context.Context, userID uuid.UUID, in StakeInput) (int64, error) {
	giftIDs := in.GiftIDs()
	total := in.AmountNanoton
	if total < 0 {
		total = 0
	}
	for _, id := range giftIDs {
		valuation, err := s.QuoteGift(ctx, userID, id)
		if err != nil {
			return 0, err
		}
		total += valuation
	}
	if total <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	return total, nil
}

func (s *Service) ResolveAndLock(ctx context.Context, userID, refID uuid.UUID, in StakeInput, ledgerRefType string) (*ResolvedStake, error) {
	giftIDs := in.GiftIDs()
	balanceAmount := in.AmountNanoton
	if balanceAmount < 0 {
		balanceAmount = 0
	}

	// Legacy exclusive modes: gift requires IDs; balance requires amount when no gifts.
	if len(giftIDs) == 0 {
		if in.FundingType == domain.BetFundingGift || in.FundingType == domain.BetFundingCombined {
			return nil, domain.ErrGiftNotAvailable
		}
		if balanceAmount <= 0 {
			return nil, domain.ErrInvalidAmount
		}
		if _, err := s.balance.Debit(ctx, userID, balanceAmount, domain.LedgerBet, ledgerRefType, refID); err != nil {
			return nil, err
		}
		return &ResolvedStake{
			AmountNanoton:  balanceAmount,
			BalanceNanoton: balanceAmount,
			FundingType:    domain.BetFundingBalance,
		}, nil
	}

	locked := make([]uuid.UUID, 0, len(giftIDs))
	giftValues := make(map[uuid.UUID]int64, len(giftIDs))
	var giftTotal int64

	rollbackGifts := func() {
		for _, id := range locked {
			_ = s.inventory.ReleaseFromBet(ctx, id)
		}
	}

	for _, id := range giftIDs {
		valuation, err := s.QuoteGift(ctx, userID, id)
		if err != nil {
			rollbackGifts()
			return nil, err
		}
		if err := s.inventory.LockForBet(ctx, userID, id); err != nil {
			rollbackGifts()
			return nil, domain.ErrGiftNotAvailable
		}
		locked = append(locked, id)
		giftValues[id] = valuation
		giftTotal += valuation
	}

	if balanceAmount > 0 {
		if _, err := s.balance.Debit(ctx, userID, balanceAmount, domain.LedgerBet, ledgerRefType, refID); err != nil {
			rollbackGifts()
			return nil, err
		}
	}

	ft := domain.BetFundingGift
	if balanceAmount > 0 {
		ft = domain.BetFundingCombined
	}
	first := giftIDs[0]
	return &ResolvedStake{
		AmountNanoton:    balanceAmount + giftTotal,
		BalanceNanoton:   balanceAmount,
		FundingType:      ft,
		InventoryItemID:  &first,
		InventoryItemIDs: append([]uuid.UUID(nil), giftIDs...),
		GiftValues:       giftValues,
	}, nil
}

func (s *Service) Rollback(ctx context.Context, userID, refID uuid.UUID, stake *ResolvedStake, ledgerRefType string) {
	if stake == nil {
		return
	}

	giftIDs := stake.InventoryItemIDs
	if len(giftIDs) == 0 && stake.InventoryItemID != nil {
		giftIDs = []uuid.UUID{*stake.InventoryItemID}
	}
	for _, id := range giftIDs {
		_ = s.inventory.ReleaseFromBet(ctx, id)
	}

	refund := stake.BalanceNanoton
	if refund <= 0 && stake.FundingType == domain.BetFundingBalance && stake.AmountNanoton > 0 {
		refund = stake.AmountNanoton
	}
	if refund > 0 {
		_, _ = s.balance.Credit(ctx, userID, refund, domain.LedgerRefund, ledgerRefType, refID)
	}
}

func (s *Service) ReleaseOnWin(ctx context.Context, bet domain.GameBet) error {
	if bet.FundingType != domain.BetFundingGift || bet.InventoryItemID == nil {
		return nil
	}
	return s.inventory.ReleaseFromBet(ctx, *bet.InventoryItemID)
}

// WinTONCredit returns how much TON to credit on win. Gift stakes return only profit;
// the gift itself is released separately and must not be paid out again in TON.
func (s *Service) WinTONCredit(bet domain.GameBet, grossPayout int64) int64 {
	if bet.FundingType != domain.BetFundingGift {
		return grossPayout
	}
	profit := grossPayout - bet.AmountNanoton
	if profit < 0 {
		return 0
	}
	return profit
}

func (s *Service) SettleLoss(ctx context.Context, bet domain.GameBet) error {
	if bet.FundingType != domain.BetFundingGift || bet.InventoryItemID == nil {
		return nil
	}
	return s.market.AcquireGiftFromBet(ctx, *bet.InventoryItemID)
}

func (s *Service) TransferLossToWinner(ctx context.Context, bet domain.GameBet, winnerID uuid.UUID) error {
	if bet.InventoryItemID == nil {
		return nil
	}
	if bet.FundingType != domain.BetFundingGift && bet.FundingType != domain.BetFundingCombined {
		return nil
	}
	return s.inventory.TransferFromBet(ctx, *bet.InventoryItemID, winnerID)
}

func ParseFundingType(raw string) domain.BetFundingType {
	switch raw {
	case string(domain.BetFundingGift):
		return domain.BetFundingGift
	case string(domain.BetFundingCombined):
		return domain.BetFundingCombined
	default:
		return domain.BetFundingBalance
	}
}
