package telegram

import (
	"context"
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

	n.NotifyBotStart(context.Background(), AdminActor{TelegramID: 111, Username: "admin"})
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

func TestNotifyWheelShareAllowsAdminActor(t *testing.T) {
	store := &countingStore{}
	n := NewAdminNotifier(store, nil, []int64{111})
	n.NotifyWheelShare(context.Background(), AdminActor{TelegramID: 111, Username: "admin"}, "share")
	waitPersist()
	if store.getCount() != 1 {
		t.Fatalf("expected wheel share to notify for admin actor, got %d", store.getCount())
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

func TestMirrorImportantToTelegram(t *testing.T) {
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
