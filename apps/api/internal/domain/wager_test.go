package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestCrashWagerCredit(t *testing.T) {
	stake := int64(1_000_000_000) // 1 TON
	target := 2.0

	if got := CrashWagerCredit(stake, nil, target); got != stake {
		t.Fatalf("loss: got %d want %d", got, stake)
	}

	m101 := 1.01
	if got := CrashWagerCredit(stake, &m101, target); got != 10_000_000 {
		t.Fatalf("1.01: got %d want %d", got, 10_000_000)
	}

	m15 := 1.5
	if got := CrashWagerCredit(stake, &m15, target); got != 500_000_000 {
		t.Fatalf("1.5: got %d want %d", got, 500_000_000)
	}

	m2 := 2.0
	if got := CrashWagerCredit(stake, &m2, target); got != stake {
		t.Fatalf("2.0: got %d want %d", got, stake)
	}

	m3 := 3.0
	if got := CrashWagerCredit(stake, &m3, target); got != stake {
		t.Fatalf("3.0: got %d want %d", got, stake)
	}
}

func TestWithdrawableDebitCap(t *testing.T) {
	// No progress yet — fully locked.
	if WithdrawableDebitCap(1_000_000_000, 1_000_000_000, 0) != 0 {
		t.Fatal("no progress")
	}
	// Deposit 1, lost/spent 0.5 → unlock 0.5 of remaining balance.
	if got := WithdrawableDebitCap(500_000_000, 1_000_000_000, 500_000_000); got != 500_000_000 {
		t.Fatalf("after half loss: got %d", got)
	}
	// Mid-wager win: only progress unlocks, not full balance.
	if got := WithdrawableDebitCap(2_000_000_000, 1_000_000_000, 500_000_000); got != 500_000_000 {
		t.Fatalf("mid-wager win: got %d", got)
	}
	if WithdrawableDebitCap(100, 100, 0) != 0 {
		t.Fatal("fully locked")
	}
	if WithdrawableDebitCap(100, 50, 50) != 100 {
		t.Fatal("cleared lock")
	}
	if WithdrawableDebitCap(100, 0, 0) != 100 {
		t.Fatal("no requirement")
	}
}

func TestGiftWagerValueNanoton(t *testing.T) {
	if got := GiftWagerValueNanoton(100, 200); got != 0 {
		t.Fatalf("gifts exempt: %d", got)
	}
}

func TestWagerIncompleteErrorUnwrap(t *testing.T) {
	user := &User{WagerRequiredNanoton: 1e9, WagerProgressNanoton: 2e8, BettingBalance: 5e8}
	err := NewWagerIncomplete(user, 4e8)
	if !errors.Is(err, ErrWagerIncomplete) {
		t.Fatal("unwrap")
	}
	msg := FormatWagerIncompleteMessage(err)
	if msg == "" || msg == ErrWagerIncomplete.Error() {
		t.Fatalf("expected detailed message, got %q", msg)
	}
	if !strings.Contains(msg, "Доступно к выводу") {
		t.Fatalf("expected available amount in message, got %q", msg)
	}
}
