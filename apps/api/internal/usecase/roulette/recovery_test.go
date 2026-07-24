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
	// red: 115-200=-85; green: 115-70=45; black: 115-20=95
	if got := PickBestHouseColor(bets); got != "black" {
		t.Fatalf("got %q, want black", got)
	}
}

func TestPickBestHouseColor_EmptyBookPrefersGreen(t *testing.T) {
	if got := PickBestHouseColor(nil); got != "green" {
		t.Fatalf("got %q, want green", got)
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
