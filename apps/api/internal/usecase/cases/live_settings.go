package cases

import "github.com/flipo/flipo/apps/api/internal/domain"

func DefaultLiveFeedSettings() domain.CaseLiveFeedSettings {
	return domain.CaseLiveFeedSettings{
		ID:                 1,
		Enabled:            false,
		Intensity:          1,
		FillWhenSparse:     true,
		MinVisible:         6,
		CommonWeight:       50,
		UncommonWeight:     25,
		RareWeight:         15,
		EpicWeight:         7,
		LegendaryWeight:    3,
		FatChance:          0.08,
		FatMinFloorNanoton: 5_000_000_000,
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
	if cfg.CommonWeight+cfg.UncommonWeight+cfg.RareWeight+cfg.EpicWeight+cfg.LegendaryWeight <= 0 {
		cfg.CommonWeight = 50
		cfg.UncommonWeight = 25
		cfg.RareWeight = 15
		cfg.EpicWeight = 7
		cfg.LegendaryWeight = 3
	}
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
