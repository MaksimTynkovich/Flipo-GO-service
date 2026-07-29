package cases

import (
	"context"
	"math"
	"sort"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

const (
	defaultSimulateIterations = 100
	maxSimulateIterations     = 10_000
)

// CaseSimulateEntryResult — per-loot-row stats from a dry-run Monte Carlo.
type CaseSimulateEntryResult struct {
	LootEntryID         uuid.UUID `json:"loot_entry_id"`
	DisplayName         string    `json:"display_name"`
	CollectionSlug      string    `json:"collection_slug"`
	Weight              int       `json:"weight"`
	ExpectedPctBps      int       `json:"expected_pct_bps"`
	Hits                int       `json:"hits"`
	ActualPctBps        int       `json:"actual_pct_bps"`
	FloorPriceNanoton   int64     `json:"floor_price_nanoton"`
	PrizeSumNanoton     int64     `json:"prize_sum_nanoton"`
}

// CaseSimulateResult — admin dry-run report (no DB writes).
type CaseSimulateResult struct {
	CaseID              uuid.UUID                 `json:"case_id"`
	Slug                string                    `json:"slug"`
	Iterations          int                       `json:"iterations"`
	PriceNanoton        int64                     `json:"price_nanoton"`
	SpentNanoton        int64                     `json:"spent_nanoton"`
	PrizeTotalNanoton   int64                     `json:"prize_total_nanoton"`
	HouseEdgeNanoton    int64                     `json:"house_edge_nanoton"`
	SimulatedRTPBPS     int                       `json:"simulated_rtp_bps"`
	TheoreticalRTPBPS   int                       `json:"theoretical_rtp_bps"`
	TargetRTPBPS        int                       `json:"target_rtp_bps"`
	RTPAvailable        bool                      `json:"rtp_available"`
	WithBank            bool                      `json:"with_bank"`
	FinalBankNanoton    int64                     `json:"final_bank_nanoton,omitempty"`
	EligibleEntryIDs    []uuid.UUID               `json:"eligible_entry_ids,omitempty"`
	Entries             []CaseSimulateEntryResult `json:"entries"`
	Warnings            []string                  `json:"warnings,omitempty"`
}

// AdminSimulateCase runs pickWeighted iterations against saved loot (no opens/inventory).
// When withBank is true, applies current pool gates and tracks a synthetic bank balance.
func (s *Service) AdminSimulateCase(ctx context.Context, caseID uuid.UUID, iterations int, withBank bool) (*CaseSimulateResult, error) {
	if iterations <= 0 {
		iterations = defaultSimulateIterations
	}
	if iterations > maxSimulateIterations {
		iterations = maxSimulateIterations
	}

	c, err := s.cases.FindByID(ctx, caseID)
	if err != nil {
		return nil, err
	}
	loot, err := s.cases.ListLootByCase(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	if len(loot) == 0 {
		return nil, domain.ErrCaseNoLoot
	}

	floors := make(map[uuid.UUID]int64, len(loot))
	var warnings []string
	for _, e := range loot {
		floor := domain.CaseLootPrizeValueNanoton(e)
		if floor <= 0 && domain.NormalizeCasePrizeType(e.PrizeType) != domain.CasePrizeTypeTon {
			floor = s.quoteLootFloor(ctx, e)
		}
		floors[e.ID] = floor
		if floor <= 0 && e.Weight > 0 {
			label := e.DisplayName
			if label == "" {
				label = e.CollectionSlug
			}
			warnings = append(warnings, "нет цены у «"+label+"»")
		}
	}

	if !withBank {
		return runCaseSimulate(*c, loot, floors, iterations, warnings), nil
	}

	settings, err := s.cases.GetCatalogSettings(ctx)
	if err != nil {
		return nil, err
	}
	poolKind := domain.CasePoolForKind(c.Kind)
	pool := settings.PoolSnapshot(poolKind)
	if !pool.Enabled {
		warnings = append(warnings, "пул экономики выключен — симуляция без банка")
		return runCaseSimulate(*c, loot, floors, iterations, warnings), nil
	}

	return runCaseSimulateWithBank(*c, loot, floors, iterations, pool, warnings, s.stockChecker(ctx)), nil
}

func runCaseSimulateWithBank(
	c domain.Case,
	loot []domain.CaseLootEntry,
	floors map[uuid.UUID]int64,
	iterations int,
	pool domain.CasePoolSnapshot,
	warnings []string,
	stockOK func(domain.CaseLootEntry) bool,
) *CaseSimulateResult {
	hits := make(map[uuid.UUID]int, len(loot))
	prizeSums := make(map[uuid.UUID]int64, len(loot))
	var prizeTotal int64
	price := c.PriceNanoton
	balance := pool.Balance
	pace := pool.RecoveryPaceCounter
	recovery := pool.Recovery
	eligibleSet := map[uuid.UUID]struct{}{}

	drainOpens := pool.RecoveryDrainOpens
	reliefOpens := pool.RecoveryReliefOpens
	if drainOpens < 1 {
		drainOpens = 1
	}
	if reliefOpens < 1 {
		reliefOpens = 1
	}
	cycle := drainOpens + reliefOpens

	for i := 0; i < iterations; i++ {
		snap := pool
		snap.Balance = balance
		if price > 0 {
			snap.Balance += price
		}
		// Recompute recovery-ish flag for daily/promo from balance.
		if snap.Kind != domain.CasePoolPaid {
			snap.Recovery = snap.Balance <= 0
		} else {
			// Synthetic hysteresis for paid bank (mirrors SyncCaseBankHysteresis).
			if recovery {
				if snap.Balance >= snap.RecoveryTarget {
					recovery = false
					pace = 0
				}
			} else if snap.Balance <= snap.LossThreshold {
				recovery = true
			}
			snap.Recovery = recovery
			if snap.Recovery && snap.RecoverySmooth {
				snap.RecoveryPaceCounter = pace
				snap.RecoveryPhase = domain.CaseRecoveryPhase(drainOpens, reliefOpens, pace)
				snap.RecoveryProgress = domain.CaseRecoveryProgress(snap.Balance, snap.LossThreshold, snap.RecoveryTarget)
			} else {
				snap.RecoveryPhase = ""
				snap.RecoveryProgress = 0
			}
		}
		filtered := filterLootForPool(loot, floors, snap, price, stockOK)
		biased := biasLootWeights(filtered, floors, snap)
		for _, e := range filtered {
			eligibleSet[e.ID] = struct{}{}
		}
		entry, _, err := pickWeighted(biased)
		if err != nil {
			break
		}
		hits[entry.ID]++
		floor := floors[entry.ID]
		prizeSums[entry.ID] += floor
		prizeTotal += floor
		balance = snap.Balance - floor

		// Advance drain/relief pace after a successful paid open while still in recovery.
		if snap.Kind == domain.CasePoolPaid && recovery && snap.RecoverySmooth && cycle > 0 {
			if balance >= snap.RecoveryTarget {
				recovery = false
				pace = 0
			} else {
				pace = (pace + 1) % cycle
			}
		}
	}

	spent := int64(iterations) * price
	rtpAvailable := price > 0
	var simulatedRTPBPS int
	if rtpAvailable && spent > 0 {
		simulatedRTPBPS = int(math.Round(float64(prizeTotal) / float64(spent) * 10_000))
	}

	eligibleIDs := make([]uuid.UUID, 0, len(eligibleSet))
	for id := range eligibleSet {
		eligibleIDs = append(eligibleIDs, id)
	}

	base := runCaseSimulate(c, loot, floors, 0, warnings)
	base.Iterations = iterations
	base.SpentNanoton = spent
	base.PrizeTotalNanoton = prizeTotal
	base.HouseEdgeNanoton = spent - prizeTotal
	base.SimulatedRTPBPS = simulatedRTPBPS
	base.WithBank = true
	base.FinalBankNanoton = balance
	base.EligibleEntryIDs = eligibleIDs
	base.RTPAvailable = rtpAvailable

	for i := range base.Entries {
		id := base.Entries[i].LootEntryID
		h := hits[id]
		base.Entries[i].Hits = h
		base.Entries[i].PrizeSumNanoton = prizeSums[id]
		if iterations > 0 {
			base.Entries[i].ActualPctBps = int(math.Round(float64(h) / float64(iterations) * 10_000))
		}
	}
	sort.SliceStable(base.Entries, func(i, j int) bool {
		if base.Entries[i].Hits != base.Entries[j].Hits {
			return base.Entries[i].Hits > base.Entries[j].Hits
		}
		return base.Entries[i].DisplayName < base.Entries[j].DisplayName
	})
	return base
}

func runCaseSimulate(
	c domain.Case,
	loot []domain.CaseLootEntry,
	floors map[uuid.UUID]int64,
	iterations int,
	warnings []string,
) *CaseSimulateResult {
	weightTotal := 0
	for _, e := range loot {
		if e.Weight > 0 {
			weightTotal += e.Weight
		}
	}

	hits := make(map[uuid.UUID]int, len(loot))
	prizeSums := make(map[uuid.UUID]int64, len(loot))
	var prizeTotal int64

	if weightTotal > 0 {
		for i := 0; i < iterations; i++ {
			entry, _, err := pickWeighted(loot)
			if err != nil {
				break
			}
			hits[entry.ID]++
			floor := floors[entry.ID]
			prizeSums[entry.ID] += floor
			prizeTotal += floor
		}
	}

	price := c.PriceNanoton
	spent := int64(iterations) * price
	rtpAvailable := price > 0

	var theoEV float64
	if weightTotal > 0 {
		for _, e := range loot {
			if e.Weight <= 0 {
				continue
			}
			theoEV += float64(floors[e.ID]) * float64(e.Weight) / float64(weightTotal)
		}
	}

	var simulatedRTPBPS, theoreticalRTPBPS int
	if rtpAvailable {
		if spent > 0 {
			simulatedRTPBPS = int(math.Round(float64(prizeTotal) / float64(spent) * 10_000))
		}
		theoreticalRTPBPS = int(math.Round(theoEV / float64(price) * 10_000))
	}

	entries := make([]CaseSimulateEntryResult, 0, len(loot))
	for _, e := range loot {
		expectedBps := 0
		if weightTotal > 0 && e.Weight > 0 {
			expectedBps = int(math.Round(float64(e.Weight) / float64(weightTotal) * 10_000))
		}
		h := hits[e.ID]
		actualBps := 0
		if iterations > 0 {
			actualBps = int(math.Round(float64(h) / float64(iterations) * 10_000))
		}
		name := e.DisplayName
		if name == "" {
			name = e.CollectionSlug
		}
		entries = append(entries, CaseSimulateEntryResult{
			LootEntryID:       e.ID,
			DisplayName:       name,
			CollectionSlug:    e.CollectionSlug,
			Weight:            e.Weight,
			ExpectedPctBps:    expectedBps,
			Hits:              h,
			ActualPctBps:      actualBps,
			FloorPriceNanoton: floors[e.ID],
			PrizeSumNanoton:   prizeSums[e.ID],
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Hits != entries[j].Hits {
			return entries[i].Hits > entries[j].Hits
		}
		return entries[i].DisplayName < entries[j].DisplayName
	})

	return &CaseSimulateResult{
		CaseID:            c.ID,
		Slug:              c.Slug,
		Iterations:        iterations,
		PriceNanoton:      price,
		SpentNanoton:      spent,
		PrizeTotalNanoton: prizeTotal,
		HouseEdgeNanoton:  spent - prizeTotal,
		SimulatedRTPBPS:   simulatedRTPBPS,
		TheoreticalRTPBPS: theoreticalRTPBPS,
		TargetRTPBPS:      c.TargetRTPBPS,
		RTPAvailable:      rtpAvailable,
		Entries:           entries,
		Warnings:          warnings,
	}
}
