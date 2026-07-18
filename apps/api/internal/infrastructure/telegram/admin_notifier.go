package telegram

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// AdminNotifier sends private Telegram alerts to configured admin chat IDs.
// Events from admins themselves are ignored.
type AdminNotifier struct {
	api      *BotAPI
	adminIDs []int64
	adminSet map[int64]struct{}
	// Dedupes first-time bot /start alerts within a single process.
	botStartSeen sync.Map
}

func NewAdminNotifier(api *BotAPI, adminIDs []int64) *AdminNotifier {
	set := make(map[int64]struct{}, len(adminIDs))
	ids := make([]int64, 0, len(adminIDs))
	for _, id := range adminIDs {
		if id == 0 {
			continue
		}
		if _, ok := set[id]; ok {
			continue
		}
		set[id] = struct{}{}
		ids = append(ids, id)
	}
	return &AdminNotifier{api: api, adminIDs: ids, adminSet: set}
}

func (n *AdminNotifier) Enabled() bool {
	return n != nil && n.api != nil && n.api.Enabled() && len(n.adminIDs) > 0
}

func (n *AdminNotifier) IsAdmin(telegramID int64) bool {
	if n == nil || telegramID == 0 {
		return false
	}
	_, ok := n.adminSet[telegramID]
	return ok
}

type AdminActor struct {
	TelegramID int64
	Username   string
	FirstName  string
	LastName   string
}

func FormatActor(a AdminActor) string {
	name := strings.TrimSpace(strings.TrimSpace(a.FirstName + " " + a.LastName))
	if name == "" {
		name = "без имени"
	}
	if a.Username != "" {
		return fmt.Sprintf("%s (@%s, id=%d)", name, a.Username, a.TelegramID)
	}
	return fmt.Sprintf("%s (id=%d)", name, a.TelegramID)
}

func (n *AdminNotifier) NotifyBotStart(ctx context.Context, actor AdminActor) {
	if !n.Enabled() || actor.TelegramID == 0 || n.IsAdmin(actor.TelegramID) {
		return
	}
	if _, loaded := n.botStartSeen.LoadOrStore(actor.TelegramID, struct{}{}); loaded {
		return
	}
	n.notify(ctx, actor, fmt.Sprintf(
		"🤖 /start в боте\n%s",
		FormatActor(actor),
	))
}

func (n *AdminNotifier) NotifyDeposit(ctx context.Context, actor AdminActor, amountNanoton int64) {
	n.notify(ctx, actor, fmt.Sprintf(
		"💰 Попытка депозита\n%s\nСумма: %s TON",
		FormatActor(actor),
		formatTON(amountNanoton),
	))
}

func (n *AdminNotifier) NotifyDepositConfirmed(ctx context.Context, actor AdminActor, amountNanoton int64) {
	n.notify(ctx, actor, fmt.Sprintf(
		"✅ Депозит подтверждён\n%s\nСумма: %s TON",
		FormatActor(actor),
		formatTON(amountNanoton),
	))
}

func (n *AdminNotifier) NotifyWithdraw(ctx context.Context, actor AdminActor, amountNanoton int64) {
	n.NotifyWithdrawAttempt(ctx, actor, amountNanoton, false)
}

func (n *AdminNotifier) NotifyWithdrawAttempt(ctx context.Context, actor AdminActor, amountNanoton int64, pendingReview bool) {
	status := "в очереди"
	if pendingReview {
		status = "на проверке"
	}
	n.notify(ctx, actor, fmt.Sprintf(
		"📤 Заявка на вывод\n%s\nСумма: %s TON\nСтатус: %s",
		FormatActor(actor),
		formatTON(amountNanoton),
		status,
	))
}

func (n *AdminNotifier) NotifyWithdrawConfirmed(ctx context.Context, actor AdminActor, amountNanoton int64) {
	n.notify(ctx, actor, fmt.Sprintf(
		"✅ Вывод подтверждён\n%s\nСумма: %s TON",
		FormatActor(actor),
		formatTON(amountNanoton),
	))
}

func (n *AdminNotifier) NotifyWithdrawFailed(ctx context.Context, actor AdminActor, transferID string, amountNanoton int64, errMsg string) {
	msg := strings.TrimSpace(errMsg)
	if msg == "" {
		msg = "unknown error"
	}
	if len(msg) > 500 {
		msg = msg[:500] + "…"
	}
	// Operational alert: always notify admins (including when the user is an admin).
	n.notifyAll(ctx, fmt.Sprintf(
		"⚠️ Ошибка вывода TON\n%s\nTransfer: %s\nСумма: %s TON\nОшибка: %s\nБаланс пользователя возвращён.",
		FormatActor(actor),
		strings.TrimSpace(transferID),
		formatTON(amountNanoton),
		msg,
	))
}

