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

func TestPickRecoveryCrashRange_NoBets(t *testing.T) {
	if _, ok := PickRecoveryCrashRange(nil, testWhaleThreshold); ok {
		t.Fatal("empty book should not trigger recovery bias")
	}
}

func TestPickRecoveryCrashRange_SmallManualNoBias(t *testing.T) {
	bets := []domain.GameBet{crashBet(1_000_000_000, nil)}
	if _, ok := PickRecoveryCrashRange(bets, testWhaleThreshold); ok {
		t.Fatal("small manual book should not trigger recovery bias")
	}
}

func TestPickRecoveryCrashRange_LargeManualSoftBias(t *testing.T) {
	bets := []domain.GameBet{crashBet(15_000_000_000, nil)}
	got, ok := PickRecoveryCrashRange(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("large manual book should trigger soft recovery bias")
	}
	if got.MinPoint != ManualSoftCrashMin || got.MaxPoint != ManualSoftCrashPoint {
		t.Fatalf("got [%.2f, %.2f], want [%.2f, %.2f]", got.MinPoint, got.MaxPoint, ManualSoftCrashMin, ManualSoftCrashPoint)
	}
}

func TestPickRecoveryCrashRange_AutoHasSpread(t *testing.T) {
	auto := 1.2
	bets := []domain.GameBet{crashBet(1_000_000_000, &auto)}
	got, ok := PickRecoveryCrashRange(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok with auto-cashout exposure")
	}
	if got.MaxPoint >= 1.2 {
		t.Fatalf("max %.2f should stay below auto 1.20", got.MaxPoint)
	}
	if got.MaxPoint-got.MinPoint < 0.05 {
		t.Fatalf("spread too tight: [%.2f, %.2f]", got.MinPoint, got.MaxPoint)
	}
	if got.MaxPoint > 1.19 || got.MinPoint < 1.01 {
		t.Fatalf("unexpected window [%.2f, %.2f] for auto 1.20", got.MinPoint, got.MaxPoint)
	}
}

func TestPickRecoveryCrashRange_AvoidsAutoPayout(t *testing.T) {
	auto := 2.0
	bets := []domain.GameBet{crashBet(1_000_000_000, &auto)}
	got, ok := PickRecoveryCrashRange(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok with auto-cashout exposure")
	}
	if got.MaxPoint >= 2.0 {
		t.Fatalf("max %.2f should stay below auto target 2.00", got.MaxPoint)
	}
	if got.MaxPoint != 1.99 {
		t.Fatalf("max %.2f, want 1.99", got.MaxPoint)
	}
	if got.MinPoint >= got.MaxPoint {
		t.Fatalf("invalid range [%.2f, %.2f]", got.MinPoint, got.MaxPoint)
	}
}

func TestPickRecoveryCrashRange_HeavyAutoPrefersBelowHighest(t *testing.T) {
	autoLow := 1.5
	autoHigh := 10.0
	bets := []domain.GameBet{
		crashBet(100_000_000, &autoLow),
		crashBet(1_000_000_000, &autoHigh),
	}
	got, ok := PickRecoveryCrashRange(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok")
	}
	if got.MaxPoint >= 1.5 {
		t.Fatalf("max %.2f, want below low auto 1.50", got.MaxPoint)
	}
}

func TestPickRecoveryCrashRange_AutoBeatsLargeManual(t *testing.T) {
	auto := 3.0
	bets := []domain.GameBet{
		crashBet(50_000_000_000, nil),
		crashBet(1_000_000_000, &auto),
	}
	got, ok := PickRecoveryCrashRange(bets, testWhaleThreshold)
	if !ok {
		t.Fatal("expected ok")
	}
	if got.MaxPoint != 2.99 {
		t.Fatalf("auto exposure should win, max %.2f", got.MaxPoint)
	}
}

func TestAutoRecoverySpreadRange(t *testing.T) {
	r := autoRecoverySpreadRange(1.19)
	if r.MaxPoint != 1.19 || r.MinPoint >= r.MaxPoint {
		t.Fatalf("bad range for 1.19 anchor: %+v", r)
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
