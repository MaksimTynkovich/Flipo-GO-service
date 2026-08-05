package cases

import (
	"context"
	"sort"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

// lootPrice resolves EV for bank gates (caller may pre-fill floors map).
func lootPrice(e domain.CaseLootEntry, floors map[uuid.UUID]int64) int64 {
	if floors != nil {
		if v, ok := floors[e.ID]; ok {
			return v
		}
	}
	return domain.CaseLootPrizeValueNanoton(e)
}

// recoveryMaxPrizeNanoton returns the smooth-recovery prize ceiling for this open.
func recoveryMaxPrizeNanoton(pool domain.CasePoolSnapshot, loot []domain.CaseLootEntry, floors map[uuid.UUID]int64) int64 {
	if !pool.Recovery || !pool.RecoverySmooth {
		return pool.MaxPrizeNanoton()
	}
	phase := pool.RecoveryPhase
	if phase == "" {
		phase = domain.CaseRecoveryPhase(pool.RecoveryDrainOpens, pool.RecoveryReliefOpens, pool.RecoveryPaceCounter)
	}
	cheap := cheapestLoot(loot, floors)
	cheapPrice := lootPrice(cheap, floors)
	if cheapPrice < 0 {
		cheapPrice = 0
	}

	if phase == domain.CaseRecoveryPhaseDrain {
		// Allow the cheap half of the table (below median) so drain isn't a single-item lock.
		median := medianLootPrice(loot, floors)
		if median > cheapPrice {
			return median - 1
		}
		if cheapPrice <= 0 {
			return 0
		}
		return cheapPrice
	}

	// Relief: scale bank % by recovery progress so early relief stays modest.
	bal := pool.Balance
	if bal < 0 {
		bal = 0
	}
	reliefBps := pool.RecoveryReliefMaxPrizeBps
	if reliefBps <= 0 {
		reliefBps = pool.MaxPrizeBps
	}
	if pool.MaxPrizeBps > 0 && reliefBps > pool.MaxPrizeBps {
		reliefBps = pool.MaxPrizeBps
	}
	ceiling := bal * int64(reliefBps) / 10000
	progress := pool.RecoveryProgress
	if progress <= 0 {
		progress = 0.15 // floor so relief is never zero when bank has funds
	}
	ceiling = int64(float64(ceiling) * (0.35 + 0.65*progress))
	if ceiling < cheapPrice {
		ceiling = cheapPrice
	}
	// Also never exceed standard max-prize gate when bank is positive.
	if hard := pool.MaxPrizeNanoton(); hard > 0 && ceiling > hard {
		ceiling = hard
	}
	return ceiling
}

// filterLootForPool applies hard ceiling, fat-pause, and optional stock gate.
// stockOK may be nil (treat as skip stock checks).
func filterLootForPool(
	loot []domain.CaseLootEntry,
	floors map[uuid.UUID]int64,
	pool domain.CasePoolSnapshot,
	casePrice int64,
	stockOK func(e domain.CaseLootEntry) bool,
) []domain.CaseLootEntry {
	if !pool.Enabled || len(loot) == 0 {
		return loot
	}

	maxPrize := pool.MaxPrizeNanoton()
	smooth := pool.Recovery && pool.RecoverySmooth && pool.Kind == domain.CasePoolPaid
	if smooth {
		maxPrize = recoveryMaxPrizeNanoton(pool, loot, floors)
	}
	median := medianLootPrice(loot, floors)

	out := make([]domain.CaseLootEntry, 0, len(loot))
	for _, e := range loot {
		if e.Weight <= 0 {
			continue
		}
		price := lootPrice(e, floors)
		if maxPrize > 0 && price > maxPrize {
			continue
		}
		if maxPrize == 0 && price > 0 {
			// Empty / underwater pool: only zero-value rows; else cheapest fallback.
			continue
		}
		if pool.FatPaused && median > 0 && price > median {
			continue
		}
		if domain.NormalizeCasePrizeType(e.PrizeType) == domain.CasePrizeTypeGift && stockOK != nil {
			stockThreshold := casePrice
			if half := maxPrize / 2; half > stockThreshold {
				stockThreshold = half
			}
			if stockThreshold < 1_000_000_000 { // 1 TON
				stockThreshold = 1_000_000_000
			}
			if price >= stockThreshold && !stockOK(e) {
				continue
			}
		}
		out = append(out, e)
	}
	if len(out) > 0 {
		return out
	}
	if smooth {
		return bottomTierLoot(loot, floors, maxPrize, 3)
	}
	return []domain.CaseLootEntry{cheapestLoot(loot, floors)}
}

// bottomTierLoot keeps up to `tiers` cheapest positive-weight entries (by price).
func bottomTierLoot(loot []domain.CaseLootEntry, floors map[uuid.UUID]int64, maxPrize int64, tiers int) []domain.CaseLootEntry {
	if tiers < 1 {
		tiers = 1
	}
	type scored struct {
		e     domain.CaseLootEntry
		price int64
	}
	cands := make([]scored, 0, len(loot))
	for _, e := range loot {
		if e.Weight <= 0 {
			continue
		}
		p := lootPrice(e, floors)
		if maxPrize > 0 && p > maxPrize {
			continue
		}
		cands = append(cands, scored{e: e, price: p})
	}
	if len(cands) == 0 {
		c := cheapestLoot(loot, floors)
		return []domain.CaseLootEntry{c}
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].price != cands[j].price {
			return cands[i].price < cands[j].price
		}
		return cands[i].e.Weight > cands[j].e.Weight
	})
	if len(cands) > tiers {
		cands = cands[:tiers]
	}
	out := make([]domain.CaseLootEntry, 0, len(cands))
	for _, c := range cands {
		e := c.e
		if e.Weight <= 0 {
			e.Weight = 1
		}
		out = append(out, e)
	}
	return out
}

