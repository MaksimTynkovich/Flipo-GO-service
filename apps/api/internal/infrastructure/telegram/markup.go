package telegram

import (
	"net/url"
	"strings"
)

const defaultWebAppButtonText = "🚀 Открыть приложение"

type OpenAppButtonOptions struct {
	WebAppURL       string
	BotUsername     string
	WebAppShortName string
	StartPayload    string
	ButtonText      string
}

func OpenAppButtonMarkup(opts OpenAppButtonOptions) map[string]any {
	buttonText := strings.TrimSpace(opts.ButtonText)
	if buttonText == "" {
		buttonText = defaultWebAppButtonText
	}

	button := map[string]any{"text": buttonText}

	if appURL := resolveOpenAppURL(opts); appURL != "" {
		if isTelegramDeepLink(appURL) {
			// url + https://t.me/bot/app opens the Mini App twice on some clients
			// (direct-link handler + url navigation). telegram.me avoids that.
			button["url"] = toTelegramMeDeepLink(appURL)
		} else {
			button["web_app"] = map[string]string{"url": appURL}
		}
	} else {
		return nil
	}

	return map[string]any{
		"inline_keyboard": [][]map[string]any{{button}},
	}
}

func WebAppButtonMarkup(webAppURL, buttonText string) map[string]any {
	return OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:  webAppURL,
		ButtonText: buttonText,
	})
}

func resolveOpenAppURL(opts OpenAppButtonOptions) string {
	if customURL := strings.TrimRight(strings.TrimSpace(opts.WebAppURL), "/"); customURL != "" {
		// Deep links cannot be used as web_app.url — fall through to bot short-name link
		// when we need startapp, or keep as url-button deep link below.
		if !isTelegramDeepLink(customURL) {
			if payload := strings.TrimSpace(opts.StartPayload); payload != "" {
				sep := "?"
				if strings.Contains(customURL, "?") {
					sep = "&"
				}
				return customURL + sep + "tgWebAppStartParam=" + url.QueryEscape(payload)
			}
			return customURL
		}
		// If admin pasted a t.me Mini App link as WebAppURL, still honour start payload
		// via the bot short-name deep link when possible.
		if payload := strings.TrimSpace(opts.StartPayload); payload != "" {
			if deep := miniAppDeepLink(opts.BotUsername, opts.WebAppShortName, payload); deep != "" {
				return deep
			}
			return appendStartApp(customURL, payload)
		}
		return customURL
	}

	return miniAppDeepLink(opts.BotUsername, opts.WebAppShortName, opts.StartPayload)
}

func miniAppDeepLink(botUsername, shortName, startPayload string) string {
	botUsername = strings.TrimPrefix(strings.TrimSpace(botUsername), "@")
	shortName = strings.Trim(strings.TrimSpace(shortName), "/")
	if botUsername == "" || shortName == "" {
		return ""
	}
	appURL := "https://telegram.me/" + botUsername + "/" + shortName
	return appendStartApp(appURL, startPayload)
}

func appendStartApp(appURL, startPayload string) string {
	payload := strings.TrimSpace(startPayload)
	if payload == "" {
		return appURL
	}
	if strings.Contains(appURL, "startapp=") {
		return appURL
	}
	sep := "?"
	if strings.Contains(appURL, "?") {
		sep = "&"
	}
	return appURL + sep + "startapp=" + url.QueryEscape(payload)
}

func isTelegramDeepLink(appURL string) bool {
	return strings.HasPrefix(appURL, "https://t.me/") ||
		strings.HasPrefix(appURL, "http://t.me/") ||
		strings.HasPrefix(appURL, "https://telegram.me/") ||
		strings.HasPrefix(appURL, "http://telegram.me/")
}

func toTelegramMeDeepLink(appURL string) string {
	switch {
	case strings.HasPrefix(appURL, "https://t.me/"):
		return "https://telegram.me/" + strings.TrimPrefix(appURL, "https://t.me/")
	case strings.HasPrefix(appURL, "http://t.me/"):
		return "https://telegram.me/" + strings.TrimPrefix(appURL, "http://t.me/")
	case strings.HasPrefix(appURL, "http://telegram.me/"):
		return "https://telegram.me/" + strings.TrimPrefix(appURL, "http://telegram.me/")
	default:
		return appURL
	}
}
