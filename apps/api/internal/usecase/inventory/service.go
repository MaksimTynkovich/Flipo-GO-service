package inventory

import (
	"context"
	"errors"
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type ItemView struct {
	domain.InventoryItem
	BuybackPriceNanoton  int64  `json:"buyback_price_nanoton"`
	ValuationNanoton     int64  `json:"valuation_nanoton"`
	Model                string `json:"model,omitempty"`
	Symbol               string `json:"symbol,omitempty"`
	Backdrop             string `json:"backdrop,omitempty"`
}

type Service struct {
	inventory       domain.InventoryRepository
	users           domain.UserRepository
	deposit         *telegram.DepositService
	giftTransfer    *telegram.GiftTransferService
	valuator        *gifts.Valuator
	market          LiquidationBroker
	admin           *telegram.AdminNotifier
	depositNotifier GiftDepositNotifier
	withdrawHold    WithdrawHoldChecker
}

// WithdrawHoldChecker reports silent withdrawal holds (global or per-user).
type WithdrawHoldChecker interface {
	IsUserWithdrawHeld(ctx context.Context, userID uuid.UUID) (held bool, reason string, err error)
}

func NewService(
	inventory domain.InventoryRepository,
	users domain.UserRepository,
	deposit *telegram.DepositService,
	giftTransfer *telegram.GiftTransferService,
	valuator *gifts.Valuator,
	market LiquidationBroker,
) *Service {
	return &Service{
		inventory:    inventory,
		users:        users,
		deposit:      deposit,
		giftTransfer: giftTransfer,
		valuator:     valuator,
		market:       market,
	}
}

func (s *Service) SetWithdrawHoldChecker(checker WithdrawHoldChecker) {
	s.withdrawHold = checker
}

func (s *Service) SetAdminNotifier(notifier *telegram.AdminNotifier) {
	s.admin = notifier
}

func (s *Service) SetGiftDepositNotifier(notifier GiftDepositNotifier) {
	s.depositNotifier = notifier
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]domain.InventoryItem, error) {
	status := domain.InvAvailable
	return s.inventory.ListByUser(ctx, userID, &status)
}

func (s *Service) ListAll(ctx context.Context, userID uuid.UUID) ([]ItemView, error) {
	items, err := s.inventory.ListByUser(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	out := make([]ItemView, 0, len(items))
	for _, item := range items {
		if isProfileVirtualItem(item) || item.Status == domain.InvWithdrawn {
			continue
		}
		out = append(out, s.toItemView(ctx, item))
	}
	return out, nil
}

func (s *Service) toItemView(ctx context.Context, item domain.InventoryItem) ItemView {
	return BuildItemView(ctx, s.valuator, item)
}

func BuildItemView(ctx context.Context, valuator *gifts.Valuator, item domain.InventoryItem) ItemView {
	view := ItemView{InventoryItem: item}
	attrs := gifts.ItemAttributes(item.Metadata)
	view.Model = attrs.Model
	view.Symbol = attrs.Symbol
	view.Backdrop = attrs.Backdrop

	if valuator == nil {
		view.BuybackPriceNanoton = item.FloorPriceNanoton
		view.ValuationNanoton = item.FloorPriceNanoton
		return view
	}
	if price, _ := valuator.QuoteInventoryBuyback(ctx, item); price > 0 {
		view.BuybackPriceNanoton = price
	} else {
		view.BuybackPriceNanoton = item.FloorPriceNanoton
	}
	if price, _ := valuator.QuoteInventoryValuation(ctx, item); price > 0 {
		view.ValuationNanoton = price
	} else {
		view.ValuationNanoton = item.FloorPriceNanoton
	}
	return view
}

func (s *Service) Deposit(ctx context.Context, userID uuid.UUID, txRef string) (*ItemView, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	item, err := s.deposit.ProcessDeposit(ctx, user, txRef)
	if err != nil {
		return nil, err
	}
	if item != nil && s.depositNotifier != nil {
		_ = s.depositNotifier.GiftDeposited(ctx, user, item)
	} else if item != nil && s.admin != nil {
		view := s.toItemView(ctx, *item)
		floor := view.ValuationNanoton
		if floor <= 0 {
			floor = item.FloorPriceNanoton
		}
		s.admin.NotifyGiftInventory(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, item.Name, floor)
	}
	view := s.toItemView(ctx, *item)
	return &view, nil
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
	if isProfileVirtualItem(*item) {
		return 0, domain.ErrInvalidAmount
	}

	payout := item.FloorPriceNanoton
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryBuyback(ctx, *item); price > 0 {
			payout = price
		}
	}
	if payout <= 0 {
		return 0, domain.ErrInvalidAmount
	}

	if s.market == nil {
		return 0, domain.ErrInvalidAmount
	}

	return s.market.BuybackFromUser(ctx, userID, itemID, payout, payout)
}

