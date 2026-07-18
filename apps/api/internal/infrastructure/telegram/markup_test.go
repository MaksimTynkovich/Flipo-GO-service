package telegram

import "testing"

func TestWebAppButtonMarkup(t *testing.T) {
	markup := WebAppButtonMarkup("https://example.com", "")
	if markup == nil {
		t.Fatal("expected markup")
	}
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	webApp := btn["web_app"].(map[string]string)
	if webApp["url"] != "https://example.com" {
		t.Fatalf("unexpected url: %s", webApp["url"])
	}
}

func TestWebAppButtonMarkupEmptyURL(t *testing.T) {
	if WebAppButtonMarkup("", "") != nil {
		t.Fatal("expected nil markup for empty url")
	}
}

func TestOpenAppButtonMarkupPrefersCustomURL(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:       "https://example.com",
		BotUsername:     "flipo_bot",
		WebAppShortName: "app",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	webApp := btn["web_app"].(map[string]string)
	if webApp["url"] != "https://example.com" {
		t.Fatalf("expected admin url to win, got %#v", btn)
	}
}

func TestOpenAppButtonMarkupMiniAppFallback(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		BotUsername:     "flipo_bot",
		WebAppShortName: "app",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	if got := btn["url"]; got != "https://t.me/flipo_bot/app" {
		t.Fatalf("unexpected url: %v", got)
	}
}

func TestOpenAppButtonMarkupCustomText(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:  "https://example.com",
		ButtonText: "Играть",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	if btn["text"] != "Играть" {
		t.Fatalf("unexpected text: %v", btn["text"])
	}
}

func TestOpenAppButtonMarkupTelegramDeepLink(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL: "https://t.me/flipo_bot/app",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	if got := btn["url"]; got != "https://t.me/flipo_bot/app" {
		t.Fatalf("unexpected url: %v", got)
	}
	if _, ok := btn["web_app"]; ok {
		t.Fatal("expected url button, not web_app")
	}
}
