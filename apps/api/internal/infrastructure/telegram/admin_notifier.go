package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/datatypes"
)

// AdminNotifier persists ops alerts into the in-app admin notifications feed.
// Events from admins themselves are ignored (except always-notify kinds).
type AdminNotifier struct {
	store    domain.AdminNotificationRepository
	adminIDs []int64
	adminSet map[int64]struct{}
	// Dedupes first-time bot /start alerts within a single process.
	botStartSeen sync.Map
}

func NewAdminNotifier(store domain.AdminNotificationRepository, adminIDs []int64) *AdminNotifier {
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
	return &AdminNotifier{store: store, adminIDs: ids, adminSet: set}
}

func (n *AdminNotifier) Enabled() bool {
	return n != nil && n.store != nil
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
	if actor.TelegramID == 0 || n.IsAdmin(actor.TelegramID) {
		return
	}
	if _, loaded := n.botStartSeen.LoadOrStore(actor.TelegramID, struct{}{}); loaded {
		return
	}
	n.persist(ctx, true, actor, "bot_start", "system", "info",
		"/start в боте",
		FormatActor(actor),
		FormatActor(actor),
		nil,
		nil,
	)
}

func (n *AdminNotifier) NotifyDeposit(ctx context.Context, actor AdminActor, amountNanoton int64) {
	amount := amountNanoton
	n.persist(ctx, true, actor, "deposit", "finance", "info",
		"Попытка депозита",
		fmt.Sprintf("%s · %s TON", FormatActor(actor), formatTON(amountNanoton)),
		fmt.Sprintf("%s\nСумма: %s TON", FormatActor(actor), formatTON(amountNanoton)),
		&amount,
		nil,
	)
}

func (n *AdminNotifier) NotifyDepositConfirmed(ctx context.Context, actor AdminActor, amountNanoton int64) {
	amount := amountNanoton
	n.persist(ctx, true, actor, "deposit_confirmed", "finance", "info",
		"Депозит подтверждён",
		fmt.Sprintf("%s · %s TON", FormatActor(actor), formatTON(amountNanoton)),
		fmt.Sprintf("%s\nСумма: %s TON", FormatActor(actor), formatTON(amountNanoton)),
		&amount,
		nil,
	)
}

func (n *AdminNotifier) NotifyWithdraw(ctx context.Context, actor AdminActor, amountNanoton int64) {
	n.NotifyWithdrawAttempt(ctx, actor, amountNanoton, false)
}

func (n *AdminNotifier) NotifyWithdrawAttempt(ctx context.Context, actor AdminActor, amountNanoton int64, pendingReview bool) {
	status := "в очереди"
	if pendingReview {
		status = "на проверке"
	}
	amount := amountNanoton
	n.persist(ctx, true, actor, "withdraw_attempt", "finance", "info",
		"Заявка на вывод",
		fmt.Sprintf("%s · %s TON · %s", FormatActor(actor), formatTON(amountNanoton), status),
		fmt.Sprintf("%s\nСумма: %s TON\nСтатус: %s", FormatActor(actor), formatTON(amountNanoton), status),
		&amount,
		map[string]any{"status": status, "pending_review": pendingReview},
	)
}

func (n *AdminNotifier) NotifyWithdrawConfirmed(ctx context.Context, actor AdminActor, amountNanoton int64) {
	amount := amountNanoton
	n.persist(ctx, true, actor, "withdraw_confirmed", "finance", "info",
		"Вывод подтверждён",
		fmt.Sprintf("%s · %s TON", FormatActor(actor), formatTON(amountNanoton)),
		fmt.Sprintf("%s\nСумма: %s TON", FormatActor(actor), formatTON(amountNanoton)),
		&amount,
		nil,
	)
}

