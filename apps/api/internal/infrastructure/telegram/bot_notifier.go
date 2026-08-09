package telegram

import (
	"context"
	"fmt"
	"strings"
)

type BotNotifier struct {
	api     *BotAPI
	openApp OpenAppButtonOptions
}

func NewBotNotifier(token string) *BotNotifier {
	return &BotNotifier{api: NewBotAPI(token)}
}

func (n *BotNotifier) SetOpenApp(opts OpenAppButtonOptions) {
	if n == nil {
		return
	}
	n.openApp = opts
}

func (n *BotNotifier) Enabled() bool {
	return n != nil && n.api != nil && n.api.Enabled()
}

func (n *BotNotifier) SendGiftDeposited(ctx context.Context, telegramUserID int64, giftName string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	text := fmt.Sprintf("🎁 Подарок «%s» зачислен в инвентарь!", giftName)
	return ignoreUnavailable(n.api.sendMessage(ctx, telegramUserID, text, nil, ""))
}

func (n *BotNotifier) SendDailyStakingSettled(ctx context.Context, telegramUserID int64, yieldNanoton, referralBonusNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	var parts []string
	parts = append(parts, "✅ Дневной стейкинг завершён!")
	if yieldNanoton > 0 {
		parts = append(parts, fmt.Sprintf("За сутки: %s TON — зачислено на баланс.", formatTON(yieldNanoton)))
	}
	if referralBonusNanoton > 0 {
		parts = append(parts, fmt.Sprintf("Рефералы: %s TON — зачислено на баланс.", formatTON(referralBonusNanoton)))
	}
	parts = append(parts, "Подарки разблокированы — можно застейкать снова.")
	return ignoreUnavailable(n.api.sendMessage(ctx, telegramUserID, strings.Join(parts, "\n\n"), nil, ""))
}

func (n *BotNotifier) SendCaseDailyReady(ctx context.Context, telegramUserID int64, caseTitle, caseSlug string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}
	title := strings.TrimSpace(caseTitle)
	if title == "" {
		title = "Дневной кейс"
	}
	text := fmt.Sprintf("🎁 %s снова доступен!\n\nЗаберите бесплатный приз — открытие снова готово.", title)
	opts := n.openApp
	opts.ButtonText = "🎁 Открыть кейс"
	slug := strings.TrimSpace(caseSlug)
	if slug != "" {
		opts.StartPayload = "case_" + slug
	} else if strings.TrimSpace(opts.StartPayload) == "" {
		opts.StartPayload = "cases"
	}
	if webURL := strings.TrimRight(strings.TrimSpace(opts.WebAppURL), "/"); webURL != "" && !isTelegramDeepLink(webURL) {
		if slug != "" {
			opts.WebAppURL = webURL + "/cases/" + slug
		} else {
			opts.WebAppURL = webURL + "/cases"
		}
	}
	markup := OpenAppButtonMarkup(opts)
	return ignoreUnavailable(n.api.sendMessage(ctx, telegramUserID, text, markup, ""))
}

func ignoreUnavailable(err error) error {
	if IsRecipientUnavailable(err) {
		return nil
	}
	return err
}

func formatTON(nanoton int64) string {
	if nanoton <= 0 {
		return "0"
	}
	ton := float64(nanoton) / 1_000_000_000
	prec := 2
	if ton < 0.01 {
		prec = 6
	} else if ton < 1 {
		prec = 4
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.*f", prec, ton), "0"), ".")
}
