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

func TestSmoothRecoveryDrainKeepsBottomTier(t *testing.T) {
	a := uuid.New()
	b := uuid.New()
	c := uuid.New()
	fat := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: a, Weight: 10, FloorPriceNanoton: 1e9},
		{ID: b, Weight: 10, FloorPriceNanoton: 2e9},
		{ID: c, Weight: 10, FloorPriceNanoton: 3e9},
		{ID: fat, Weight: 10, FloorPriceNanoton: 40e9},
	}
	floors := map[uuid.UUID]int64{a: 1e9, b: 2e9, c: 3e9, fat: 40e9}
	pool := domain.CasePoolSnapshot{
		Kind:                      domain.CasePoolPaid,
		Enabled:                   true,
		Balance:                   0,
		MaxPrizeBps:               5000,
		Recovery:                  true,
		RecoverySmooth:            true,
		RecoveryDrainOpens:        2,
		RecoveryReliefOpens:       1,
		RecoveryReliefMaxPrizeBps: 3000,
		RecoveryPaceCounter:       0,
		RecoveryPhase:             domain.CaseRecoveryPhaseDrain,
		LossThreshold:             -50e9,
		RecoveryTarget:            0,
	}
	out := filterLootForPool(loot, floors, pool, 2e9, nil)
	if len(out) < 2 {
		t.Fatalf("smooth drain should keep bottom tiers, got %d: %+v", len(out), out)
	}
	for _, e := range out {
		if e.ID == fat {
			t.Fatalf("fat should not pass drain ceiling")
		}
	}
}

func TestSmoothRecoveryReliefAllowsMidTier(t *testing.T) {
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 10, FloorPriceNanoton: 1e9},
		{ID: midID, Weight: 10, FloorPriceNanoton: 8e9},
		{ID: fatID, Weight: 10, FloorPriceNanoton: 80e9},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, midID: 8e9, fatID: 80e9}
	pool := domain.CasePoolSnapshot{
		Kind:                      domain.CasePoolPaid,
		Enabled:                   true,
		Balance:                   50e9,
		MaxPrizeBps:               5000,
		Recovery:                  true,
		RecoverySmooth:            true,
		RecoveryDrainOpens:        2,
		RecoveryReliefOpens:       1,
		RecoveryReliefMaxPrizeBps: 3000,
		RecoveryPaceCounter:       2, // after 2 drains => relief
		RecoveryPhase:             domain.CaseRecoveryPhaseRelief,
		RecoveryProgress:          0.8,
		LossThreshold:             -50e9,
		RecoveryTarget:            100e9,
	}
	out := filterLootForPool(loot, floors, pool, 2e9, nil)
	ids := map[uuid.UUID]bool{}
	for _, e := range out {
		ids[e.ID] = true
	}
	if !ids[cheapID] || !ids[midID] {
		t.Fatalf("relief should allow cheap+mid, got %+v", out)
	}
	if ids[fatID] {
		t.Fatalf("fat should still be blocked in relief")
	}
}

