package inventory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type ItemView struct {
	domain.InventoryItem
	BuybackPriceNanoton int64  `json:"buyback_price_nanoton"`
	ValuationNanoton    int64  `json:"valuation_nanoton"`
	CaseCashoutNanoton  int64  `json:"case_cashout_nanoton,omitempty"`
	Model               string `json:"model,omitempty"`
	Symbol              string `json:"symbol,omitempty"`
	Backdrop            string `json:"backdrop,omitempty"`
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

var fetchGiftTraits = telegram.FetchNFTPageTraits

// WithdrawHoldChecker reports silent gift withdrawal holds (global, gifts_manual, or per-user).
type WithdrawHoldChecker interface {
	IsUserGiftWithdrawHeld(ctx context.Context, userID uuid.UUID) (held bool, reason string, err error)
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
	view.CaseCashoutNanoton = domain.CaseClaimCashoutNanoton(item.Metadata)

	if valuator == nil {
		view.BuybackPriceNanoton = item.FloorPriceNanoton
		view.ValuationNanoton = item.FloorPriceNanoton
		return view
	}
	// List path: cached/DB only — live Portals/MRKT would make inventory 3–4s with a handful of gifts.
	buyback, valuation := valuator.QuoteInventoryListPrices(ctx, item)
	if buyback > 0 {
		view.BuybackPriceNanoton = buyback
	} else {
		view.BuybackPriceNanoton = item.FloorPriceNanoton
	}
	if valuation > 0 {
		view.ValuationNanoton = valuation
	} else {
		view.ValuationNanoton = item.FloorPriceNanoton
	}
	return view
}

func (s *Service) Deposit(ctx context.Context, userID uuid.UUID, txRef string) (*ItemView, error) {
	if err := domain.EnsureGiftDepositEnabled(); err != nil {
		return nil, err
	}
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
	// Case prizes sell at the guaranteed case cashout (not market buyback), including unbacked.
	if domain.IsCaseClaimItem(*item) && domain.CaseClaimCashoutNanoton(item.Metadata) > 0 {
		return s.LiquidateCaseClaim(ctx, userID, itemID)
	}
	if domain.IsUnbackedCaseClaim(*item) {
		return 0, domain.ErrUnbackedBuyback
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

func (s *Service) LiquidateCaseClaim(ctx context.Context, userID, itemID uuid.UUID) (int64, error) {
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
	if !domain.IsCaseClaimItem(*item) {
		return 0, domain.ErrInvalidAmount
	}
	payout := domain.CaseClaimCashoutNanoton(item.Metadata)
	if payout <= 0 {
		return 0, domain.ErrInvalidAmount
	}
	if s.market == nil {
		return 0, domain.ErrInvalidAmount
	}
	return s.market.SettleCaseClaim(ctx, userID, itemID, payout)
}

func (s *Service) Withdraw(ctx context.Context, userID, itemID uuid.UUID) (pending bool, message string, err error) {
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return false, "", err
	}
	if item.UserID != userID {
		return false, "", domain.ErrInvalidAmount
	}
	if item.Status != domain.InvAvailable {
		return false, "", domain.ErrInvalidAmount
	}
	if isProfileVirtualItem(*item) {
		return false, "", domain.ErrInvalidAmount
	}
	if item.Source != domain.NFTSourceTelegramGift {
		return false, "", domain.ErrInvalidAmount
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return false, "", err
	}

	// Unbacked case claim — queue for manual purchase/fulfillment.
	if domain.IsUnbackedCaseClaim(*item) {
		if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvWithdrawPending); err != nil {
			return false, "", err
		}
		if s.admin != nil {
			s.admin.NotifyGiftWithdraw(ctx, telegram.AdminActor{
				TelegramID: user.TelegramID,
				Username:   user.Username,
				FirstName:  user.FirstName,
				LastName:   user.LastName,
			}, item.Name, item.CollectionSlug, "needs_purchase", item.FloorPriceNanoton)
		}
		return true, "Вывод в обработке", nil
	}

	if item.TelegramGiftID == "" {
		return false, "", domain.ErrInvalidAmount
	}

	if s.withdrawHold != nil {
		held, _, holdErr := s.withdrawHold.IsUserGiftWithdrawHeld(ctx, userID)
		if holdErr != nil {
			return false, "", holdErr
		}
		if held {
			if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvWithdrawPending); err != nil {
				return false, "", err
			}
			if s.admin != nil {
				s.admin.NotifyGiftWithdraw(ctx, telegram.AdminActor{
					TelegramID: user.TelegramID,
					Username:   user.Username,
					FirstName:  user.FirstName,
					LastName:   user.LastName,
				}, item.Name, item.CollectionSlug, "held", item.FloorPriceNanoton)
			}
			return true, "Вывод в обработке", nil
		}
	}

	if s.giftTransfer == nil {
		return false, "", fmt.Errorf("вывод подарков временно недоступен")
	}

	recipient := telegram.ScanTargetByID(user.TelegramID)
	if user.Username != "" {
		recipient = telegram.ScanTargetByUsername(user.Username)
	}

	// Claim item before irreversible Telegram send — blocks parallel withdraw races.
	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvAvailable, domain.InvWithdrawPending); err != nil {
		return false, "", err
	}

	if err := s.giftTransfer.SendGift(ctx, item.TelegramGiftID, recipient); err != nil {
		_ = s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvAvailable)
		if errors.Is(err, telegram.ErrMTProtoNotConfigured) {
			return false, "", fmt.Errorf("вывод подарков временно недоступен")
		}
		if errors.Is(err, telegram.ErrGiftNotOnAccount) {
			return false, "", fmt.Errorf("подарок недоступен для вывода")
		}
		if errors.Is(err, telegram.ErrInsufficientStars) {
			return false, "", fmt.Errorf("вывод подарков временно недоступен")
		}
		// Do not leak raw Telegram/MTProto errors to the client.
		return false, "", fmt.Errorf("вывод подарков временно недоступен")
	}

	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvWithdrawn); err != nil {
		return false, "", err
	}
	s.recordGiftWithdrawal(ctx, item, "user")
	if s.admin != nil {
		s.admin.NotifyGiftWithdraw(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, item.Name, item.CollectionSlug, "sent", item.FloorPriceNanoton)
	}
	return false, "", nil
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
			CollectionSlug: item.CollectionSlug,
			FloorNanoton:   item.FloorPriceNanoton,
			NeedsPurchase:  domain.IsUnbackedCaseClaim(item) || item.TelegramGiftID == "",
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

	if domain.IsUnbackedCaseClaim(*item) || item.TelegramGiftID == "" {
		return fmt.Errorf("сначала привяжите подарок: укажите telegram_gift_id через fulfill")
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
	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvWithdrawn); err != nil {
		return err
	}
	s.recordGiftWithdrawal(ctx, item, "admin_review")
	return nil
}