func (n *AdminNotifier) NotifyWithdrawFailed(ctx context.Context, actor AdminActor, transferID string, amountNanoton int64, errMsg string) {
	msg := strings.TrimSpace(errMsg)
	if msg == "" {
		msg = "unknown error"
	}
	if len(msg) > 500 {
		msg = msg[:500] + "…"
	}
	amount := amountNanoton
	transferID = strings.TrimSpace(transferID)
	// Operational alert: always notify (including when the user is an admin).
	n.persist(ctx, false, actor, "withdraw_failed", "finance", "critical",
		"Ошибка вывода TON",
		fmt.Sprintf("%s · %s TON", FormatActor(actor), formatTON(amountNanoton)),
		fmt.Sprintf("%s\nTransfer: %s\nСумма: %s TON\nОшибка: %s\nБаланс пользователя возвращён.",
			FormatActor(actor), transferID, formatTON(amountNanoton), msg),
		&amount,
		map[string]any{"transfer_id": transferID, "error": msg},
	)
}

func (n *AdminNotifier) NotifyReferralShare(ctx context.Context, actor AdminActor, action string) {
	label := shareActionLabel(action)
	n.persist(ctx, true, actor, "referral_share", "referral", "info",
		"Реферальная ссылка",
		fmt.Sprintf("%s · %s", FormatActor(actor), label),
		fmt.Sprintf("%s\nДействие: %s", FormatActor(actor), label),
		nil,
		map[string]any{"action": action, "action_label": label},
	)
}

func (n *AdminNotifier) NotifyWheelShare(ctx context.Context, actor AdminActor, action string) {
	label := shareActionLabel(action)
	n.persist(ctx, false, actor, "wheel_share", "referral", "info",
		"Лаки страйк — реф.ссылка",
		fmt.Sprintf("%s · %s", FormatActor(actor), label),
		fmt.Sprintf("%s\nДействие: %s", FormatActor(actor), label),
		nil,
		map[string]any{"action": action, "action_label": label},
	)
}

func (n *AdminNotifier) NotifyWheelSpin(ctx context.Context, actor AdminActor, prizeNanoton int64, segmentLabel, spinSource string) {
	label := strings.TrimSpace(segmentLabel)
	if label == "" {
		label = "приз"
	}
	source := wheelSpinSourceLabel(spinSource)
	amount := prizeNanoton
	n.persist(ctx, true, actor, "wheel_spin", "games", "info",
		"Лаки страйк — вращение",
		fmt.Sprintf("%s · %s TON · %s", FormatActor(actor), formatTON(prizeNanoton), label),
		fmt.Sprintf("%s\nВыигрыш: %s TON\nСектор: %s\nСпин: %s",
			FormatActor(actor), formatTON(prizeNanoton), label, source),
		&amount,
		map[string]any{"segment": label, "spin_source": spinSource, "spin_source_label": source},
	)
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
	amount := principalNanoton
	n.persist(ctx, true, actor, "stake", "gifts", "info",
		"Стейкинг",
		fmt.Sprintf("%s · %s · %s TON", FormatActor(actor), name, formatTON(principalNanoton)),
		fmt.Sprintf("%s\nПредмет: %s\nОценка: %s TON", FormatActor(actor), name, formatTON(principalNanoton)),
		&amount,
		map[string]any{"gift_name": name, "event": "stake"},
	)
}

func (n *AdminNotifier) NotifyCaseOpen(
	ctx context.Context,
	actor AdminActor,
	caseTitle, prizeName, source string,
	priceNanoton, prizeFloorNanoton int64,
	backed bool,
) {
	caseTitle = strings.TrimSpace(caseTitle)
	if caseTitle == "" {
		caseTitle = "кейс"
	}
	prizeName = strings.TrimSpace(prizeName)
	if prizeName == "" {
		prizeName = "приз"
	}
	sourceLabel := caseSourceLabel(source)
	title := "Кейс открыт"
	summary := fmt.Sprintf("%s · %s · %s", FormatActor(actor), caseTitle, prizeName)
	body := fmt.Sprintf("%s\nКейс: %s\nПриз: %s\nИсточник: %s", FormatActor(actor), caseTitle, prizeName, sourceLabel)
	meta := map[string]any{
		"case_title": caseTitle,
		"prize_name": prizeName,
		"source":     source,
		"source_label": sourceLabel,
		"backed":     backed,
		"price_nanoton": priceNanoton,
	}
	var amount *int64
	if priceNanoton > 0 {
		v := priceNanoton
		amount = &v
		body += fmt.Sprintf("\nЦена: %s TON", formatTON(priceNanoton))
		summary = fmt.Sprintf("%s · %s · %s · %s TON", FormatActor(actor), caseTitle, prizeName, formatTON(priceNanoton))
	}
	if prizeFloorNanoton > 0 {
		body += fmt.Sprintf("\nОценка приза: %s TON", formatTON(prizeFloorNanoton))
		meta["prize_floor_nanoton"] = prizeFloorNanoton
		if amount == nil {
			v := prizeFloorNanoton
			amount = &v
		}
	}
	if backed {
		body += "\nПриз: обеспечен"
	} else {
		body += "\nПриз: необеспеченный (claim)"
	}
	n.persist(ctx, true, actor, "case_open", "cases", "info", title, summary, body, amount, meta)
}

func caseSourceLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "paid":
		return "платный"
	case "promo":
		return "промо"
	case "daily":
		return "ежедневный"
	case "free":
		return "бесплатный"
	default:
		if source == "" {
			return "—"
		}
		return source
	}
}

func (n *AdminNotifier) NotifyPromoActivated(ctx context.Context, actor AdminActor, code string, bonusNanoton int64) {
	amount := bonusNanoton
	code = strings.TrimSpace(code)
	n.persist(ctx, false, actor, "promo_activated", "promo", "info",
		"Промокод активирован",
		fmt.Sprintf("%s · %s · %s TON", FormatActor(actor), code, formatTON(bonusNanoton)),
		fmt.Sprintf("%s\nКод: %s\nБонус: %s TON", FormatActor(actor), code, formatTON(bonusNanoton)),
		&amount,
		map[string]any{"code": code},
	)
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
	n.persist(ctx, false, actor, "promo_failed", "promo", "warning",
		"Попытка активации промокода",
		fmt.Sprintf("%s · %s · %s", FormatActor(actor), code, reason),
		fmt.Sprintf("%s\nКод: %s\nПричина отказа: %s", FormatActor(actor), code, reason),
		nil,
		map[string]any{"code": code, "reason": reason},
	)
}

func (n *AdminNotifier) NotifyReferralJoined(ctx context.Context, actor, referrer AdminActor) {
	n.persist(ctx, true, actor, "referral_joined", "referral", "info",
		"Пришёл по реф.ссылке",
		fmt.Sprintf("%s · от %s", FormatActor(actor), FormatActor(referrer)),
		fmt.Sprintf("%s\nОт: %s", FormatActor(actor), FormatActor(referrer)),
		nil,
		map[string]any{
			"referrer_telegram_id": referrer.TelegramID,
			"referrer_username":    referrer.Username,
			"referrer_first_name":  referrer.FirstName,
			"referrer_last_name":   referrer.LastName,
		},
	)
}

func (n *AdminNotifier) NotifyGiftInventory(ctx context.Context, actor AdminActor, giftName string, floorNanoton int64) {
	name := strings.TrimSpace(giftName)
	if name == "" {
		name = "подарок"
	}
	summary := fmt.Sprintf("%s · %s", FormatActor(actor), name)
	body := fmt.Sprintf("%s\nПодарок: %s", FormatActor(actor), name)
	var amount *int64
	meta := map[string]any{"gift_name": name}
	if floorNanoton > 0 {
		v := floorNanoton
		amount = &v
		summary = fmt.Sprintf("%s · %s · %s TON", FormatActor(actor), name, formatTON(floorNanoton))
		body += fmt.Sprintf("\nОценка: %s TON", formatTON(floorNanoton))
		meta["floor_nanoton"] = floorNanoton
	}
	// Always alert for gift deposits — including when the depositor is an admin.
	n.persist(ctx, false, actor, "gift_deposit", "gifts", "info",
		"Пополнение подарком", summary, body, amount, meta,
	)
}

