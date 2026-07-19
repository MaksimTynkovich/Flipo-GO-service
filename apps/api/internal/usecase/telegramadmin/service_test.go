package telegramadmin

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

func TestBroadcastMarkupIncludesChannelButton(t *testing.T) {
	svc := &Service{
		envWebAppURL:    "https://app.example.com",
		botUsername:     "flipo_bot",
		webAppShortName: "app",
		channelURL:      "https://t.me/flipo_channel",
	}

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, true)
	if markup == nil {
		t.Fatal("expected markup")
	}
	rows, ok := markup["inline_keyboard"].([][]map[string]any)
	if !ok || len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %#v", markup["inline_keyboard"])
	}
	if rows[1][0]["text"] != channelButtonText {
		t.Fatalf("unexpected channel button text: %#v", rows[1][0]["text"])
	}
	if rows[1][0]["url"] != "https://t.me/flipo_channel" {
		t.Fatalf("unexpected channel url: %#v", rows[1][0]["url"])
	}
}

func TestBroadcastMarkupSkipsChannelWhenDisabled(t *testing.T) {
	svc := &Service{
		envWebAppURL: "https://app.example.com",
		channelURL:   "https://t.me/flipo_channel",
	}

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, false)
	rows := markup["inline_keyboard"].([][]map[string]any)
	if len(rows) != 1 {
		t.Fatalf("expected only open-app row, got %d", len(rows))
	}
}

func TestBroadcastMarkupChannelOnly(t *testing.T) {
	svc := &Service{channelURL: "https://t.me/flipo_channel"}

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, true)
	rows := markup["inline_keyboard"].([][]map[string]any)
	if len(rows) != 1 {
		t.Fatalf("expected channel-only row, got %d", len(rows))
	}
	if rows[0][0]["url"] != "https://t.me/flipo_channel" {
		t.Fatalf("unexpected url: %#v", rows[0][0]["url"])
	}
}
