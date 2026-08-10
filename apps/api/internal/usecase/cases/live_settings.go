package cases

import "github.com/flipo/flipo/apps/api/internal/domain"

func DefaultLiveFeedSettings() domain.CaseLiveFeedSettings {
	return domain.CaseLiveFeedSettings{
		ID:                  1,
		Enabled:             false,
		Intensity:           1,
		FillWhenSparse:      true,
		MinVisible:          6,
		CommonWeight:        50,
		UncommonWeight:      25,
		RareWeight:          15,
		EpicWeight:          7,
		LegendaryWeight:     3,
		CommonMaxNanoton:    500_000_000,   // < 0.5 TON
		UncommonMaxNanoton:  1_500_000_000, // < 1.5 TON
		RareMaxNanoton:      3_000_000_000, // < 3 TON
		EpicMaxNanoton:      5_000_000_000, // < 5 TON; legendary ≥ 5
		FatChance:           0.08,
		FatMinFloorNanoton:  5_000_000_000,
		MaxGiftFloorNanoton: 0,
	}
}

func NormalizeLiveFeedSettings(cfg *domain.CaseLiveFeedSettings) {
	if cfg == nil {
		return
	}
	cfg.ID = 1
	cfg.Intensity = clampFloat(cfg.Intensity, 0.05, 5)
	if cfg.MinVisible < 1 {
		cfg.MinVisible = 1
	}
	if cfg.MinVisible > 6 {
		cfg.MinVisible = 6
	}
	cfg.CommonWeight = clampFloat(cfg.CommonWeight, 0, 1000)
	cfg.UncommonWeight = clampFloat(cfg.UncommonWeight, 0, 1000)
	cfg.RareWeight = clampFloat(cfg.RareWeight, 0, 1000)
	cfg.EpicWeight = clampFloat(cfg.EpicWeight, 0, 1000)
	cfg.LegendaryWeight = clampFloat(cfg.LegendaryWeight, 0, 1000)
	cfg.FatChance = clampFloat(cfg.FatChance, 0, 1)
	if cfg.FatMinFloorNanoton < 0 {
		cfg.FatMinFloorNanoton = 0
	}
	if cfg.MaxGiftFloorNanoton < 0 {
		cfg.MaxGiftFloorNanoton = 0
	}
	if cfg.CommonMaxNanoton < 0 {
		cfg.CommonMaxNanoton = 0
	}
	if cfg.UncommonMaxNanoton < cfg.CommonMaxNanoton {
		cfg.UncommonMaxNanoton = cfg.CommonMaxNanoton
	}
	if cfg.RareMaxNanoton < cfg.UncommonMaxNanoton {
		cfg.RareMaxNanoton = cfg.UncommonMaxNanoton
	}
	if cfg.EpicMaxNanoton < cfg.RareMaxNanoton {
		cfg.EpicMaxNanoton = cfg.RareMaxNanoton
	}
	if cfg.CommonWeight+cfg.UncommonWeight+cfg.RareWeight+cfg.EpicWeight+cfg.LegendaryWeight <= 0 {
		cfg.CommonWeight = 50
		cfg.UncommonWeight = 25
		cfg.RareWeight = 15
		cfg.EpicWeight = 7
		cfg.LegendaryWeight = 3
	}
	if cfg.CommonMaxNanoton == 0 && cfg.UncommonMaxNanoton == 0 && cfg.RareMaxNanoton == 0 && cfg.EpicMaxNanoton == 0 {
		d := DefaultLiveFeedSettings()
		cfg.CommonMaxNanoton = d.CommonMaxNanoton
		cfg.UncommonMaxNanoton = d.UncommonMaxNanoton
		cfg.RareMaxNanoton = d.RareMaxNanoton
		cfg.EpicMaxNanoton = d.EpicMaxNanoton
	}
}

// liveGiftAllowed reports whether a live-feed drop may be shown given the gift price cap.
// TON prizes always pass. MaxGiftFloorNanoton == 0 disables the cap.
func liveGiftAllowed(cfg domain.CaseLiveFeedSettings, prizeType string, valueNanoton int64) bool {
	if cfg.MaxGiftFloorNanoton <= 0 {
		return true
	}
	if domain.NormalizeCasePrizeType(prizeType) == domain.CasePrizeTypeTon {
		return true
	}
	return valueNanoton <= cfg.MaxGiftFloorNanoton
}

func clampFloat(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// rarityFromValue maps prize value (nanoton) into a rarity tier using live-feed intervals.
func rarityFromValue(cfg domain.CaseLiveFeedSettings, valueNanoton int64) string {
	if valueNanoton < 0 {
		valueNanoton = 0
	}
	switch {
	case valueNanoton < cfg.CommonMaxNanoton:
		return "common"
	case valueNanoton < cfg.UncommonMaxNanoton:
		return "uncommon"
	case valueNanoton < cfg.RareMaxNanoton:
		return "rare"
	case valueNanoton < cfg.EpicMaxNanoton:
		return "epic"
	default:
		return "legendary"
	}
}

func rarityWeight(cfg domain.CaseLiveFeedSettings, rarity string) float64 {
	switch rarity {
	case "uncommon":
		return cfg.UncommonWeight
	case "rare":
		return cfg.RareWeight
	case "epic":
		return cfg.EpicWeight
	case "legendary":
		return cfg.LegendaryWeight
	default:
		return cfg.CommonWeight
	}
}