// NotifyGameResult — win / lose / cashout after a bet is settled.
// multiplier is cashout× (crash); crashPoint is the round crash× on a loss.
func (n *AdminNotifier) NotifyGameResult(
	ctx context.Context,
	actor AdminActor,
	game, outcome, selection string,
	stakeNanoton, payoutNanoton int64,
	multiplier, crashPoint *float64,
	resultLabel string,
) {
	game = strings.TrimSpace(game)
	if game == "" {
		game = "game"
	}
	outcome = strings.ToLower(strings.TrimSpace(outcome))
	selection = strings.TrimSpace(selection)
	resultLabel = strings.TrimSpace(resultLabel)

	title := gameLabel(game) + " — " + gameOutcomeLabel(outcome)
	summaryParts := []string{FormatActor(actor), formatTON(stakeNanoton) + " TON"}
	if selection != "" {
		summaryParts = append(summaryParts, selection)
	}
	body := FormatActor(actor) +
		"\nИгра: " + gameLabel(game) +
		"\nИсход: " + gameOutcomeLabel(outcome) +
		"\nСтавка: " + formatTON(stakeNanoton) + " TON"

	meta := map[string]any{
		"game":           game,
		"event":          "result",
		"outcome":        outcome,
		"stake_nanoton":  stakeNanoton,
		"payout_nanoton": payoutNanoton,
	}
	if selection != "" {
		body += "\nВыбор: " + selection
		meta["selection"] = selection
	}
	if resultLabel != "" {
		body += "\nРезультат: " + resultLabel
		meta["result"] = resultLabel
		summaryParts = append(summaryParts, resultLabel)
	}
	if multiplier != nil && *multiplier > 0 {
		mult := formatMult(*multiplier)
		body += "\nКэшаут: ×" + mult
		meta["multiplier"] = *multiplier
		summaryParts = append(summaryParts, "×"+mult)
	}
	if crashPoint != nil && *crashPoint > 0 {
		cp := formatMult(*crashPoint)
		body += "\nКраш: ×" + cp
		meta["crash_point"] = *crashPoint
		summaryParts = append(summaryParts, "краш ×"+cp)
	}

	var amount *int64
	switch outcome {
	case "win", "cashout":
		profit := payoutNanoton
		// For balance bets payout is gross; show net when possible.
		if payoutNanoton >= stakeNanoton && stakeNanoton > 0 {
			profit = payoutNanoton - stakeNanoton
		}
		meta["profit_nanoton"] = profit
		body += "\nВыплата: " + formatTON(payoutNanoton) + " TON"
		if profit != payoutNanoton {
			body += "\nПрофит: +" + formatTON(profit) + " TON"
			summaryParts = append(summaryParts, "+"+formatTON(profit)+" TON")
		} else if profit > 0 {
			body += "\nПрофит: +" + formatTON(profit) + " TON"
			summaryParts = append(summaryParts, "+"+formatTON(profit)+" TON")
		}
		amount = &profit
	case "lose":
		loss := stakeNanoton
		meta["profit_nanoton"] = -loss
		body += "\nПроигрыш: −" + formatTON(loss) + " TON"
		summaryParts = append(summaryParts, "−"+formatTON(loss)+" TON")
		amount = &loss
	default:
		if payoutNanoton > 0 {
			amount = &payoutNanoton
		} else {
			amount = &stakeNanoton
		}
	}

	severity := "info"
	if outcome == "lose" {
		severity = "warning"
	}
	summary := strings.Join(summaryParts, " · ")
	n.persist(ctx, true, actor, "game_result", "game", severity, title, summary, body, amount, meta)
}

func gameLabel(game string) string {
	switch strings.ToLower(strings.TrimSpace(game)) {
	case "crash":
		return "Crash"
	case "roulette":
		return "Roulette"
	case "pvp":
		return "PvP"
	case "wheel":
		return "Лаки страйк"
	default:
		return game
	}
}

func gameOutcomeLabel(outcome string) string {
	switch outcome {
	case "win":
		return "выигрыш"
	case "lose":
		return "проигрыш"
	case "cashout":
		return "кэшаут"
	default:
		if outcome == "" {
			return "результат"
		}
		return outcome
	}
}