func (n *AdminNotifier) NotifyReferralShare(ctx context.Context, actor AdminActor, action string) {
	label := shareActionLabel(action)
	n.notify(ctx, actor, fmt.Sprintf("🔗 Реферальная ссылка\n%s\nДействие: %s", FormatActor(actor), label))
}

func (n *AdminNotifier) NotifyWheelShare(ctx context.Context, actor AdminActor, action string) {
	label := shareActionLabel(action)
	n.notifyAll(ctx, fmt.Sprintf(
		"🎡 Лаки страйк — поделился реф.ссылкой\n%s\nДействие: %s",
		FormatActor(actor),
		label,
	))
}

func (n *AdminNotifier) NotifyWheelSpin(ctx context.Context, actor AdminActor, prizeNanoton int64, segmentLabel, spinSource string) {
	label := strings.TrimSpace(segmentLabel)
	if label == "" {
		label = "приз"
	}
	source := wheelSpinSourceLabel(spinSource)
	n.notify(ctx, actor, fmt.Sprintf(
		"🎡 Лаки страйк — вращение\n%s\nВыигрыш: %s TON\nСектор: %s\nСпин: %s",
		FormatActor(actor),
		formatTON(prizeNanoton),
		label,
		source,
	))
}

func wheelSpinSourceLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "daily":
		return "ежедневный"
	case "bonus":
		return "бонусный"
	case "admin":
		return "админ"
	default:
		if source == "" {
			return "—"
		}
		return source
	}
}

func shareActionLabel(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "share", "send":
		return "отправил"
	case "copy":
		return "скопировал"
	default:
		return "скопировал"
	}
}

func (n *AdminNotifier) NotifyStake(ctx context.Context, actor AdminActor, giftName string, principalNanoton int64) {
	name := strings.TrimSpace(giftName)
	if name == "" {
		name = "подарок"
	}
	n.notify(ctx, actor, fmt.Sprintf(
		"🎁 Стейкинг\n%s\nПредмет: %s\nОценка: %s TON",
		FormatActor(actor),
		name,
		formatTON(principalNanoton),
	))
}

func (n *AdminNotifier) NotifyPromoActivated(ctx context.Context, actor AdminActor, code string, bonusNanoton int64) {
	// Always alert admins — including when the actor is an admin (testing / ops).
	n.notifyAll(ctx, fmt.Sprintf(
		"🏷 Промокод активирован\n%s\nКод: %s\nБонус: %s TON",
		FormatActor(actor),
		strings.TrimSpace(code),
		formatTON(bonusNanoton),
	))
}

func (n *AdminNotifier) NotifyPromoActivationFailed(ctx context.Context, actor AdminActor, code, reason string) {
	code = strings.TrimSpace(code)
	if code == "" {
		code = "—"
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "неизвестная ошибка"
	}
	if len(reason) > 400 {
		reason = reason[:400] + "…"
	}
	n.notifyAll(ctx, fmt.Sprintf(
		"🏷 Попытка активации промокода\n%s\nКод: %s\nПричина отказа: %s",
		FormatActor(actor),
		code,
		reason,
	))
}

func (n *AdminNotifier) NotifyReferralJoined(ctx context.Context, actor, referrer AdminActor) {
	n.notify(ctx, actor, fmt.Sprintf(
		"👥 Пришёл по реф.ссылке\n%s\nОт: %s",
		FormatActor(actor),
		FormatActor(referrer),
	))
}

func (n *AdminNotifier) NotifyGiftInventory(ctx context.Context, actor AdminActor, giftName string, floorNanoton int64) {
	name := strings.TrimSpace(giftName)
	if name == "" {
		name = "подарок"
	}
	text := fmt.Sprintf("📥 Пополнение подарком\n%s\nПодарок: %s", FormatActor(actor), name)
	if floorNanoton > 0 {
		text += fmt.Sprintf("\nОценка: %s TON", formatTON(floorNanoton))
	}
	// Always alert admins for gift deposits — including when the depositor is an admin.
	n.notifyAll(ctx, text)
}

func (n *AdminNotifier) notify(_ context.Context, actor AdminActor, text string) {
	if !n.Enabled() || actor.TelegramID == 0 || n.IsAdmin(actor.TelegramID) {
		return
	}
	n.notifyAll(context.Background(), text)
}

func (n *AdminNotifier) notifyAll(_ context.Context, text string) {
	if !n.Enabled() || strings.TrimSpace(text) == "" {
		return
	}

	for _, adminID := range n.adminIDs {
		adminID := adminID
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := n.api.SendMessage(ctx, adminID, text); err != nil {
				slog.Warn("admin notify failed", "admin_id", adminID, "error", err)
			}
		}()
	}
}
