package telegram

import (
	"context"
	"testing"
)

func TestAdminNotifierSkipsAdmins(t *testing.T) {
	n := NewAdminNotifier(NewBotAPI("token"), []int64{111, 222})
	if !n.IsAdmin(111) {
		t.Fatal("expected 111 to be admin")
	}
	if n.IsAdmin(333) {
		t.Fatal("expected 333 not to be admin")
	}

	// Should no-op for admin actors (no panic / no send attempt beyond Enabled checks).
	n.NotifyBotStart(context.Background(), AdminActor{TelegramID: 111, Username: "admin"})
	n.NotifyDeposit(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyDepositConfirmed(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyWithdrawAttempt(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000, true)
	n.NotifyWithdrawConfirmed(context.Background(), AdminActor{TelegramID: 111}, 1_000_000_000)
	n.NotifyReferralShare(context.Background(), AdminActor{TelegramID: 111}, "copy")
}

func TestNotifyGiftInventoryAllowsAdminActor(t *testing.T) {
	n := NewAdminNotifier(NewBotAPI("token"), []int64{111})
	// Gift deposits notify even when the depositor is an admin (notifyAll path).
	n.NotifyGiftInventory(context.Background(), AdminActor{TelegramID: 111, Username: "admin"}, "Vice Cream", 1_000_000_000)
}

func TestNotifyWheelShareAllowsAdminActor(t *testing.T) {
	n := NewAdminNotifier(NewBotAPI("token"), []int64{111})
	n.NotifyWheelShare(context.Background(), AdminActor{TelegramID: 111, Username: "admin"}, "share")
}

func TestFormatActor(t *testing.T) {
	got := FormatActor(AdminActor{TelegramID: 42, Username: "bob", FirstName: "Bob", LastName: "Lee"})
	want := "Bob Lee (@bob, id=42)"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestAdminNotifierDisabledWithoutIDs(t *testing.T) {
	n := NewAdminNotifier(NewBotAPI("token"), nil)
	if n.Enabled() {
		t.Fatal("expected disabled without admin ids")
	}
}