func formatMult(v float64) string {
	s := fmt.Sprintf("%.2f", v)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" {
		return "0"
	}
	return s
}

func (n *AdminNotifier) NotifyGiftWithdrawPending(ctx context.Context, actor AdminActor, giftName, collectionSlug string) {
	n.NotifyGiftWithdraw(ctx, actor, giftName, collectionSlug, "needs_purchase", 0)
}

// NotifyGiftWithdraw — gift withdrawal attempt / result.
// status: sent | held | needs_purchase
func (n *AdminNotifier) NotifyGiftWithdraw(ctx context.Context, actor AdminActor, giftName, collectionSlug, status string, floorNanoton int64) {
	name := strings.TrimSpace(giftName)
	if name == "" {
		name = "подарок"
	}
	coll := strings.TrimSpace(collectionSlug)
	status = strings.ToLower(strings.TrimSpace(status))
	statusLabel := giftWithdrawStatusLabel(status)
	severity := "info"
	title := "Вывод подарка"
	switch status {
	case "needs_purchase":
		title = "Нужна закупка подарка для вывода"
		severity = "warning"
	case "held":
		title = "Вывод подарка на проверке"
		severity = "warning"
	case "sent":
		title = "Подарок выведен"
	}

	summary := fmt.Sprintf("%s · %s · %s", FormatActor(actor), name, statusLabel)
	body := fmt.Sprintf("%s\nПодарок: %s\nСтатус: %s", FormatActor(actor), name, statusLabel)
	meta := map[string]any{
		"gift_name": name,
		"status":    status,
		"status_label": statusLabel,
		"link":      "/admin/finance",
		"event":     "gift_withdraw",
	}
	if coll != "" {
		body += fmt.Sprintf("\nКоллекция: %s", coll)
		meta["collection"] = coll
	}
	var amount *int64
	if floorNanoton > 0 {
		v := floorNanoton
		amount = &v
		body += fmt.Sprintf("\nОценка: %s TON", formatTON(floorNanoton))
		meta["floor_nanoton"] = floorNanoton
	}
	if status == "needs_purchase" || status == "held" {
		body += "\nАдминка → Операции → выводы подарков"
	}
	n.persist(ctx, false, actor, "gift_withdraw", "gifts", severity, title, summary, body, amount, meta)
}

func giftWithdrawStatusLabel(status string) string {
	switch status {
	case "sent":
		return "отправлен"
	case "held":
		return "на проверке"
	case "needs_purchase":
		return "нужна закупка"
	default:
		if status == "" {
			return "—"
		}
		return status
	}
}

func (n *AdminNotifier) persist(
	_ context.Context,
	skipAdmin bool,
	actor AdminActor,
	kind, category, severity, title, summary, body string,
	amount *int64,
	meta map[string]any,
) {
	if !n.Enabled() {
		return
	}
	if skipAdmin && actor.TelegramID != 0 && n.IsAdmin(actor.TelegramID) {
		return
	}

	var metaJSON datatypes.JSON
	if len(meta) > 0 {
		raw, err := json.Marshal(meta)
		if err != nil {
			slog.Warn("admin notification meta marshal failed", "kind", kind, "error", err)
			metaJSON = datatypes.JSON([]byte("{}"))
		} else {
			metaJSON = datatypes.JSON(raw)
		}
	} else {
		metaJSON = datatypes.JSON([]byte("{}"))
	}

	notif := &domain.AdminNotification{
		Kind:            kind,
		Category:        category,
		Severity:        severity,
		Title:           title,
		Summary:         summary,
		Body:            body,
		ActorTelegramID: actor.TelegramID,
		ActorUsername:   actor.Username,
		ActorFirstName:  actor.FirstName,
		ActorLastName:   actor.LastName,
		AmountNanoton:   amount,
		Meta:            metaJSON,
		CreatedAt:       time.Now().UTC(),
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := n.store.CreateAdminNotification(ctx, notif); err != nil {
			slog.Warn("admin notification persist failed", "kind", kind, "error", err)
		}
	}()
}
