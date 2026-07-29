package cases

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestFilterLootHardCeiling(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 10, FloorPriceNanoton: 1_000_000_000, DisplayName: "cheap"},
		{ID: fatID, Weight: 1, FloorPriceNanoton: 50_000_000_000, DisplayName: "fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 50e9}
	pool := domain.CasePoolSnapshot{Enabled: true, Balance: 10e9, MaxPrizeBps: 5000} // max 5 TON
	out := filterLootForPool(loot, floors, pool, 2e9, nil)
	if len(out) != 1 || out[0].ID != cheapID {
		t.Fatalf("expected only cheap, got %+v", out)
	}
}

func TestFilterLootFallbackCheapest(t *testing.T) {
	a := uuid.New()
	b := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: a, Weight: 1, FloorPriceNanoton: 20e9},
		{ID: b, Weight: 1, FloorPriceNanoton: 5e9},
	}
	floors := map[uuid.UUID]int64{a: 20e9, b: 5e9}
	pool := domain.CasePoolSnapshot{Enabled: true, Balance: 0, MaxPrizeBps: 5000}
	out := filterLootForPool(loot, floors, pool, 1e9, nil)
	if len(out) != 1 || out[0].ID != b {
		t.Fatalf("expected cheapest fallback, got %+v", out)
	}
}

func TestBiasRecoveryCutsFat(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 100, FloorPriceNanoton: 1e9},
		{ID: fatID, Weight: 100, FloorPriceNanoton: 40e9},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 40e9}
	pool := domain.CasePoolSnapshot{Enabled: true, BiasWeight: 50, Recovery: true, Balance: -10e9}
	out := biasLootWeights(loot, floors, pool)
	var cheapW, fatW int
	for _, e := range out {
		switch e.ID {
		case cheapID:
			cheapW = e.Weight
		case fatID:
			fatW = e.Weight
		}
	}
	if fatW >= 100 || cheapW <= 100 {
		t.Fatalf("expected fat cut and cheap boost, cheap=%d fat=%d", cheapW, fatW)
	}
}

func TestSyncCaseBankHysteresis(t *testing.T) {
	s := &domain.CaseCatalogSettings{
		BankEnabled:               true,
		BankNanoton:               -60e9,
		BankLossThresholdNanoton:  -50e9,
		BankRecoveryTargetNanoton: 0,
		BankBiasWeight:            50,
	}
	domain.SyncCaseBankHysteresis(s)
	if !s.BankRecoveryActive {
		t.Fatal("expected recovery enter")
	}
	s.BankNanoton = 1e9
	domain.SyncCaseBankHysteresis(s)
	if s.BankRecoveryActive {
		t.Fatal("expected recovery exit")
	}
}

func TestFilterLootStockGateBlocksWhenNoStock(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, PrizeType: domain.CasePrizeTypeGift, Weight: 10, FloorPriceNanoton: 1e9, DisplayName: "cheap"},
		{ID: fatID, PrizeType: domain.CasePrizeTypeGift, Weight: 1, FloorPriceNanoton: 40e9, DisplayName: "fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 40e9}
	// maxPrize = 100e9 * 0.5 = 50e9 => fat passes ceiling, then gets filtered by stock gate.
	pool := domain.CasePoolSnapshot{Enabled: true, Balance: 100e9, MaxPrizeBps: 5000}
	out := filterLootForPool(loot, floors, pool, 1e9, func(e domain.CaseLootEntry) bool { return false })
	if len(out) != 1 || out[0].ID != cheapID {
		t.Fatalf("expected only cheap after stock gate, got %+v", out)
	}
}

func TestFilterLootFatPaused(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, PrizeType: domain.CasePrizeTypeGift, Weight: 10, FloorPriceNanoton: 1e9, DisplayName: "cheap"},
		{ID: fatID, PrizeType: domain.CasePrizeTypeGift, Weight: 1, FloorPriceNanoton: 40e9, DisplayName: "fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 40e9}
	// median=20.5e9, fat price>median => excluded when FatPaused=true
	pool := domain.CasePoolSnapshot{Enabled: true, Balance: 100e9, MaxPrizeBps: 10000, FatPaused: true}
	out := filterLootForPool(loot, floors, pool, 1e9, nil)
	if len(out) != 1 || out[0].ID != cheapID {
		t.Fatalf("expected only cheap after fat pause, got %+v", out)
	}
}

func TestBiasSurplusBoostsFat(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, PrizeType: domain.CasePrizeTypeGift, Weight: 100, FloorPriceNanoton: 1e9},
		{ID: fatID, PrizeType: domain.CasePrizeTypeGift, Weight: 100, FloorPriceNanoton: 40e9},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 40e9}
	// median ~= 20.5e9, fat >= median => surplus boost, cheap < median => no boost.
	pool := domain.CasePoolSnapshot{Enabled: true, BiasWeight: 50, Recovery: false, TargetBalance: 10e9, Balance: 20e9}
	out := biasLootWeights(loot, floors, pool)
	var cheapW, fatW int
	for _, e := range out {
		switch e.ID {
		case cheapID:
			cheapW = e.Weight
		case fatID:
			fatW = e.Weight
		}
	}
	if fatW <= 100 || cheapW != 100 {
		t.Fatalf("expected fat boosted above 100, cheap unchanged 100; cheap=%d fat=%d", cheapW, fatW)
	}
}
