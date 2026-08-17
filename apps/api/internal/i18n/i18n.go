package i18n

import (
	"fmt"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

var messages = map[string]map[string]string{
	domain.LocaleEN: {
		"bot.welcome": "👋 Welcome to Flipo!\n\n" +
			"🎮 Games: roulette, crash\n" +
			"🎁 Telegram Gifts staking\n" +
			"💰 TON deposits and withdrawals\n\n" +
			"Tap the button below to open the app.",
		"bot.termsNotice":           "By entering the project you agree to the terms of service.",
		"bot.openApp":               "🚀 Open app",
		"bot.channel":               "📢 Our channel",
		"bot.support":               "💬 Support",
		"bot.cooperation":           "🤝 Partnership",
		"bot.terms":                 "📄 Terms of service",
		"bot.paymentsUnavailable":   "Payments are temporarily unavailable",
		"bot.giftDeposited":         "🎁 Gift “%s” has been added to your inventory!",
		"bot.stakingSettledTitle":   "✅ Daily staking is complete!",
		"bot.stakingYield":          "For the day: %s TON — credited to your balance.",
		"bot.stakingReferral":       "Referrals: %s TON — credited to your balance.",
		"bot.stakingUnlocked":       "Gifts are unlocked — you can stake again.",
		"bot.caseDailyTitle":        "Daily case",
		"bot.caseDailyReady":        "🎁 %s is available again!\n\nClaim your free prize — opening is ready.",
		"bot.openCase":              "🎁 Open case",
		"referral.shareDescription": "Join Flipo with my link — get a free case and grab gifts!",
		"referral.shareLine1":       "🎁 Join me on Flipo!",
		"referral.shareLine2":       "Open a free case and grab gifts.",
		"referral.shareButton":      "🎁 Open a free case",
	},
	domain.LocaleRU: {
		"bot.welcome": "👋 Добро пожаловать в Flipo!\n\n" +
			"🎮 Игры: рулетка, crash\n" +
			"🎁 Стейкинг Telegram Gifts\n" +
			"💰 TON депозиты и вывод\n\n" +
			"Нажмите кнопку ниже, чтобы открыть приложение.",
		"bot.termsNotice":           "Заходя в проект, вы соглашаетесь с пользовательским соглашением.",
		"bot.openApp":               "🚀 Открыть приложение",
		"bot.channel":               "📢 Наш канал",
		"bot.support":               "💬 Поддержка",
		"bot.cooperation":           "🤝 Сотрудничество",
		"bot.terms":                 "📄 Пользовательское соглашение",
		"bot.paymentsUnavailable":   "Платежи временно недоступны",
		"bot.giftDeposited":         "🎁 Подарок «%s» зачислен в инвентарь!",
		"bot.stakingSettledTitle":   "✅ Дневной стейкинг завершён!",
		"bot.stakingYield":          "За сутки: %s TON — зачислено на баланс.",
		"bot.stakingReferral":       "Рефералы: %s TON — зачислено на баланс.",
		"bot.stakingUnlocked":       "Подарки разблокированы — можно застейкать снова.",
		"bot.caseDailyTitle":        "Дневной кейс",
		"bot.caseDailyReady":        "🎁 %s снова доступен!\n\nЗаберите бесплатный приз — открытие снова готово.",
		"bot.openCase":              "🎁 Открыть кейс",
		"referral.shareDescription": "Заходи в Flipo по моей ссылке — получи бесплатный кейс и забирай подарки!",
		"referral.shareLine1":       "🎁 Присоединяйся ко мне в Flipo!",
		"referral.shareLine2":       "Открой бесплатный кейс и забирай подарки.",
		"referral.shareButton":      "🎁 Открыть бесплатный кейс",
	},
}

func T(locale, key string, args ...any) string {
	locale = domain.NormalizeLocale(locale)
	text := lookup(locale, key)
	if len(args) == 0 {
		return text
	}
	return fmt.Sprintf(text, args...)
}

func lookup(locale, key string) string {
	if bag, ok := messages[locale]; ok {
		if text, ok := bag[key]; ok {
			return text
		}
	}
	if locale != domain.LocaleEN {
		if bag, ok := messages[domain.LocaleEN]; ok {
			if text, ok := bag[key]; ok {
				return text
			}
		}
	}
	return key
}

func AppendLangQuery(rawURL, locale string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	locale = domain.NormalizeLocale(locale)
	if strings.Contains(rawURL, "lang=") {
		return rawURL
	}
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + "lang=" + locale
}