func medianLootPrice(loot []domain.CaseLootEntry, floors map[uuid.UUID]int64) int64 {
	prices := make([]int64, 0, len(loot))
	for _, e := range loot {
		if e.Weight <= 0 {
			continue
		}
		prices = append(prices, lootPrice(e, floors))
	}
	if len(prices) == 0 {
		return 0
	}
	sort.Slice(prices, func(i, j int) bool { return prices[i] < prices[j] })
	mid := len(prices) / 2
	if len(prices)%2 == 0 {
		return (prices[mid-1] + prices[mid]) / 2
	}
	return prices[mid]
}

func cheapestLoot(loot []domain.CaseLootEntry, floors map[uuid.UUID]int64) domain.CaseLootEntry {
	best := loot[0]
	bestPrice := lootPrice(best, floors)
	for _, e := range loot[1:] {
		p := lootPrice(e, floors)
		if p < bestPrice || (p == bestPrice && e.Weight > best.Weight) {
			best = e
			bestPrice = p
		}
	}
	if best.Weight <= 0 {
		best.Weight = 1
	}
	return best
}

// biasLootWeights soft-adjusts weights from pool recovery / surplus.
func biasLootWeights(loot []domain.CaseLootEntry, floors map[uuid.UUID]int64, pool domain.CasePoolSnapshot) []domain.CaseLootEntry {
	if !pool.Enabled || pool.BiasWeight <= 0 || len(loot) == 0 {
		return loot
	}
	median := medianLootPrice(loot, floors)
	if median <= 0 {
		return loot
	}

	out := make([]domain.CaseLootEntry, len(loot))
	copy(out, loot)

	strength := pool.BiasWeight
	surplus := pool.TargetBalance > 0 && pool.Balance >= pool.TargetBalance && !pool.Recovery
	smooth := pool.Recovery && pool.RecoverySmooth && pool.Kind == domain.CasePoolPaid
	phase := pool.RecoveryPhase
	if phase == "" && smooth {
		phase = domain.CaseRecoveryPhase(pool.RecoveryDrainOpens, pool.RecoveryReliefOpens, pool.RecoveryPaceCounter)
	}

	for i := range out {
		price := lootPrice(out[i], floors)
		w := out[i].Weight
		if w <= 0 {
			continue
		}
		switch {
		case pool.Recovery:
			if price >= median && price > 0 {
				w = w * (100 - strength) / 100
				if w < 1 {
					w = 1
				}
			} else {
				w = w * (100 + strength) / 100
			}
			if smooth && phase == domain.CaseRecoveryPhaseDrain && price >= median && price > 0 {
				// Extra cut on fat during drain so mid-tier rarely slips through bottomTier.
				w = w * (100 - strength/2) / 100
				if w < 1 {
					w = 1
				}
			}
			if smooth && phase == domain.CaseRecoveryPhaseRelief && price > 0 && price < median {
				// Mild mid-tier lift in relief (still below median).
				w = w * (100 + strength/4) / 100
			}
		case surplus:
			if price >= median && price > 0 {
				w = w * (100 + strength/2) / 100
			}
		}
		out[i].Weight = w
	}
	return out
}

