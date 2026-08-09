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

func TestPickBestHouseColor_HeavyBluePrefersGreen(t *testing.T) {
	bets := []domain.GameBet{
		betOn("blue", 100),
		betOn("red", 10),
		betOn("green", 5),
		betOn("yellow", 1),
	}
	// total 116; blue win: 116-200=-84; red: 116-20=96; green: 116-25=91 → red
	if got := PickBestHouseColor(bets); got != "red" {
		t.Fatalf("got %q, want red", got)
	}
}

func TestPickBestHouseColor_HeavyGreenPrefersRed(t *testing.T) {
	bets := []domain.GameBet{
		betOn("green", 100),
		betOn("blue", 10),
	}
	// red book empty → house keeps all 110
	if got := PickBestHouseColor(bets); got != "red" {
		t.Fatalf("got %q, want red", got)
	}
}

func TestPickBestHouseColor_NeverYellow(t *testing.T) {
	bets := []domain.GameBet{
		betOn("blue", 100),
		betOn("red", 10),
		betOn("yellow", 2),
	}
	for i := 0; i < 20; i++ {
		if got := PickBestHouseColor(bets); got == "yellow" {
			t.Fatalf("yellow must not be auto-picked")
		}
	}
	for i := 0; i < 20; i++ {
		got := PickBestHouseColor(nil)
		if got != "blue" && got != "red" && got != "green" {
			t.Fatalf("empty book got %q", got)
		}
	}
}

func TestHousePnLIfColor(t *testing.T) {
	by := map[string]int64{"blue": 100, "red": 0, "green": 0, "yellow": 0}
	if pnl := HousePnLIfColor("blue", by, 100); pnl != -100 {
		t.Fatalf("blue pnl=%d want -100", pnl)
	}
	if pnl := HousePnLIfColor("red", by, 100); pnl != 100 {
		t.Fatalf("red pnl=%d want 100", pnl)
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
