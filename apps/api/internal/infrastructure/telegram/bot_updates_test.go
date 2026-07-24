package telegram

import (
	"context"
	"testing"
)

func TestOpenAppMarkupMiniAppLink(t *testing.T) {
	h := NewBotUpdates(NewBotAPI("token"), "", "flipo_bot", "app", "", "", "")
	markup := h.openAppMarkup(context.Background(), "ref_abc")
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]

	if btn["text"] != "🚀 Открыть приложение" {
		t.Fatalf("unexpected button text: %v", btn["text"])
	}
	if got := btn["url"]; got != "tg://resolve?appname=app&domain=flipo_bot&mode=fullscreen&startapp=ref_abc" {
		t.Fatalf("unexpected url: %v", got)
	}
}

func TestOpenAppMarkupWebAppURL(t *testing.T) {
	h := NewBotUpdates(NewBotAPI("token"), "https://example.com", "", "", "", "", "")
	markup := h.openAppMarkup(context.Background(), "")
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]

	webApp, ok := btn["web_app"].(map[string]string)
	if !ok {
		t.Fatalf("expected web_app button, got %#v", btn)
	}
	if webApp["url"] != "https://example.com" {
		t.Fatalf("unexpected web_app url: %s", webApp["url"])
	}
}

func TestOpenAppMarkupWebAppURLWithPayload(t *testing.T) {
	h := NewBotUpdates(NewBotAPI("token"), "https://example.com", "", "", "", "", "")
	markup := h.openAppMarkup(context.Background(), "ref_xyz")
	row := markup["inline_keyboard"].([][]map[string]any)[0]
	btn := row[0]

	webApp := btn["web_app"].(map[string]string)
	if webApp["url"] != "https://example.com?tgWebAppStartParam=ref_xyz" {
		t.Fatalf("unexpected web_app url: %s", webApp["url"])
	}
}

func TestStartMenuMarkupIncludesTermsButton(t *testing.T) {
	h := NewBotUpdates(NewBotAPI("token"), "https://example.com", "", "", "", "", "Привет")
	h.SetTermsURLResolver(func(ctx context.Context) (string, string) {
		return "https://example.com/terms", "Политика"
	})
	markup := h.startMenuMarkup(context.Background(), "")
	rows := markup["inline_keyboard"].([][]map[string]any)
	if len(rows) < 2 {
		t.Fatalf("expected terms row, got %d rows", len(rows))
	}
	btn := rows[1][0]
	if btn["text"] != "Политика" {
		t.Fatalf("unexpected terms button text: %v", btn["text"])
	}
	if btn["url"] != "https://example.com/terms" {
		t.Fatalf("unexpected terms url: %v", btn["url"])
	}
}
