package cases

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestRunCasePlayerSimulateBoostVsNoBoost(t *testing.T) {
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	c := domain.Case{
		ID:           uuid.New(),
		Slug:         "farm",
		Title:        "Farm",
		Kind:         domain.CaseKindCatalog,
		PriceNanoton: 1e9,
		TargetRTPBPS: 9000,
	}
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 80, FloorPriceNanoton: 1e9, DisplayName: "Trash"},
		{ID: midID, Weight: 15, FloorPriceNanoton: 5e9, DisplayName: "Good"},
		{ID: fatID, Weight: 5, FloorPriceNanoton: 40e9, DisplayName: "Fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, midID: 5e9, fatID: 40e9}
	pool := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        140e9,
		RecoveryTarget: 0,
		LossThreshold:  -50e9,
		BiasWeight:     0,
		TargetBalance:  100e9,
		MaxPrizeBps:    10000,
	}
	settings := &domain.CaseCatalogSettings{
		DepositBoostEnabled:         true,
		BankTargetNanoton:           100e9,
		DepositBoostTier1MinNanoton: 1e9,
		DepositBoostTier2MinNanoton: 2e9,
		DepositBoostTier3MinNanoton: 5e9,
		DepositBoostTier4MinNanoton: 10e9,
		DepositBoostTier1BiasWeight: 0,
		DepositBoostTier2BiasWeight: 5,
		DepositBoostTier3BiasWeight: 10,
		DepositBoostTier4BiasWeight: 15,
		DepositBoostSurplusShareBps: 2500,
		DepositBoostRampNanoton:     10e9,
	}

	low := runCasePlayerSimulate(c, loot, floors, 200, 40, 1e9, settings, true, pool, nil, nil)
	high := runCasePlayerSimulate(c, loot, floors, 200, 40, 10e9, settings, true, pool, nil, nil)

	if low.BoostEligible {
		t.Fatal("1 TON depositor should not be boost eligible")
	}
	if !high.BoostEligible {
		t.Fatal("10 TON depositor should be boost eligible")
	}
	if low.BoostAppliedOpens != 0 {
		t.Fatalf("1 TON should never apply boost, got %d", low.BoostAppliedOpens)
	}
	if high.BoostAppliedOpens == 0 {
		t.Fatal("expected some boost opens for 10 TON player")
	}
	if len(high.SampleOpens) < 10 {
		t.Fatalf("expected sample timeline, got %d", len(high.SampleOpens))
	}
	if high.Iterations != 200 || high.SpentNanoton != 200e9 {
		t.Fatalf("unexpected spent/iterations: %+v", high)
	}
	if len(high.Entries) != 3 {
		t.Fatalf("expected 3 loot rows, got %d", len(high.Entries))
	}
	t.Logf("1TON boost=%d RTP=%d | 10TON boost=%d/%d RTP=%d sample[0]=%s bank %d→%d",
		low.BoostAppliedOpens, low.SimulatedRTPBPS,
		high.BoostAppliedOpens, high.Iterations, high.SimulatedRTPBPS,
		high.SampleOpens[0].DisplayName, high.BankStartNanoton, high.BankEndNanoton)
}
