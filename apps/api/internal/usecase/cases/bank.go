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
	return []domain.CaseLootEntry{cheapestLoot(loot, floors)}
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
		case surplus:
			if price >= median && price > 0 {
				w = w * (100 + strength/2) / 100
			}
		}
		out[i].Weight = w
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
	return biasLootWeights(filtered, floors, pool), floors
}