func (s *Service) Withdraw(ctx context.Context, userID, itemID uuid.UUID) (pending bool, err error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return false, err
	}
	if item.UserID != userID {
		return false, domain.ErrInvalidAmount
	}
	if item.Status != domain.InvAvailable {
		return false, domain.ErrInvalidAmount
	}
	if isProfileVirtualItem(*item) {
		return false, domain.ErrInvalidAmount
	}
	if item.Source != domain.NFTSourceTelegramGift || item.TelegramGiftID == "" {
		return false, domain.ErrInvalidAmount
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return false, err
	}

	if s.withdrawHold != nil {
		held, _, holdErr := s.withdrawHold.IsUserWithdrawHeld(ctx, userID)
		if holdErr != nil {
			return false, holdErr
		}
		if held {
			if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvWithdrawPending); err != nil {
				return false, err
			}
			return true, nil
		}
	}

	if s.giftTransfer == nil {
		return false, fmt.Errorf("вывод подарков временно недоступен")
	}

	recipient := telegram.ScanTargetByID(user.TelegramID)
	if user.Username != "" {
		recipient = telegram.ScanTargetByUsername(user.Username)
	}

	if err := s.giftTransfer.SendGift(ctx, item.TelegramGiftID, recipient); err != nil {
		if errors.Is(err, telegram.ErrMTProtoNotConfigured) {
			return false, fmt.Errorf("вывод подарков временно недоступен")
		}
		if errors.Is(err, telegram.ErrGiftNotOnAccount) {
			return false, fmt.Errorf("подарок недоступен для вывода")
		}
		if errors.Is(err, telegram.ErrInsufficientStars) {
			return false, fmt.Errorf("недостаточно Stars на аккаунте депозита")
		}
		return false, err
	}

	return false, s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvWithdrawn)
}

func (s *Service) ListPendingWithdrawals(ctx context.Context, limit int) ([]domain.AdminPendingGiftWithdraw, error) {
	items, err := s.inventory.ListByStatus(ctx, domain.InvWithdrawPending, limit)
	if err != nil {
		return nil, err
	}
	out := make([]domain.AdminPendingGiftWithdraw, 0, len(items))
	for _, item := range items {
		row := domain.AdminPendingGiftWithdraw{
			ItemID:         item.ID,
			UserID:         item.UserID,
			Name:           item.Name,
			ImageURL:       item.ImageURL,
			TelegramGiftID: item.TelegramGiftID,
			FloorNanoton:   item.FloorPriceNanoton,
			UpdatedAt:      item.UpdatedAt,
		}
		if user, err := s.users.FindByID(ctx, item.UserID); err == nil && user != nil {
			row.TelegramID = user.TelegramID
			row.Username = user.Username
			row.FirstName = user.FirstName
		}
		out = append(out, row)
	}
	return out, nil
}

func (s *Service) ReviewPendingWithdrawal(ctx context.Context, itemID uuid.UUID, approve bool) error {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return err
	}
	if item.Status != domain.InvWithdrawPending {
		return fmt.Errorf("подарок не в очереди вывода")
	}
	if !approve {
		return s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvAvailable)
	}

	user, err := s.users.FindByID(ctx, item.UserID)
	if err != nil {
		return err
	}
	if s.giftTransfer == nil {
		return fmt.Errorf("вывод подарков временно недоступен")
	}
	recipient := telegram.ScanTargetByID(user.TelegramID)
	if user.Username != "" {
		recipient = telegram.ScanTargetByUsername(user.Username)
	}
	if err := s.giftTransfer.SendGift(ctx, item.TelegramGiftID, recipient); err != nil {
		if errors.Is(err, telegram.ErrMTProtoNotConfigured) {
			return fmt.Errorf("вывод подарков временно недоступен")
		}
		if errors.Is(err, telegram.ErrGiftNotOnAccount) {
			return fmt.Errorf("подарок недоступен для вывода")
		}
		if errors.Is(err, telegram.ErrInsufficientStars) {
			return fmt.Errorf("недостаточно Stars на аккаунте депозита")
		}
		return err
	}
	return s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvWithdrawn)
}

func (s *Service) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	return s.inventory.SetFloorPrice(ctx, slug, price)
}

func isProfileVirtualItem(item domain.InventoryItem) bool {
	return domain.IsProfileVirtualItem(item)
}