// FulfillPendingWithdrawal binds a real telegram gift slug to an unbacked claim and sends it.
func (s *Service) FulfillPendingWithdrawal(ctx context.Context, itemID uuid.UUID, telegramGiftID string) error {
	telegramGiftID = strings.TrimSpace(telegramGiftID)
	if telegramGiftID == "" {
		return domain.ErrInvalidAmount
	}
	item, err := s.inventory.FindByID(ctx, itemID)
	if err != nil {
		return err
	}
	if item.Status != domain.InvWithdrawPending {
		return fmt.Errorf("подарок не в очереди вывода")
	}
	claimedAttrs := gifts.ItemAttributes(item.Metadata)
	if claimedAttrs.Model != "" || claimedAttrs.Backdrop != "" {
		actualAttrs, fetchErr := fetchGiftTraits(ctx, telegramGiftID)
		if fetchErr != nil {
			return fmt.Errorf("не удалось проверить traits подарка: %w", fetchErr)
		}
		if claimedAttrs.Model != "" && !strings.EqualFold(claimedAttrs.Model, actualAttrs.Model) {
			return fmt.Errorf("slug не совпадает с обещанной моделью: нужен %s", claimedAttrs.Model)
		}
		if claimedAttrs.Backdrop != "" && !strings.EqualFold(claimedAttrs.Backdrop, actualAttrs.Backdrop) {
			return fmt.Errorf("slug не совпадает с обещанным узором: нужен %s", claimedAttrs.Backdrop)
		}
	}

	metaMap := map[string]any{}
	if len(item.Metadata) > 0 {
		_ = json.Unmarshal(item.Metadata, &metaMap)
	}
	metaMap[domain.CaseClaimMetaFulfillment] = domain.CaseFulfillmentBacked
	metaMap[domain.CaseClaimMetaCollection] = item.CollectionSlug
	meta, _ := json.Marshal(metaMap)
	if err := s.inventory.BindTelegramGift(ctx, itemID, telegramGiftID, item.ImageURL, meta, domain.CaseFulfillmentBacked, ""); err != nil {
		return err
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
	if err := s.giftTransfer.SendGift(ctx, telegramGiftID, recipient); err != nil {
		if errors.Is(err, telegram.ErrMTProtoNotConfigured) {
			return fmt.Errorf("вывод подарков временно недоступен")
		}
		if errors.Is(err, telegram.ErrGiftNotOnAccount) {
			return fmt.Errorf("подарок недоступен для вывода — проверьте slug на аккаунте бота")
		}
		if errors.Is(err, telegram.ErrInsufficientStars) {
			return fmt.Errorf("недостаточно Stars на аккаунте депозита")
		}
		return err
	}
	if err := s.inventory.UpdateStatus(ctx, itemID, domain.InvWithdrawPending, domain.InvWithdrawn); err != nil {
		return err
	}
	item.TelegramGiftID = telegramGiftID
	s.recordGiftWithdrawal(ctx, item, "admin_fulfill")
	return nil
}

func (s *Service) recordGiftWithdrawal(ctx context.Context, item *domain.InventoryItem, source string) {
	if item == nil {
		return
	}
	cost := item.FloorPriceNanoton
	if cashout := domain.CaseClaimCashoutNanoton(item.Metadata); cashout > 0 {
		cost = cashout
	}
	row := &domain.GiftWithdrawal{
		InventoryItemID: item.ID,
		UserID:          item.UserID,
		CostNanoton:     cost,
		FloorNanoton:    item.FloorPriceNanoton,
		CollectionSlug:  item.CollectionSlug,
		Name:            item.Name,
		Source:          source,
		WithdrawnAt:     time.Now().UTC(),
	}
	if err := s.inventory.CreateGiftWithdrawal(ctx, row); err != nil {
		slog.Warn("gift withdrawal analytics row failed",
			"item_id", item.ID,
			"user_id", item.UserID,
			"source", source,
			"error", err,
		)
	}
}

func (s *Service) SetFloorPrice(ctx context.Context, slug string, price int64) error {
	return s.inventory.SetFloorPrice(ctx, slug, price)
}

func isProfileVirtualItem(item domain.InventoryItem) bool {
	return domain.IsProfileVirtualItem(item)
}
