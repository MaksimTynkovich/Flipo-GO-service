package cases

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestResolveDepositBoost(t *testing.T) {
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
	healthy := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        140e9,
		RecoveryTarget: 0,
		Recovery:       false,
	}
	const price = int64(1e9)

	boost := resolveDepositBoost(settings, healthy, price, 10e9)
	if !boost.Eligible || boost.EffectiveStrength != 15 {
		t.Fatalf("expected full tier-4 boost 15, got %+v", boost)
	}

	scaled := healthy
	scaled.Balance = 120e9
	boost = resolveDepositBoost(settings, scaled, price, 10e9)
	if !boost.Eligible || boost.EffectiveStrength != 7 {
		t.Fatalf("expected scaled boost 7 at 120 TON, got %+v", boost)
	}

	if got := resolveDepositBoost(settings, healthy, price, 1e9); got.Eligible {
		t.Fatalf("tier1 should stay off with 0%% boost, got %+v", got)
	}
	if got := resolveDepositBoost(settings, healthy, 0, 20e9); got.Eligible {
		t.Fatalf("expected no boost on free open, got %+v", got)
	}
	recovering := healthy
	recovering.Recovery = true
	if got := resolveDepositBoost(settings, recovering, price, 20e9); got.Eligible {
		t.Fatalf("expected no boost in recovery, got %+v", got)
	}
	underwater := healthy
	underwater.Balance = 99e9
	if got := resolveDepositBoost(settings, underwater, price, 20e9); got.Eligible {
		t.Fatalf("expected no boost when reserve not yet filled, got %+v", got)
	}
	daily := healthy
	daily.Kind = domain.CasePoolDaily
	if got := resolveDepositBoost(settings, daily, price, 20e9); got.Eligible {
		t.Fatalf("expected no boost on daily pool, got %+v", got)
	}
	disabled := *settings
	disabled.DepositBoostEnabled = false
	if got := resolveDepositBoost(&disabled, healthy, price, 20e9); got.Eligible {
		t.Fatalf("expected no boost when disabled, got %+v", got)
	}
}

func TestApplyDepositSurplusBoostRaisesFat(t *testing.T) {
	cheapID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 100, FloorPriceNanoton: 1e9},
		{ID: fatID, Weight: 100, FloorPriceNanoton: 40e9},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, fatID: 40e9}
	out := applyDepositSurplusBoost(loot, floors, 40)
	var cheapW, fatW int
	for _, e := range out {
		switch e.ID {
		case cheapID:
			cheapW = e.Weight
		case fatID:
			fatW = e.Weight
		}
	}
	if cheapW != 100 {
		t.Fatalf("cheap weight should stay 100, got %d", cheapW)
	}
	if fatW != 140 {
		t.Fatalf("fat weight should be 140 (+40%%), got %d", fatW)
	}
}

func TestDepositBoostWorkflowDemo_1_2_5_10TON(t *testing.T) {
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	baseLoot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 65, FloorPriceNanoton: 3e9, DisplayName: "Cheap 3 TON"},
		{ID: midID, Weight: 25, FloorPriceNanoton: 6e9, DisplayName: "Good 6 TON"},
		{ID: fatID, Weight: 10, FloorPriceNanoton: 12e9, DisplayName: "Fat 12 TON"},
	}
	floors := map[uuid.UUID]int64{cheapID: 3e9, midID: 6e9, fatID: 12e9}
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

	pool := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        140e9,
		RecoveryTarget: 0,
		Recovery:       false,
		BiasWeight:     50,
		TargetBalance:  100e9,
	}
	const casePrice = int64(5e9)

	type player struct {
		name     string
		deposits int64
	}
	players := []player{
		{name: "Tier 1 TON", deposits: 1e9},
		{name: "Tier 2 TON", deposits: 2e9},
		{name: "Tier 5 TON", deposits: 5e9},
		{name: "Tier 10 TON", deposits: 10e9},
	}

	t.Log("=== WORKFLOW: reserve-first paid open, bank above 100 TON reserve ===")
	t.Log("case_price=5 TON | reserve_target=100 TON | bank_balance=140 TON | surplus_share=25% | ramp=10 TON")
	t.Log("loot table (base weights): Cheap 65 | Good 25 | Fat 10")

	const opens = 10_000
	prevGoodWeight := -1
	for _, p := range players {
		boost := resolveDepositBoost(settings, pool, casePrice, p.deposits)
		loot := biasLootWeights(baseLoot, floors, pool)
		if boost.EffectiveStrength > 0 {
			loot = applyDepositSurplusBoost(loot, floors, boost.EffectiveStrength)
		}

		var wTrash, wGood, wFat int
		for _, e := range loot {
			switch e.ID {
			case cheapID:
				wTrash = e.Weight
			case midID:
				wGood = e.Weight
			case fatID:
				wFat = e.Weight
			}
		}

		hits := map[string]int{}
		sample := make([]string, 0, 12)
		for i := 0; i < opens; i++ {
			e, _, err := pickWeighted(loot)
			if err != nil {
				t.Fatal(err)
			}
			hits[e.DisplayName]++
			if i < 12 {
				sample = append(sample, e.DisplayName)
			}
		}

		t.Logf("--- %s | deposits=%.0f TON | boost=%d%% scale=%d%% ---", p.name, float64(p.deposits)/1e9, boost.EffectiveStrength, boost.SurplusScaleBps/100)
		t.Logf("effective weights: Trash=%d Good=%d Fat=%d", wTrash, wGood, wFat)
		t.Logf("12 sample opens: %v", sample)
		t.Logf("over %d opens: Trash=%d (%.1f%%) | Good=%d (%.1f%%) | Fat=%d (%.1f%%)",
			opens,
			hits["Cheap 3 TON"], 100*float64(hits["Cheap 3 TON"])/float64(opens),
			hits["Good 6 TON"], 100*float64(hits["Good 6 TON"])/float64(opens),
			hits["Fat 12 TON"], 100*float64(hits["Fat 12 TON"])/float64(opens),
		)
		goodWeight := wGood + wFat
		if prevGoodWeight >= 0 && goodWeight < prevGoodWeight {
			t.Fatalf("expected monotonic better good-prize weight by tier, got prev=%d now=%d", prevGoodWeight, goodWeight)
		}
		prevGoodWeight = goodWeight
	}
}

