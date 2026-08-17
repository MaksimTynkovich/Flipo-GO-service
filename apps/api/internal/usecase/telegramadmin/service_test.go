package telegramadmin

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

func TestBroadcastMarkupIncludesChannelButton(t *testing.T) {
	svc := &Service{
		envWebAppURL:    "https://app.example.com",
		botUsername:     "flipo_bot",
		webAppShortName: "app",
		channelURL:      "https://t.me/flipo_channel",
	}

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, true, domain.LocaleRU)
	if markup == nil {
		t.Fatal("expected markup")
	}
	rows, ok := markup["inline_keyboard"].([][]map[string]any)
	if !ok || len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %#v", markup["inline_keyboard"])
	}
	if rows[1][0]["text"] != "📢 Наш канал" {
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

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, false, domain.LocaleEN)
	rows := markup["inline_keyboard"].([][]map[string]any)
	if len(rows) != 1 {
		t.Fatalf("expected only open-app row, got %d", len(rows))
	}
}

func TestBroadcastMarkupChannelOnly(t *testing.T) {
	svc := &Service{channelURL: "https://t.me/flipo_channel"}

	markup := svc.broadcastMarkup(domain.TelegramBotSettings{}, true, domain.LocaleEN)
	rows := markup["inline_keyboard"].([][]map[string]any)
	if len(rows) != 1 {
		t.Fatalf("expected channel-only row, got %d", len(rows))
	}
	if rows[0][0]["url"] != "https://t.me/flipo_channel" {
		t.Fatalf("unexpected url: %#v", rows[0][0]["url"])
	}
}

func TestBroadcastSendDelaySlowsForAlbums(t *testing.T) {
	text := broadcastSendDelay(2, 0)
	photo := broadcastSendDelay(2, 1)
	album := broadcastSendDelay(2, 3)
	if !(text < photo && photo < album) {
		t.Fatalf("expected text < photo < album delays, got %v %v %v", text, photo, album)
	}
	if album < 200*time.Millisecond {
		t.Fatalf("album delay too aggressive for Telegram flood limits: %v", album)
	}
}
