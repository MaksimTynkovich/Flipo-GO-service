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
			// Never put https://t.me/bot/app into url buttons: on Android/iOS Telegram
			// often opens the Mini App twice (direct-link handler + url navigation).
			// tg://resolve opens a single instance.
			button["url"] = toTgResolveDeepLink(appURL, opts.StartPayload)
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
		// Admin pasted a t.me / telegram.me Mini App link — prefer bot short-name resolve.
		if deep := miniAppDeepLink(opts.BotUsername, opts.WebAppShortName, opts.StartPayload); deep != "" {
			return deep
		}
		return toTgResolveDeepLink(customURL, opts.StartPayload)
	}

	return miniAppDeepLink(opts.BotUsername, opts.WebAppShortName, opts.StartPayload)
}

func miniAppDeepLink(botUsername, shortName, startPayload string) string {
	botUsername = strings.TrimPrefix(strings.TrimSpace(botUsername), "@")
	shortName = strings.Trim(strings.TrimSpace(shortName), "/")
	if botUsername == "" || shortName == "" {
		return ""
	}
	return buildTgResolve(botUsername, shortName, startPayload)
}

func buildTgResolve(botUsername, shortName, startPayload string) string {
	q := url.Values{}
	q.Set("domain", botUsername)
	q.Set("appname", shortName)
	// Open already in fullscreen so clients don't expand → relaunch.
	q.Set("mode", "fullscreen")
	if payload := strings.TrimSpace(startPayload); payload != "" {
		q.Set("startapp", payload)
	}
	return "tg://resolve?" + q.Encode()
}

// toTgResolveDeepLink converts https://t.me/bot/app(?startapp=) into tg://resolve?…
// so inline url buttons do not double-open the Mini App on mobile.
func toTgResolveDeepLink(appURL, startPayload string) string {
	trimmed := strings.TrimSpace(appURL)
	if strings.HasPrefix(trimmed, "tg://resolve?") {
		return trimmed
	}

	normalized := toTmeDeepLink(trimmed)
	if !strings.HasPrefix(normalized, "https://t.me/") {
		return normalized
	}

	rest := strings.TrimPrefix(normalized, "https://t.me/")
	pathPart, queryPart, hasQuery := strings.Cut(rest, "?")
	pathPart = strings.Trim(pathPart, "/")
	segs := strings.Split(pathPart, "/")
	if len(segs) < 2 || segs[0] == "" || segs[1] == "" {
		return normalized
	}

	payload := strings.TrimSpace(startPayload)
	if hasQuery {
		if v, err := url.ParseQuery(queryPart); err == nil {
			if start := strings.TrimSpace(v.Get("startapp")); start != "" && payload == "" {
				payload = start
			}
		}
	}
	return buildTgResolve(segs[0], segs[1], payload)
}

func isTelegramDeepLink(appURL string) bool {
	return strings.HasPrefix(appURL, "tg://resolve?") ||
		strings.HasPrefix(appURL, "https://t.me/") ||
		strings.HasPrefix(appURL, "http://t.me/") ||
		strings.HasPrefix(appURL, "https://telegram.me/") ||
		strings.HasPrefix(appURL, "http://telegram.me/")
}

// toTmeDeepLink normalizes telegram.me → t.me for parsing (not for url buttons).
func toTmeDeepLink(appURL string) string {
	switch {
	case strings.HasPrefix(appURL, "https://telegram.me/"):
		return "https://t.me/" + strings.TrimPrefix(appURL, "https://telegram.me/")
	case strings.HasPrefix(appURL, "http://telegram.me/"):
		return "https://t.me/" + strings.TrimPrefix(appURL, "http://telegram.me/")
	case strings.HasPrefix(appURL, "http://t.me/"):
		return "https://t.me/" + strings.TrimPrefix(appURL, "http://t.me/")
	default:
		return appURL
	}
}
