package crash

import (
	"encoding/json"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func crashBet(amount int64, auto *float64) domain.GameBet {
	sel, _ := json.Marshal(betAutoCashout{AutoCashoutMultiplier: auto})
	return domain.GameBet{
		ID:            uuid.New(),
		AmountNanoton: amount,
		Selection:     datatypes.JSON(sel),
		Status:        domain.BetPending,
	}
}

func TestPickBestCrashPoint_AvoidsAutoPayout(t *testing.T) {
	auto := 2.0
	bets := []domain.GameBet{
		crashBet(1_000_000_000, &auto),
	}
	got := PickBestCrashPoint(bets)
	if got >= 2.0 {
		t.Fatalf("got %.2f, should stay below auto target 2.00", got)
	}
}

func TestPickBestCrashPoint_HeavyAutoPrefersInstant(t *testing.T) {
	autoLow := 1.5
	autoHigh := 10.0
	bets := []domain.GameBet{
		crashBet(100_000_000, &autoLow),
		crashBet(1_000_000_000, &autoHigh),
	}
	if got := PickBestCrashPoint(bets); got != 1.0 {
		t.Fatalf("got %.2f, want 1.00", got)
	}
}

func TestHousePnLIfCrashPoint(t *testing.T) {
	auto := 2.0
	bets := []domain.GameBet{crashBet(1_000_000_000, &auto)}
	if pnl := HousePnLIfCrashPoint(bets, 1.99); pnl != 1_000_000_000 {
		t.Fatalf("below target pnl=%d want full stake", pnl)
	}
	if pnl := HousePnLIfCrashPoint(bets, 2.0); pnl != -1_000_000_000 {
		t.Fatalf("at target pnl=%d want -stake", pnl)
	}
}

func TestSyncCrashRecoveryHysteresis(t *testing.T) {
	s := &domain.PlatformRiskSettings{
		CrashRecoveryEnabled:       true,
		CrashLossThresholdNanoton:  -50,
		CrashRecoveryTargetNanoton: 0,
		CrashBankNanoton:           -60,
	}
	domain.SyncCrashRecoveryHysteresis(s)
	if !s.CrashRecoveryActive {
		t.Fatal("expected enter recovery")
	}
	s.CrashBankNanoton = -10
	domain.SyncCrashRecoveryHysteresis(s)
	if !s.CrashRecoveryActive {
		t.Fatal("should stay in recovery until target")
	}
	s.CrashBankNanoton = 0
	domain.SyncCrashRecoveryHysteresis(s)
	if s.CrashRecoveryActive {
		t.Fatal("expected exit recovery at target")
	}
}
