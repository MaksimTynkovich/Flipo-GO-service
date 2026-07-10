package betfunding

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type StakeInput struct {
	FundingType     domain.BetFundingType
	AmountNanoton   int64
	InventoryItemID *uuid.UUID
}

type ResolvedStake struct {
	AmountNanoton   int64
	FundingType     domain.BetFundingType
	InventoryItemID *uuid.UUID
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

func (s *Service) QuoteGift(ctx context.Context, userID, itemID uuid.UUID) (int64, error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return 0, err
	}
	if item.UserID != userID || item.Status != domain.InvAvailable || domain.IsProfileVirtualItem(*item) {
		return 0, domain.ErrGiftNotAvailable
	}
	valuation, _ := s.valuator.QuoteInventoryBuyback(ctx, *item)
	if valuation <= 0 {
		valuation = gifts.ApplyBuybackHaircut(item.FloorPriceNanoton)
	}
	if valuation <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	return valuation, nil
}

func (s *Service) ResolveAndLock(ctx context.Context, userID, refID uuid.UUID, in StakeInput, ledgerRefType string) (*ResolvedStake, error) {
	switch in.FundingType {
	case domain.BetFundingGift:
		if in.InventoryItemID == nil {
			return nil, domain.ErrGiftNotAvailable
		}
		valuation, err := s.QuoteGift(ctx, userID, *in.InventoryItemID)
		if err != nil {
			return nil, err
		}
		if err := s.inventory.LockForBet(ctx, userID, *in.InventoryItemID); err != nil {
			return nil, domain.ErrGiftNotAvailable
		}
		itemID := *in.InventoryItemID
		return &ResolvedStake{
			AmountNanoton:   valuation,
			FundingType:     domain.BetFundingGift,
			InventoryItemID: &itemID,
		}, nil
	default:
		if in.AmountNanoton <= 0 {
			return nil, domain.ErrInvalidAmount
		}
		if _, err := s.balance.Debit(ctx, userID, in.AmountNanoton, domain.LedgerBet, ledgerRefType, refID); err != nil {
			return nil, err
		}
		return &ResolvedStake{
			AmountNanoton: in.AmountNanoton,
			FundingType:   domain.BetFundingBalance,
		}, nil
	}
}

func (s *Service) Rollback(ctx context.Context, userID, refID uuid.UUID, stake *ResolvedStake, ledgerRefType string) {
	if stake == nil {
		return
	}
	switch stake.FundingType {
	case domain.BetFundingGift:
		if stake.InventoryItemID != nil {
			_ = s.inventory.ReleaseFromBet(ctx, *stake.InventoryItemID)
		}
	default:
		if stake.AmountNanoton > 0 {
			_, _ = s.balance.Credit(ctx, userID, stake.AmountNanoton, domain.LedgerRefund, ledgerRefType, refID)
		}
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
	if bet.FundingType != domain.BetFundingGift || bet.InventoryItemID == nil {
		return nil
	}
	return s.inventory.TransferFromBet(ctx, *bet.InventoryItemID, winnerID)
}

func ParseFundingType(raw string) domain.BetFundingType {
	if raw == string(domain.BetFundingGift) {
		return domain.BetFundingGift
	}
	return domain.BetFundingBalance
}
