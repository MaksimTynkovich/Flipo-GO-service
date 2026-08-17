package telegram

import (
	"context"
	"fmt"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/i18n"
)

type BotNotifier struct {
	api            *BotAPI
	openApp        OpenAppButtonOptions
	localeResolver LocaleResolver
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

func (n *BotNotifier) SetLocaleResolver(resolver LocaleResolver) {
	if n == nil {
		return
	}
	n.localeResolver = resolver
}

func (n *BotNotifier) Enabled() bool {
	return n != nil && n.api != nil && n.api.Enabled()
}

func (n *BotNotifier) resolveLocale(ctx context.Context, telegramUserID int64) string {
	if n != nil && n.localeResolver != nil && telegramUserID != 0 {
		if loc := strings.TrimSpace(n.localeResolver(ctx, telegramUserID)); loc != "" {
			return domain.NormalizeLocale(loc)
		}
	}
	return domain.DefaultLocale
}

func (n *BotNotifier) SendGiftDeposited(ctx context.Context, telegramUserID int64, giftName string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	locale := n.resolveLocale(ctx, telegramUserID)
	text := i18n.T(locale, "bot.giftDeposited", giftName)
	return ignoreUnavailable(n.api.sendMessage(ctx, telegramUserID, text, nil, ""))
}

func (n *BotNotifier) SendDailyStakingSettled(ctx context.Context, telegramUserID int64, yieldNanoton, referralBonusNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	locale := n.resolveLocale(ctx, telegramUserID)
	var parts []string
	parts = append(parts, i18n.T(locale, "bot.stakingSettledTitle"))
	if yieldNanoton > 0 {
		parts = append(parts, i18n.T(locale, "bot.stakingYield", formatTON(yieldNanoton)))
	}
	if referralBonusNanoton > 0 {
		parts = append(parts, i18n.T(locale, "bot.stakingReferral", formatTON(referralBonusNanoton)))
	}
	parts = append(parts, i18n.T(locale, "bot.stakingUnlocked"))
	return ignoreUnavailable(n.api.sendMessage(ctx, telegramUserID, strings.Join(parts, "\n\n"), nil, ""))
}

func (n *BotNotifier) SendCaseDailyReady(ctx context.Context, telegramUserID int64, caseTitle, caseSlug string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}
	locale := n.resolveLocale(ctx, telegramUserID)
	title := strings.TrimSpace(caseTitle)
	if title == "" {
		title = i18n.T(locale, "bot.caseDailyTitle")
	}
	text := i18n.T(locale, "bot.caseDailyReady", title)
	opts := n.openApp
	opts.ButtonText = i18n.T(locale, "bot.openCase")
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
