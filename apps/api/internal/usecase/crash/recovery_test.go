package crash

import (
	"encoding/json"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const testWhaleThreshold = 10_000_000_000 // 10 TON

func crashBet(amount int64, auto *float64) domain.GameBet {
	sel, _ := json.Marshal(betAutoCashout{AutoCashoutMultiplier: auto})
	return domain.GameBet{
		ID:            uuid.New(),
		AmountNanoton: amount,
		Selection:     datatypes.JSON(sel),
		Status:        domain.BetPending,
	}
}

func TestPickRecoveryCrashPoint_NoBets(t *testing.T) {
	if _, ok := PickRecoveryCrashPoint(nil, testWhaleThreshold); ok {
		t.Fatal("empty book should not trigger recovery bias")
	}
}

func TestPickRecoveryCrashPoint_SmallManualNoBias(t *testing.T) {
	bets := []domain.GameBet{crashBet(1_000_000_000, nil)}
	if _, ok := PickRecoveryCrashPoint(bets, testWhaleThreshold); ok {
		t.Fatal("small manual book should not trigger recovery bias")
	}
}

func TestPickRecoveryCrashPoint_LargeManualSoftBias(t *testing.T) {
	bets := []domain.GameBet{crashBet(15_000_000_000, nil)}
	got, ok := PickRecoveryCrashPoint(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("large manual book should trigger soft recovery bias")
	}
	if got != ManualSoftCrashPoint {
		t.Fatalf("got %.2f, want soft point %.2f", got, ManualSoftCrashPoint)
	}
}

func TestPickRecoveryCrashPoint_AvoidsAutoPayout(t *testing.T) {
	auto := 2.0
	bets := []domain.GameBet{
		crashBet(1_000_000_000, &auto),
	}
	got, ok := PickRecoveryCrashPoint(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok with auto-cashout exposure")
	}
	if got >= 2.0 {
		t.Fatalf("got %.2f, should stay below auto target 2.00", got)
	}
	if got != 1.99 {
		t.Fatalf("got %.2f, want softest optimal 1.99", got)
	}
}

func TestPickRecoveryCrashPoint_HeavyAutoPrefersBelowHighest(t *testing.T) {
	autoLow := 1.5
	autoHigh := 10.0
	bets := []domain.GameBet{
		crashBet(100_000_000, &autoLow),
		crashBet(1_000_000_000, &autoHigh),
	}
	got, ok := PickRecoveryCrashPoint(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok")
	}
	if got >= 1.5 {
		t.Fatalf("got %.2f, want below low auto 1.50", got)
	}
}

func TestPickRecoveryCrashPoint_AutoBeatsLargeManual(t *testing.T) {
	auto := 3.0
	bets := []domain.GameBet{
		crashBet(50_000_000_000, nil),
		crashBet(1_000_000_000, &auto),
	}
	got, ok := PickRecoveryCrashPoint(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok")
	}
	if got != 2.99 {
		t.Fatalf("auto exposure should win, got %.2f", got)
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
