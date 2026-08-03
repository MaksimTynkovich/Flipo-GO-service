package cases

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestDepositBoostEligible(t *testing.T) {
	healthy := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        50e9,
		RecoveryTarget: 0,
		Recovery:       false,
	}
	const price = int64(1e9)
	const minDep = int64(10e9)
	const strength = 40

	if !depositBoostEligible(healthy, price, 10e9, true, minDep, strength) {
		t.Fatal("expected boost for depositor when bank healthy")
	}
	if depositBoostEligible(healthy, price, 9e9, true, minDep, strength) {
		t.Fatal("expected no boost below deposit threshold")
	}
	if depositBoostEligible(healthy, 0, 20e9, true, minDep, strength) {
		t.Fatal("expected no boost on free open")
	}
	recovering := healthy
	recovering.Recovery = true
	if depositBoostEligible(recovering, price, 20e9, true, minDep, strength) {
		t.Fatal("expected no boost in recovery")
	}
	underwater := healthy
	underwater.Balance = -1
	underwater.RecoveryTarget = 0
	if depositBoostEligible(underwater, price, 20e9, true, minDep, strength) {
		t.Fatal("expected no boost when balance below recovery target")
	}
	daily := healthy
	daily.Kind = domain.CasePoolDaily
	if depositBoostEligible(daily, price, 20e9, true, minDep, strength) {
		t.Fatal("expected no boost on daily pool")
	}
	if depositBoostEligible(healthy, price, 20e9, false, minDep, strength) {
		t.Fatal("expected no boost when disabled")
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

func TestDepositBoostWorkflowDemo_1TON_vs_10TON(t *testing.T) {
	// Demo workflow: same paid case, healthy bank, two players.
	// Case price 1 TON; loot: trash / mid gift / fat gift.
	cheapID := uuid.New()
	midID := uuid.New()
	fatID := uuid.New()
	baseLoot := []domain.CaseLootEntry{
		{ID: cheapID, Weight: 80, FloorPriceNanoton: 1e9, DisplayName: "Trash gift 1 TON"},
		{ID: midID, Weight: 15, FloorPriceNanoton: 5e9, DisplayName: "Good gift 5 TON"},
		{ID: fatID, Weight: 5, FloorPriceNanoton: 40e9, DisplayName: "Fat gift 40 TON"},
	}
	floors := map[uuid.UUID]int64{cheapID: 1e9, midID: 5e9, fatID: 40e9}

	pool := domain.CasePoolSnapshot{
		Kind:           domain.CasePoolPaid,
		Enabled:        true,
		Balance:        100e9, // house +100 TON
		RecoveryTarget: 0,
		Recovery:       false,
		BiasWeight:     50,
		TargetBalance:  50e9,
	}
	const casePrice = int64(1e9) // 1 TON open
	const minDep = int64(10e9)   // boost from 10 TON deposits
	const strength = 40

	type player struct {
		name     string
		deposits int64
	}
	players := []player{
		{name: "Alice (деп 1 TON)", deposits: 1e9},
		{name: "Bob (деп 10 TON)", deposits: 10e9},
	}

	t.Log("=== WORKFLOW: paid open, bank healthy ===")
	t.Logf("case_price=1 TON | deposit_boost_min=10 TON | strength=+%d%% on >=median | bank_balance=100 TON recovery=false", strength)
	t.Log("loot table (base weights): Trash 80 | Good 15 | Fat 5")

	const opens = 10_000
	for _, p := range players {
		eligible := depositBoostEligible(pool, casePrice, p.deposits, true, minDep, strength)
		loot := biasLootWeights(baseLoot, floors, pool)
		boostStr := 0
		if eligible {
			boostStr = strength
			loot = applyDepositSurplusBoost(loot, floors, boostStr)
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

		t.Logf("--- %s | deposits=%.0f TON | boost_eligible=%v ---", p.name, float64(p.deposits)/1e9, eligible)
		t.Logf("effective weights: Trash=%d Good=%d Fat=%d", wTrash, wGood, wFat)
		t.Logf("12 sample opens: %v", sample)
		t.Logf("over %d opens: Trash=%d (%.1f%%) | Good=%d (%.1f%%) | Fat=%d (%.1f%%)",
			opens,
			hits["Trash gift 1 TON"], 100*float64(hits["Trash gift 1 TON"])/float64(opens),
			hits["Good gift 5 TON"], 100*float64(hits["Good gift 5 TON"])/float64(opens),
			hits["Fat gift 40 TON"], 100*float64(hits["Fat gift 40 TON"])/float64(opens),
		)
	}

	// Sanity: 10 TON player must get more good+fat than 1 TON player on same table.
	aliceLoot := biasLootWeights(baseLoot, floors, pool)
	bobLoot := applyDepositSurplusBoost(biasLootWeights(baseLoot, floors, pool), floors, strength)
	aliceGood, bobGood := 0, 0
	for i := 0; i < opens; i++ {
		a, _, _ := pickWeighted(aliceLoot)
		b, _, _ := pickWeighted(bobLoot)
		if a.ID == midID || a.ID == fatID {
			aliceGood++
		}
		if b.ID == midID || b.ID == fatID {
			bobGood++
		}
	}
	if bobGood <= aliceGood {
		t.Fatalf("expected 10 TON depositor more mid+fat hits: alice=%d bob=%d", aliceGood, bobGood)
	}
	t.Logf("=== COMPARE mid+fat hits over %d opens: 1TON=%d (%.1f%%) vs 10TON=%d (%.1f%%) ===",
		opens, aliceGood, 100*float64(aliceGood)/float64(opens), bobGood, 100*float64(bobGood)/float64(opens))
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
