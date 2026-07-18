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
	if got := btn["url"]; got != "https://telegram.me/flipo_bot/app?startapp=ref_abc" {
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