type depositBoostDecision struct {
	Eligible           bool
	TierLabel          string
	BaseStrength       int
	EffectiveStrength  int
	SurplusScaleBps    int
	ReserveTarget      int64
	AllocatableSurplus int64
}

type depositBoostTier struct {
	Label       string
	MinDeposits int64
	Strength    int
}

func depositBoostTiers(settings *domain.CaseCatalogSettings) []depositBoostTier {
	if settings == nil {
		return nil
	}
	tiers := []depositBoostTier{
		{Label: "1 TON", MinDeposits: settings.DepositBoostTier1MinNanoton, Strength: settings.DepositBoostTier1BiasWeight},
		{Label: "2 TON", MinDeposits: settings.DepositBoostTier2MinNanoton, Strength: settings.DepositBoostTier2BiasWeight},
		{Label: "5 TON", MinDeposits: settings.DepositBoostTier3MinNanoton, Strength: settings.DepositBoostTier3BiasWeight},
		{Label: "10 TON", MinDeposits: settings.DepositBoostTier4MinNanoton, Strength: settings.DepositBoostTier4BiasWeight},
	}
	legacyConfigured := settings.DepositBoostMinNanoton > 0 || settings.DepositBoostBiasWeight > 0
	adaptiveConfigured := settings.DepositBoostTier2MinNanoton > 0 ||
		settings.DepositBoostTier3MinNanoton > 0 ||
		settings.DepositBoostTier4MinNanoton > 0 ||
		settings.DepositBoostTier2BiasWeight > 0 ||
		settings.DepositBoostTier3BiasWeight > 0 ||
		settings.DepositBoostTier4BiasWeight > 0
	if !adaptiveConfigured && legacyConfigured {
		return []depositBoostTier{{Label: "legacy", MinDeposits: settings.DepositBoostMinNanoton, Strength: settings.DepositBoostBiasWeight}}
	}
	return tiers
}

func resolveDepositBoost(settings *domain.CaseCatalogSettings, pool domain.CasePoolSnapshot, casePrice, deposits int64) depositBoostDecision {
	decision := depositBoostDecision{}
	if settings == nil || !settings.DepositBoostEnabled || casePrice <= 0 || deposits <= 0 {
		return decision
	}
	if pool.Kind != domain.CasePoolPaid || !pool.Enabled || pool.Recovery {
		return decision
	}

	var matched *depositBoostTier
	for _, tier := range depositBoostTiers(settings) {
		if tier.Strength <= 0 || deposits < tier.MinDeposits {
			continue
		}
		t := tier
		matched = &t
	}
	if matched == nil {
		return decision
	}

	reserveTarget := settings.BankTargetNanoton
	if reserveTarget < 0 {
		reserveTarget = 0
	}
	if pool.Balance < reserveTarget {
		return decision
	}
	ramp := settings.DepositBoostRampNanoton
	if ramp < 0 {
		ramp = 0
	}
	shareBps := settings.DepositBoostSurplusShareBps
	if shareBps < 0 {
		shareBps = 0
	}
	if shareBps > 10000 {
		shareBps = 10000
	}
	surplus := pool.Balance - reserveTarget
	if surplus < 0 {
		surplus = 0
	}
	allocatable := surplus * int64(shareBps) / 10000
	scaleBps := 10000
	if ramp > 0 {
		scaleBps = int(allocatable * 10000 / ramp)
		if scaleBps > 10000 {
			scaleBps = 10000
		}
	}
	effective := matched.Strength * scaleBps / 10000
	if effective <= 0 {
		return decision
	}
	decision.Eligible = true
	decision.TierLabel = matched.Label
	decision.BaseStrength = matched.Strength
	decision.EffectiveStrength = effective
	decision.SurplusScaleBps = scaleBps
	decision.ReserveTarget = reserveTarget
	decision.AllocatableSurplus = allocatable
	return decision
}

