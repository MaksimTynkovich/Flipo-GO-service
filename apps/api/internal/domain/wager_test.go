package domain

import "testing"

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
	// balance 0.437, remaining 0.106 → free 0.331
	cap := WithdrawableDebitCap(436_986_532, 106_444_872, 0)
	want := int64(436_986_532 - 106_444_872)
	if cap != want {
		t.Fatalf("got %d want %d", cap, want)
	}
	if WithdrawableDebitCap(100, 100, 0) != 0 {
		t.Fatal("fully locked")
	}
	if WithdrawableDebitCap(100, 50, 50) != 100 {
		t.Fatal("cleared lock")
	}
}
