package telegram

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type countingStore struct {
	mu    sync.Mutex
	count int
}

func (s *countingStore) CreateAdminNotification(ctx context.Context, n *domain.AdminNotification) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.count++
	return nil
}

func (s *countingStore) ListAdminNotifications(ctx context.Context, filter domain.AdminNotificationFilter) ([]domain.AdminNotification, error) {
	return nil, nil
}

func (s *countingStore) CountAdminNotifications(ctx context.Context, filter domain.AdminNotificationFilter) (int64, error) {
	return 0, nil
}

func (s *countingStore) CountUnreadAdminNotifications(ctx context.Context, category string) (int64, error) {
	return 0, nil
}

func (s *countingStore) MarkAdminNotificationRead(ctx context.Context, id uuid.UUID) error {
	return nil
}

func (s *countingStore) MarkAllAdminNotificationsRead(ctx context.Context, category string) (int64, error) {
	return 0, nil
}

func (s *countingStore) getCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.count
}

func waitPersist() {
	time.Sleep(50 * time.Millisecond)
}

func TestAdminNotifierSkipsAdmins(t *testing.T) {
	store := &countingStore{}
	n := NewAdminNotifier(store, nil, []int64{111, 222})
	if !n.IsAdmin(111) {
		t.Fatal("expected 111 to be admin")
	}
	if n.IsAdmin(333) {
		t.Fatal("expected 333 not to be admin")
	}

	n.NotifyBotStart(context.Background(), AdminActor{TelegramID: 111, Username: "admin"}, BotStartAttribution{})
	n.NotifyDeposit(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyDepositConfirmed(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyWithdrawAttempt(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000, true)
	n.NotifyWithdrawConfirmed(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyReferralShare(context.Background(), AdminActor{TelegramID: 111}, "copy")
	waitPersist()
	if store.getCount() != 0 {
		t.Fatalf("expected admin actor events to be skipped, got %d", store.getCount())
	}
}

func TestNotifyGiftInventoryAllowsAdminActor(t *testing.T) {
	store := &countingStore{}
	n := NewAdminNotifier(store, nil, []int64{111})
	n.NotifyGiftInventory(context.Background(), AdminActor{TelegramID: 111, Username: "admin"}, "Vice Cream", 1_000_000_000)
	waitPersist()
	if store.getCount() != 1 {
		t.Fatalf("expected gift deposit to notify for admin actor, got %d", store.getCount())
	}
}

func TestFormatActor(t *testing.T) {
	got := FormatActor(AdminActor{TelegramID: 42, Username: "bob", FirstName: "Bob", LastName: "Lee"})
	want := "Bob Lee (@bob, id=42)"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestAdminNotifierDisabledWithoutStore(t *testing.T) {
	n := NewAdminNotifier(nil, nil, []int64{111})
	if n.Enabled() {
		t.Fatal("expected disabled without store")
	}
}

func TestFormatBotStartNoticeCampaign(t *testing.T) {
	actor := AdminActor{TelegramID: 42, Username: "ann", FirstName: "Анна"}
	title, summary, body, meta := formatBotStartNotice(actor, BotStartAttribution{
		Payload: "c_tgads_a",
		Kind:    "campaign",
		Name:    "TG Ads — креатив A",
		Code:    "tgads_a",
		Source:  domain.CampaignSourceTelegramAds,
		Content: "A",
	})
	if title != "/start · Telegram Ads · A" {
		t.Fatalf("title = %q", title)
	}
	if !strings.Contains(summary, "Telegram Ads") || !strings.Contains(summary, "TG Ads") {
		t.Fatalf("summary = %q", summary)
	}
	if !strings.Contains(body, "Канал: Telegram Ads") || !strings.Contains(body, "Код: c_tgads_a") {
		t.Fatalf("body = %q", body)
	}
	if meta["campaign_source_label"] != "Telegram Ads" || meta["campaign_code"] != "tgads_a" {
		t.Fatalf("meta = %#v", meta)
	}
}

func TestFormatBotStartNoticeReferralAndEmpty(t *testing.T) {
	actor := AdminActor{TelegramID: 1, FirstName: "Bob"}
	title, summary, _, _ := formatBotStartNotice(actor, BotStartAttribution{Payload: "ref_abc", Kind: "referral"})
	if title != "/start · реферальная ссылка" || !strings.Contains(summary, "реферальная ссылка") {
		t.Fatalf("referral title=%q summary=%q", title, summary)
	}
	title, _, _, _ = formatBotStartNotice(actor, BotStartAttribution{})
	if title != "/start в боте" {
		t.Fatalf("empty title=%q", title)
	}
}

func TestMirrorImportantToTelegram(t *testing.T) {
	if !mirrorImportantToTelegram("bot_start", nil) {
		t.Fatal("bot_start should mirror")
	}
	if !mirrorImportantToTelegram("deposit", nil) {
		t.Fatal("deposit should mirror")
	}
	if !mirrorImportantToTelegram("withdraw_failed", nil) {
		t.Fatal("withdraw_failed should mirror")
	}
	if mirrorImportantToTelegram("game_result", nil) {
		t.Fatal("game_result should not mirror")
	}
	if !mirrorImportantToTelegram("gift_withdraw", map[string]any{"status": "needs_purchase"}) {
		t.Fatal("gift purchase request should mirror")
	}
	if !mirrorImportantToTelegram("gift_withdraw", map[string]any{"status": "held"}) {
		t.Fatal("held gift withdraw should mirror")
	}
	if mirrorImportantToTelegram("gift_withdraw", map[string]any{"status": "sent"}) {
		t.Fatal("sent gift withdraw should not mirror")
	}
}
