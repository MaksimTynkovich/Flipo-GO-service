package cases

import (
	"context"
	"math"
	"sort"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

const (
	defaultPlayerSampleLimit = 40
	maxPlayerSampleLimit     = 200
)

// CasePlayerSimulateOpen — one synthetic open in the player timeline.
type CasePlayerSimulateOpen struct {
	Index        int       `json:"index"`
	LootEntryID  uuid.UUID `json:"loot_entry_id"`
	DisplayName  string    `json:"display_name"`
	PrizeNanoton int64     `json:"prize_nanoton"`
	BoostApplied bool      `json:"boost_applied"`
	BoostTier    string    `json:"boost_tier,omitempty"`
	BoostStrength int      `json:"boost_strength,omitempty"`
	BankBefore   int64     `json:"bank_before_nanoton"`
	BankAfter    int64     `json:"bank_after_nanoton"`
	Recovery     bool      `json:"recovery"`
	PriceNanoton int64     `json:"price_nanoton"`
}

// CasePlayerSimulateResult — dry-run of a depositor opening a case repeatedly.
type CasePlayerSimulateResult struct {
	CaseID            uuid.UUID                 `json:"case_id"`
	Slug              string                    `json:"slug"`
	Title             string                    `json:"title"`
	Kind              string                    `json:"kind"`
	Iterations        int                       `json:"iterations"`
	PriceNanoton      int64                     `json:"price_nanoton"`
	DepositsNanoton   int64                     `json:"deposits_nanoton"`
	BoostEligible     bool                      `json:"boost_eligible"`
	BoostTier         string                    `json:"boost_tier,omitempty"`
	BoostStrength     int                       `json:"boost_strength"`
	BoostScaleBps     int                       `json:"boost_scale_bps"`
	BoostAppliedOpens int                       `json:"boost_applied_opens"`
	SpentNanoton      int64                     `json:"spent_nanoton"`
	PrizeTotalNanoton int64                     `json:"prize_total_nanoton"`
	HouseEdgeNanoton  int64                     `json:"house_edge_nanoton"`
	SimulatedRTPBPS   int                       `json:"simulated_rtp_bps"`
	TheoreticalRTPBPS int                       `json:"theoretical_rtp_bps"`
	TargetRTPBPS      int                       `json:"target_rtp_bps"`
	RTPAvailable      bool                      `json:"rtp_available"`
	WithBank          bool                      `json:"with_bank"`
	BankStartNanoton  int64                     `json:"bank_start_nanoton"`
	BankMinNanoton    int64                     `json:"bank_min_nanoton"`
	BankMaxNanoton    int64                     `json:"bank_max_nanoton"`
	BankEndNanoton    int64                     `json:"bank_end_nanoton"`
	RecoveryOpens     int                       `json:"recovery_opens"`
	Entries           []CaseSimulateEntryResult `json:"entries"`
	SampleOpens       []CasePlayerSimulateOpen  `json:"sample_opens"`
	Warnings          []string                  `json:"warnings,omitempty"`
}

// CasePlayerSimulateBatchResult — player sim for many cases.
type CasePlayerSimulateBatchResult struct {
	DepositsNanoton int64                      `json:"deposits_nanoton"`
	Iterations      int                        `json:"iterations"`
	Cases           []CasePlayerSimulateResult `json:"cases"`
}

// AdminPlayerSimulateCase imitates a user with given total deposits opening a case N times.
// No DB writes — bank/deposit boost are applied in memory like production Open().
func (s *Service) AdminPlayerSimulateCase(
	ctx context.Context,
	caseID uuid.UUID,
	iterations int,
	depositsNanoton int64,
	sampleLimit int,
	withBank bool,
) (*CasePlayerSimulateResult, error) {
	if iterations <= 0 {
		iterations = defaultSimulateIterations
	}
	if iterations > maxSimulateIterations {
		iterations = maxSimulateIterations
	}
	if sampleLimit <= 0 {
		sampleLimit = defaultPlayerSampleLimit
	}
	if sampleLimit > maxPlayerSampleLimit {
		sampleLimit = maxPlayerSampleLimit
	}
	if depositsNanoton < 0 {
		depositsNanoton = 0
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

	settings, err := s.cases.GetCatalogSettings(ctx)
	if err != nil {
		return nil, err
	}
	domain.NormalizeDepositBoost(settings)

	poolKind := domain.CasePoolForKind(c.Kind)
	pool := settings.PoolSnapshot(poolKind)
	useBank := withBank && pool.Enabled
	if withBank && !pool.Enabled {
		warnings = append(warnings, "пул экономики выключен — симуляция без банка")
	}

	var stockOK func(domain.CaseLootEntry) bool
	if useBank {
		stockOK = s.stockChecker(ctx)
	}

	return runCasePlayerSimulate(*c, loot, floors, iterations, sampleLimit, depositsNanoton, settings, useBank, pool, warnings, stockOK), nil
}

// AdminPlayerSimulateAll runs player sim for every active paid catalog/featured case.
func (s *Service) AdminPlayerSimulateAll(
	ctx context.Context,
	iterations int,
	depositsNanoton int64,
	sampleLimit int,
	withBank bool,
) (*CasePlayerSimulateBatchResult, error) {
	if iterations <= 0 {
		iterations = defaultSimulateIterations
	}
	if iterations > maxSimulateIterations {
		iterations = maxSimulateIterations
	}
	list, err := s.cases.ListActive(ctx)
	if err != nil {
		return nil, err
	}
	out := &CasePlayerSimulateBatchResult{
		DepositsNanoton: depositsNanoton,
		Iterations:      iterations,
		Cases:           make([]CasePlayerSimulateResult, 0, len(list)),
	}
	for _, c := range list {
		if c.Kind == domain.CaseKindDaily || c.Kind == domain.CaseKindPromo {
			continue
		}
		if c.PriceNanoton <= 0 {
			continue
		}
		res, err := s.AdminPlayerSimulateCase(ctx, c.ID, iterations, depositsNanoton, sampleLimit, withBank)
		if err != nil {
			continue
		}
		out.Cases = append(out.Cases, *res)
	}
	sort.SliceStable(out.Cases, func(i, j int) bool {
		return out.Cases[i].SimulatedRTPBPS > out.Cases[j].SimulatedRTPBPS
	})
	return out, nil
}

func runCasePlayerSimulate(
	c domain.Case,
	loot []domain.CaseLootEntry,
	floors map[uuid.UUID]int64,
	iterations, sampleLimit int,
	depositsNanoton int64,
	settings *domain.CaseCatalogSettings,
	withBank bool,
	pool domain.CasePoolSnapshot,
	warnings []string,
	stockOK func(domain.CaseLootEntry) bool,
) *CasePlayerSimulateResult {
	price := c.PriceNanoton
	base := runCaseSimulate(c, loot, floors, 0, warnings)

	hits := make(map[uuid.UUID]int, len(loot))
	prizeSums := make(map[uuid.UUID]int64, len(loot))
	var prizeTotal int64
	boostAppliedOpens := 0
	recoveryOpens := 0
	sample := make([]CasePlayerSimulateOpen, 0, sampleLimit)

	balance := pool.Balance
	bankStart := balance
	bankMin := balance
	bankMax := balance
	pace := pool.RecoveryPaceCounter
	recovery := pool.Recovery

	drainOpens := pool.RecoveryDrainOpens
	reliefOpens := pool.RecoveryReliefOpens
	if drainOpens < 1 {
		drainOpens = 1
	}
	if reliefOpens < 1 {
		reliefOpens = 1
	}
	cycle := drainOpens + reliefOpens

	previewBoost := resolveDepositBoost(settings, pool, price, depositsNanoton)

	for i := 0; i < iterations; i++ {
		bankBefore := balance
		snap := pool
		if withBank {
			snap.Balance = balance
			if price > 0 {
				snap.Balance += price
			}
			if snap.Kind != domain.CasePoolPaid {
				snap.Recovery = snap.Balance <= 0
			} else {
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
		} else {
			snap = domain.CasePoolSnapshot{Kind: pool.Kind, Enabled: false}
		}

		var filtered []domain.CaseLootEntry
		if withBank {
			filtered = filterLootForPool(loot, floors, snap, price, stockOK)
		} else {
			filtered = loot
		}
		biased := biasLootWeights(filtered, floors, snap)

		boostNow := resolveDepositBoost(settings, snap, price, depositsNanoton)
		if boostNow.EffectiveStrength > 0 {
			biased = applyDepositSurplusBoost(biased, floors, boostNow.EffectiveStrength)
			boostAppliedOpens++
		}
		if snap.Recovery {
			recoveryOpens++
		}

		entry, _, err := pickWeighted(biased)
		if err != nil {
			break
		}
		floor := floors[entry.ID]
		hits[entry.ID]++
		prizeSums[entry.ID] += floor
		prizeTotal += floor

		bankAfter := bankBefore
		if withBank {
			bankAfter = snap.Balance - floor
			balance = bankAfter
			if balance < bankMin {
				bankMin = balance
			}
			if balance > bankMax {
				bankMax = balance
			}
			if snap.Kind == domain.CasePoolPaid && recovery && snap.RecoverySmooth && cycle > 0 {
				if balance >= snap.RecoveryTarget {
					recovery = false
					pace = 0
				} else {
					pace = (pace + 1) % cycle
				}
			}
		}

		if len(sample) < sampleLimit {
			name := entry.DisplayName
			if name == "" {
				name = entry.CollectionSlug
			}
			sample = append(sample, CasePlayerSimulateOpen{
				Index:        i + 1,
				LootEntryID:  entry.ID,
				DisplayName:  name,
				PrizeNanoton: floor,
				BoostApplied: boostNow.EffectiveStrength > 0,
				BoostTier:    boostNow.TierLabel,
				BoostStrength: boostNow.EffectiveStrength,
				BankBefore:   bankBefore,
				BankAfter:    bankAfter,
				Recovery:     snap.Recovery,
				PriceNanoton: price,
			})
		}
	}

	spent := int64(iterations) * price
	rtpAvailable := price > 0
	var simulatedRTPBPS int
	if rtpAvailable && spent > 0 {
		simulatedRTPBPS = int(math.Round(float64(prizeTotal) / float64(spent) * 10_000))
	}

	entries := make([]CaseSimulateEntryResult, len(base.Entries))
	copy(entries, base.Entries)
	for i := range entries {
		id := entries[i].LootEntryID
		h := hits[id]
		entries[i].Hits = h
		entries[i].PrizeSumNanoton = prizeSums[id]
		if iterations > 0 {
			entries[i].ActualPctBps = int(math.Round(float64(h) / float64(iterations) * 10_000))
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Hits != entries[j].Hits {
			return entries[i].Hits > entries[j].Hits
		}
		return entries[i].DisplayName < entries[j].DisplayName
	})

	return &CasePlayerSimulateResult{
		CaseID:            c.ID,
		Slug:              c.Slug,
		Title:             c.Title,
		Kind:              c.Kind,
		Iterations:        iterations,
		PriceNanoton:      price,
		DepositsNanoton:   depositsNanoton,
		BoostEligible:     previewBoost.Eligible,
		BoostTier:         previewBoost.TierLabel,
		BoostStrength:     previewBoost.EffectiveStrength,
		BoostScaleBps:     previewBoost.SurplusScaleBps,
		BoostAppliedOpens: boostAppliedOpens,
		SpentNanoton:      spent,
		PrizeTotalNanoton: prizeTotal,
		HouseEdgeNanoton:  spent - prizeTotal,
		SimulatedRTPBPS:   simulatedRTPBPS,
		TheoreticalRTPBPS: base.TheoreticalRTPBPS,
		TargetRTPBPS:      c.TargetRTPBPS,
		RTPAvailable:      rtpAvailable,
		WithBank:          withBank,
		BankStartNanoton:  bankStart,
		BankMinNanoton:    bankMin,
		BankMaxNanoton:    bankMax,
		BankEndNanoton:    balance,
		RecoveryOpens:     recoveryOpens,
		Entries:           entries,
		SampleOpens:       sample,
		Warnings:          warnings,
	}
}
