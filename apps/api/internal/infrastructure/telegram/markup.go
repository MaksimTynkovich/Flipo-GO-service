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
			button["url"] = appURL
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
		if payload := strings.TrimSpace(opts.StartPayload); payload != "" && !isTelegramDeepLink(customURL) {
			sep := "?"
			if strings.Contains(customURL, "?") {
				sep = "&"
			}
			return customURL + sep + "tgWebAppStartParam=" + url.QueryEscape(payload)
		}
		return customURL
	}

	botUsername := strings.TrimPrefix(strings.TrimSpace(opts.BotUsername), "@")
	shortName := strings.Trim(strings.TrimSpace(opts.WebAppShortName), "/")
	if botUsername != "" && shortName != "" {
		appURL := "https://t.me/" + botUsername + "/" + shortName
		if payload := strings.TrimSpace(opts.StartPayload); payload != "" {
			appURL += "?startapp=" + url.QueryEscape(payload)
		}
		return appURL
	}

	return ""
}

func isTelegramDeepLink(appURL string) bool {
	return strings.HasPrefix(appURL, "https://t.me/") || strings.HasPrefix(appURL, "http://t.me/")
}