// applyDepositSurplusBoost raises weights for above-median prizes for deposit tiers.
func applyDepositSurplusBoost(loot []domain.CaseLootEntry, floors map[uuid.UUID]int64, strength int) []domain.CaseLootEntry {
	if strength <= 0 || len(loot) == 0 {
		return loot
	}
	median := medianLootPrice(loot, floors)
	if median <= 0 {
		return loot
	}
	out := make([]domain.CaseLootEntry, len(loot))
	copy(out, loot)
	for i := range out {
		price := lootPrice(out[i], floors)
		if price < median || price <= 0 {
			continue
		}
		w := out[i].Weight
		if w <= 0 {
			continue
		}
		out[i].Weight = w * (100 + strength) / 100
	}
	return out
}

func (s *Service) stockChecker(ctx context.Context) func(domain.CaseLootEntry) bool {
	var botID uuid.UUID
	var resolved bool
	cache := map[string]bool{}
	return func(e domain.CaseLootEntry) bool {
		if s.bot == nil || s.inventory == nil {
			return false
		}
		if !resolved {
			resolved = true
			if botUser, err := s.bot.EnsureBotUser(ctx); err == nil && botUser != nil {
				botID = botUser.ID
			}
		}
		if botID == uuid.Nil {
			return false
		}
		key := e.CollectionSlug + "\x00" + e.ModelName + "\x00" + domain.NormalizeCaseLootBackdrop(e.Backdrop)
		if v, ok := cache[key]; ok {
			return v
		}
		ok, err := s.inventory.HasHouseGift(ctx, botID, e.CollectionSlug, strings.TrimSpace(e.ModelName), domain.NormalizeCaseLootBackdrop(e.Backdrop))
		if err != nil {
			cache[key] = false
			return false
		}
		cache[key] = ok
		return ok
	}
}

// prepareLootForOpen builds bank-aware effective loot for rolling.
func (s *Service) prepareLootForOpen(
	ctx context.Context,
	loot []domain.CaseLootEntry,
	pool domain.CasePoolSnapshot,
	casePrice int64,
	boost depositBoostDecision,
) ([]domain.CaseLootEntry, map[uuid.UUID]int64) {
	floors := make(map[uuid.UUID]int64, len(loot))
	for _, e := range loot {
		floor := domain.CaseLootPrizeValueNanoton(e)
		if floor <= 0 && domain.NormalizeCasePrizeType(e.PrizeType) != domain.CasePrizeTypeTon {
			floor = s.quoteLootFloor(ctx, e)
		}
		floors[e.ID] = floor
	}
	var stockFn func(domain.CaseLootEntry) bool
	if pool.Enabled {
		stockFn = s.stockChecker(ctx)
	}
	filtered := filterLootForPool(loot, floors, pool, casePrice, stockFn)
	biased := biasLootWeights(filtered, floors, pool)
	if boost.EffectiveStrength > 0 {
		biased = applyDepositSurplusBoost(biased, floors, boost.EffectiveStrength)
	}
	return biased, floors
}