func TestDepositBoostMonteCarloHitRate(t *testing.T) {
	// Parameters used for this test (also logged in result):
	// - loot: cheap 1 TON w=80, mid 5 TON w=15, fat 40 TON w=5
	// - paid bank healthy, strength=40, 20_000 rolls
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	loot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 80, FloorPriceNanoton: 1e9, DisplayName: "cheap"},
		{ID: midID, Weight: 15, FloorPriceNanoton: 5e9, DisplayName: "mid"},
		{ID: fatID, Weight: 5, FloorPriceNanoton: 40e9, DisplayName: "fat"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, midID: 5e9, fatID: 40e9}

	baseHits := map[uuid.UUID]int{}
	boostHits := map[uuid.UUID]int{}
	const n = 20_000
	for i := 0; i < n; i++ {
		e, _, err := pickWeighted(loot)
		if err != nil {
			t.Fatal(err)
		}
		baseHits[e.ID]++
		boosted := applyDepositSurplusBoost(loot, floors, 40)
		e2, _, err := pickWeighted(boosted)
		if err != nil {
			t.Fatal(err)
		}
		boostHits[e2.ID]++
	}

	baseGood := baseHits[midID] + baseHits[fatID]
	boostGood := boostHits[midID] + boostHits[fatID]
	t.Logf("params: iterations=%d strength=40 median_cut=above_median loot_weights=80/15/5 prices=1/5/40 TON", n)
	t.Logf("base good(mid+fat)=%d (%.2f%%) boost good=%d (%.2f%%)",
		baseGood, 100*float64(baseGood)/float64(n),
		boostGood, 100*float64(boostGood)/float64(n))
	t.Logf("base fat=%d boost fat=%d | base mid=%d boost mid=%d | base cheap=%d boost cheap=%d",
		baseHits[fatID], boostHits[fatID],
		baseHits[midID], boostHits[midID],
		baseHits[cheapID], boostHits[cheapID])

	if boostGood <= baseGood {
		t.Fatalf("expected deposit boost to increase mid+fat hits: base=%d boost=%d", baseGood, boostGood)
	}
	// Theoretical: median of {1,5,40}=5, so mid+fat both boosted.
	// Expected boost good rate roughly 20*1.4 / (80 + 20*1.4) = 28/108 ≈ 25.9% vs 20%.
	boostRate := float64(boostGood) / float64(n)
	if boostRate < 0.22 || boostRate > 0.32 {
		t.Fatalf("boost good rate out of expected band [22%%,32%%]: %.2f%%", 100*boostRate)
	}
}

func TestCooldownReadyNotifyCycle(t *testing.T) {
	// ready_notified_at must be before last_claimed_at (or nil) to allow a new cycle notify.
	claimed := mustParseTime(t, "2026-08-01T12:00:00Z")
	if !cooldownNeedsReadyNotify(nil, claimed) {
		t.Fatal("nil notified_at should need notify")
	}
	older := claimed.Add(-time.Hour)
	if !cooldownNeedsReadyNotify(&older, claimed) {
		t.Fatal("notified before claim should need notify")
	}
	newer := claimed.Add(time.Hour)
	if cooldownNeedsReadyNotify(&newer, claimed) {
		t.Fatal("already notified this cycle should skip")
	}
}

func mustParseTime(t *testing.T, raw string) time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		t.Fatal(err)
	}
	return ts
}

// cooldownNeedsReadyNotify mirrors ListDailyCooldownsReadyForNotify cycle check.
func cooldownNeedsReadyNotify(readyNotifiedAt *time.Time, lastClaimedAt time.Time) bool {
	if readyNotifiedAt == nil {
		return true
	}
	return readyNotifiedAt.Before(lastClaimedAt)
}