func TestSyncCaseBankHysteresisResetsPaceOnExit(t *testing.T) {
	s := &domain.CaseCatalogSettings{
		BankEnabled:                   true,
		BankNanoton:                   -60e9,
		BankLossThresholdNanoton:      -50e9,
		BankRecoveryTargetNanoton:     0,
		BankBiasWeight:                50,
		BankRecoverySmoothEnabled:     true,
		BankRecoveryDrainOpens:        2,
		BankRecoveryReliefOpens:       1,
		BankRecoveryReliefMaxPrizeBps: 3000,
		BankRecoveryPaceCounter:       5,
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
	if s.BankRecoveryPaceCounter != 0 {
		t.Fatalf("pace should reset on exit, got %d", s.BankRecoveryPaceCounter)
	}
}

func TestAdvancePaidRecoveryPaceCycle(t *testing.T) {
	s := &domain.CaseCatalogSettings{
		BankEnabled:                   true,
		BankRecoveryActive:            true,
		BankRecoverySmoothEnabled:     true,
		BankRecoveryDrainOpens:        2,
		BankRecoveryReliefOpens:       1,
		BankRecoveryReliefMaxPrizeBps: 3000,
		BankRecoveryPaceCounter:       0,
	}
	domain.AdvancePaidRecoveryPace(s)
	if s.BankRecoveryPaceCounter != 1 {
		t.Fatalf("pace after 1 open: %d", s.BankRecoveryPaceCounter)
	}
	domain.AdvancePaidRecoveryPace(s)
	if s.BankRecoveryPaceCounter != 2 {
		t.Fatalf("pace after 2 opens: %d", s.BankRecoveryPaceCounter)
	}
	if phase := domain.CaseRecoveryPhase(2, 1, s.BankRecoveryPaceCounter); phase != domain.CaseRecoveryPhaseRelief {
		t.Fatalf("expected relief at pace 2, got %s", phase)
	}
	domain.AdvancePaidRecoveryPace(s)
	if s.BankRecoveryPaceCounter != 0 {
		t.Fatalf("pace should wrap to 0, got %d", s.BankRecoveryPaceCounter)
	}
}

func TestSmoothRecoverySimulatesHigherRTPThanCheapestOnly(t *testing.T) {
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 70, FloorPriceNanoton: 1e9, DisplayName: "cheap"},
		{ID: midID, Weight: 25, FloorPriceNanoton: 5e9, DisplayName: "mid"},
		{ID: fatID, Weight: 5, FloorPriceNanoton: 40e9, DisplayName: "fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, midID: 5e9, fatID: 40e9}
	c := domain.Case{ID: uuid.New(), PriceNanoton: 3e9, TargetRTPBPS: 9000}

	// Classic empty-bank path: collapse to cheapest-only (bps=0 ⇒ max prize 0).
	classic := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        0,
		MaxPrizeBps:    0,
		BiasWeight:     50,
		Recovery:       true,
		LossThreshold:  -50e9,
		RecoveryTarget: 1e15,
	}
	smooth := domain.CasePoolSnapshot{
		Kind:                      domain.CasePoolPaid,
		Enabled:                   true,
		Balance:                   20e9,
		MaxPrizeBps:               5000,
		BiasWeight:                50,
		Recovery:                  true,
		RecoverySmooth:            true,
		RecoveryDrainOpens:        2,
		RecoveryReliefOpens:       1,
		RecoveryReliefMaxPrizeBps: 4000,
		RecoveryProgress:          0.7,
		LossThreshold:             -50e9,
		RecoveryTarget:            1e15,
	}

	classicRes := runCaseSimulateWithBank(c, loot, floors, 600, classic, nil, nil)
	smoothRes := runCaseSimulateWithBank(c, loot, floors, 600, smooth, nil, nil)
	if !classicRes.RTPAvailable || !smoothRes.RTPAvailable {
		t.Fatal("expected RTP available")
	}
	if smoothRes.SimulatedRTPBPS <= classicRes.SimulatedRTPBPS {
		t.Fatalf("smooth RTP should exceed classic cheapest-only: smooth=%d classic=%d",
			smoothRes.SimulatedRTPBPS, classicRes.SimulatedRTPBPS)
	}
	if smoothRes.HouseEdgeNanoton <= 0 {
		t.Fatalf("expected positive house edge with smooth recovery, got %d", smoothRes.HouseEdgeNanoton)
	}
	var midHitsClassic, midHitsSmooth int
	for _, e := range classicRes.Entries {
		if e.LootEntryID == midID {
			midHitsClassic = e.Hits
		}
	}
	for _, e := range smoothRes.Entries {
		if e.LootEntryID == midID {
			midHitsSmooth = e.Hits
		}
	}
	if midHitsSmooth <= midHitsClassic {
		t.Fatalf("smooth should award mid more often than classic: smooth=%d classic=%d", midHitsSmooth, midHitsClassic)
	}
}
