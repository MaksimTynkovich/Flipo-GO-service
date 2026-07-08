package inventory

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type AutoDepositService struct {
	users     domain.UserRepository
	inventory domain.InventoryRepository
	valuator  *gifts.Valuator
	notifier  GiftDepositNotifier
}

type GiftDepositNotifier interface {
	GiftDeposited(ctx context.Context, user *domain.User, item *domain.InventoryItem) error
}

func NewAutoDepositService(
	users domain.UserRepository,
	inventory domain.InventoryRepository,
	valuator *gifts.Valuator,
	notifier GiftDepositNotifier,
) *AutoDepositService {
	return &AutoDepositService{
		users:     users,
		inventory: inventory,
		valuator:  valuator,
		notifier:  notifier,
	}
}

func (s *AutoDepositService) ProcessIncoming(ctx context.Context, incoming []telegram.IncomingGift) (int, error) {
	credited := 0
	for _, gift := range incoming {
		ok, err := s.creditOne(ctx, gift)
		if err != nil {
			return credited, err
		}
		if ok {
			credited++
		}
	}
	return credited, nil
}

func (s *AutoDepositService) creditOne(ctx context.Context, gift telegram.IncomingGift) (bool, error) {
	if gift.Slug == "" || gift.SenderTelegramID == 0 {
		return false, nil
	}

	if existing, err := s.inventory.FindActiveByGiftSlug(ctx, gift.Slug); err == nil {
		slog.Info("gift deposit skipped: gift already active in inventory",
			"slug", gift.Slug,
			"existing_item_id", existing.ID,
			"existing_user_id", existing.UserID,
			"existing_status", existing.Status,
		)
		return false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, err
	}

	user, err := s.users.FindByTelegramID(ctx, gift.SenderTelegramID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			slog.Warn("gift deposit skipped: sender not registered",
				"slug", gift.Slug,
				"sender_telegram_id", gift.SenderTelegramID,
			)
			return false, nil
		}
		return false, err
	}

	scanned := gift.ScannedGift
	if s.valuator != nil {
		enriched := s.valuator.Enrich(ctx, []telegram.ScannedGift{scanned})
		scanned = enriched[0]
	}
	if scanned.PriceNanoton <= 0 {
		slog.Warn("gift deposit skipped: unable to value gift",
			"slug", gift.Slug,
			"user_id", user.ID,
		)
		return false, nil
	}

	now := time.Now().UTC()
	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            user.ID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    gift.Slug,
		CollectionSlug:    gift.CollectionSlug,
		TokenID:           gift.TokenID,
		Name:              gift.Name,
		ImageURL:          gift.ImageURL,
		Metadata:          datatypes.JSON(gifts.ItemMetadata(gift.Attributes)),
		FloorPriceNanoton: scanned.PriceNanoton,
		Status:            domain.InvAvailable,
		DepositedAt:       now,
		TelegramTxRef:     depositTxRef(gift),
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if err := s.inventory.Create(ctx, item); err != nil {
		return false, err
	}

	slog.Info("gift deposited to inventory",
		"slug", gift.Slug,
		"user_id", user.ID,
		"telegram_id", user.TelegramID,
		"price_nanoton", scanned.PriceNanoton,
	)
	if s.notifier != nil {
		if err := s.notifier.GiftDeposited(ctx, user, item); err != nil {
			slog.Warn("gift deposit notify failed", "error", err, "item_id", item.ID)
		}
	}
	return true, nil
}

func depositTxRef(gift telegram.IncomingGift) string {
	if gift.MsgID > 0 {
		return fmt.Sprintf("deposit:msg:%d", gift.MsgID)
	}
	if gift.SavedID > 0 {
		return fmt.Sprintf("deposit:saved:%d", gift.SavedID)
	}
	return "deposit:" + gift.Slug
}
