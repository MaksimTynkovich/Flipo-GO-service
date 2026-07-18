package telegram

import (
	"strings"
	"testing"
)

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

func TestOpenAppButtonMarkupPrefersFullscreenDeepLink(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:       "https://example.com",
		BotUsername:     "flipo_bot",
		WebAppShortName: "app",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	got, _ := btn["url"].(string)
	if got != "tg://resolve?appname=app&domain=flipo_bot&mode=fullscreen" {
		t.Fatalf("expected fullscreen deep link over web_app, got %#v", btn)
	}
	if _, ok := btn["web_app"]; ok {
		t.Fatal("expected url button, not web_app")
	}
}

func TestOpenAppButtonMarkupMiniAppFallback(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		BotUsername:     "flipo_bot",
		WebAppShortName: "app",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	got, _ := btn["url"].(string)
	if got != "tg://resolve?appname=app&domain=flipo_bot&mode=fullscreen" {
		t.Fatalf("unexpected url: %v", got)
	}
	if _, ok := btn["web_app"]; ok {
		t.Fatal("expected url button, not web_app")
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
		WebAppURL: "https://t.me/flipo_bot/app?startapp=wheel",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	got, _ := btn["url"].(string)
	if !strings.HasPrefix(got, "tg://resolve?") {
		t.Fatalf("expected tg://resolve url, got %v", got)
	}
	if !strings.Contains(got, "domain=flipo_bot") || !strings.Contains(got, "appname=app") {
		t.Fatalf("unexpected resolve params: %v", got)
	}
	if !strings.Contains(got, "startapp=wheel") {
		t.Fatalf("expected startapp=wheel, got %v", got)
	}
	if !strings.Contains(got, "mode=fullscreen") {
		t.Fatalf("expected mode=fullscreen, got %v", got)
	}
	if _, ok := btn["web_app"]; ok {
		t.Fatal("expected url button, not web_app")
	}
}

func TestOpenAppButtonMarkupDeepLinkWinsWithPayload(t *testing.T) {
	markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:       "https://flipo.example",
		BotUsername:     "flipo_bot",
		WebAppShortName: "app",
		StartPayload:    "wheel",
		ButtonText:      "Играть",
	})
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]
	got, _ := btn["url"].(string)
	if got != "tg://resolve?appname=app&domain=flipo_bot&mode=fullscreen&startapp=wheel" {
		t.Fatalf("unexpected url: %v", got)
	}
	if _, ok := btn["web_app"]; ok {
		t.Fatal("expected url button, not web_app")
	}
}
