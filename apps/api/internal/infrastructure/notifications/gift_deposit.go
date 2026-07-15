package notifications

import (
	"context"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	inventoryuc "github.com/flipo/flipo/apps/api/internal/usecase/inventory"
)

type GiftDepositNotifier struct {
	bot      *telegram.BotNotifier
	hub      *websocket.Hub
	valuator *gifts.Valuator
	admin    *telegram.AdminNotifier
}

func NewGiftDepositNotifier(bot *telegram.BotNotifier, hub *websocket.Hub, valuator *gifts.Valuator, admin *telegram.AdminNotifier) *GiftDepositNotifier {
	return &GiftDepositNotifier{bot: bot, hub: hub, valuator: valuator, admin: admin}
}

func (n *GiftDepositNotifier) GiftDeposited(ctx context.Context, user *domain.User, item *domain.InventoryItem) error {
	if item == nil || user == nil {
		return nil
	}

	itemView := inventoryuc.BuildItemView(ctx, n.valuator, *item)

	if n.bot != nil && n.bot.Enabled() {
		if err := n.bot.SendGiftDeposited(ctx, user.TelegramID, item.Name); err != nil {
			slog.Warn("telegram gift deposit notify failed", "error", err, "user_id", user.ID)
		}
	}

	if n.admin != nil && n.admin.Enabled() {
		floor := item.FloorPriceNanoton
		if itemView.ValuationNanoton > 0 {
			floor = itemView.ValuationNanoton
		}
		n.admin.NotifyGiftInventory(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, item.Name, floor)
	}

	if n.hub != nil {
		n.hub.NotifyUser(user.ID, "inventory.deposited", map[string]interface{}{
			"item":    itemView,
			"message": "🎁 Подарок «" + item.Name + "» зачислен в инвентарь!",
		})
	}

	return nil
}
