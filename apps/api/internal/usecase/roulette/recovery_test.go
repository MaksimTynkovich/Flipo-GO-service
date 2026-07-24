package roulette

import (
	"encoding/json"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func betOn(color string, amount int64) domain.GameBet {
	sel, _ := json.Marshal(map[string]string{"color": color})
	return domain.GameBet{
		ID:            uuid.New(),
		AmountNanoton: amount,
		Selection:     datatypes.JSON(sel),
		Status:        domain.BetPending,
	}
}

func TestPickBestHouseColor_HeavyRedPrefersBlack(t *testing.T) {
	bets := []domain.GameBet{
		betOn("red", 100),
		betOn("black", 10),
		betOn("green", 5),
	}
	if got := PickBestHouseColor(bets); got != "black" {
		t.Fatalf("got %q, want black", got)
	}
}

func TestPickBestHouseColor_HeavyBlackPrefersRed(t *testing.T) {
	bets := []domain.GameBet{
		betOn("black", 100),
		betOn("red", 10),
	}
	if got := PickBestHouseColor(bets); got != "red" {
		t.Fatalf("got %q, want red", got)
	}
}

func TestPickBestHouseColor_NeverGreen(t *testing.T) {
	// Green would maximize PnL (185-70=115 vs black 95), but must not be chosen.
	bets := []domain.GameBet{
		betOn("red", 100),
		betOn("black", 10),
		betOn("green", 5),
	}
	for i := 0; i < 20; i++ {
		if got := PickBestHouseColor(bets); got == "green" {
			t.Fatalf("green must not be auto-picked, got green")
		}
	}
	// Empty book: only red/black.
	for i := 0; i < 20; i++ {
		got := PickBestHouseColor(nil)
		if got != "red" && got != "black" {
			t.Fatalf("empty book got %q, want red or black", got)
		}
	}
}

func TestHousePnLIfColor(t *testing.T) {
	if pnl := HousePnLIfColor("red", 100, 0, 0, 100); pnl != -100 {
		t.Fatalf("red pnl=%d want -100", pnl)
	}
	if pnl := HousePnLIfColor("black", 100, 0, 0, 100); pnl != 100 {
		t.Fatalf("black pnl=%d want 100", pnl)
	}
}

func TestSyncRouletteRecoveryHysteresis(t *testing.T) {
	s := &domain.PlatformRiskSettings{
		RouletteRecoveryEnabled:       true,
		RouletteLossThresholdNanoton:  -50,
		RouletteRecoveryTargetNanoton: 0,
		RouletteBankNanoton:           -60,
	}
	domain.SyncRouletteRecoveryHysteresis(s)
	if !s.RouletteRecoveryActive {
		t.Fatal("expected enter recovery")
	}
	s.RouletteBankNanoton = -10
	domain.SyncRouletteRecoveryHysteresis(s)
	if !s.RouletteRecoveryActive {
		t.Fatal("should stay in recovery until target")
	}
	s.RouletteBankNanoton = 0
	domain.SyncRouletteRecoveryHysteresis(s)
	if s.RouletteRecoveryActive {
		t.Fatal("expected exit recovery at target")
	}
}
