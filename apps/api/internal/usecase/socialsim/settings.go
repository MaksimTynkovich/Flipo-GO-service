package socialsim

import (
	"encoding/json"
	"math"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/datatypes"
)

var defaultTOD = []float64{
	0.45, 0.40, 0.35, 0.35, 0.40, 0.50,
	0.65, 0.80, 0.90, 0.95, 1.00, 1.00,
	1.05, 1.05, 1.00, 1.00, 1.10, 1.25,
	1.40, 1.45, 1.35, 1.15, 0.85, 0.60,
}

func DefaultSettings() domain.SocialSimSettings {
	tod, _ := json.Marshal(defaultTOD)
	return domain.SocialSimSettings{
		ID:                    1,
		Enabled:               false,
		CrashEnabled:          true,
		RouletteEnabled:       true,
		PvPEnabled:            true,
		LobbyEnabled:          true,
		OnlineBaseMin:         18,
		OnlineBaseMax:         42,
		OnlineJitter:          0.12,
		TODMultipliers:        datatypes.JSON(tod),
		BetIntensity:          8,
		BetBurstChance:        0.35,
		IdleGapMsMin:          400,
		IdleGapMsMax:          2200,
		StakeP50:              0.15,
		StakeP90:              0.55,
		CrashAutoCashoutShare: 0.55,
		CrashCashoutMin:       1.2,
		CrashCashoutMax:       4.5,
		RouletteRedWeight:     0.46,
		RouletteBlackWeight:   0.46,
		RouletteGreenWeight:   0.08,
		PvPMaxGhostRooms:      4,
		PvPRoomTTLSecMin:      25,
		PvPRoomTTLSecMax:      90,
		PvPStakeMinFrac:       0.12,
		PvPStakeMaxFrac:       0.7,
		Chaos:                 0.35,
	}
}

func Normalize(cfg *domain.SocialSimSettings) {
	if cfg.OnlineBaseMin < 0 {
		cfg.OnlineBaseMin = 0
	}
	if cfg.OnlineBaseMax < cfg.OnlineBaseMin {
		cfg.OnlineBaseMax = cfg.OnlineBaseMin
	}
	cfg.OnlineJitter = clamp(cfg.OnlineJitter, 0, 1)
	cfg.BetIntensity = clamp(cfg.BetIntensity, 0, 80)
	cfg.BetBurstChance = clamp(cfg.BetBurstChance, 0, 1)
	if cfg.IdleGapMsMin < 50 {
		cfg.IdleGapMsMin = 50
	}
	if cfg.IdleGapMsMax < cfg.IdleGapMsMin {
		cfg.IdleGapMsMax = cfg.IdleGapMsMin
	}
	cfg.StakeP50 = clamp(cfg.StakeP50, 0.01, 1)
	cfg.StakeP90 = clamp(cfg.StakeP90, cfg.StakeP50, 1)
	cfg.CrashAutoCashoutShare = clamp(cfg.CrashAutoCashoutShare, 0, 1)
	if cfg.CrashCashoutMin < 1.01 {
		cfg.CrashCashoutMin = 1.01
	}
	if cfg.CrashCashoutMax < cfg.CrashCashoutMin {
		cfg.CrashCashoutMax = cfg.CrashCashoutMin
	}
	cfg.Chaos = clamp(cfg.Chaos, 0, 1)
	if cfg.PvPMaxGhostRooms < 0 {
		cfg.PvPMaxGhostRooms = 0
	}
	if cfg.PvPMaxGhostRooms > 20 {
		cfg.PvPMaxGhostRooms = 20
	}
	if cfg.PvPRoomTTLSecMin < 5 {
		cfg.PvPRoomTTLSecMin = 5
	}
	if cfg.PvPRoomTTLSecMax < cfg.PvPRoomTTLSecMin {
		cfg.PvPRoomTTLSecMax = cfg.PvPRoomTTLSecMin
	}
	cfg.PvPStakeMinFrac = clamp(cfg.PvPStakeMinFrac, 0.01, 1)
	cfg.PvPStakeMaxFrac = clamp(cfg.PvPStakeMaxFrac, cfg.PvPStakeMinFrac, 1)

	tod := ParseTOD(cfg.TODMultipliers)
	if len(tod) != 24 {
		tod = append([]float64(nil), defaultTOD...)
	}
	for i := range tod {
		tod[i] = clamp(tod[i], 0, 2)
	}
	raw, _ := json.Marshal(tod)
	cfg.TODMultipliers = datatypes.JSON(raw)

	sum := cfg.RouletteRedWeight + cfg.RouletteBlackWeight + cfg.RouletteGreenWeight
	if sum <= 0 {
		cfg.RouletteRedWeight, cfg.RouletteBlackWeight, cfg.RouletteGreenWeight = 0.46, 0.46, 0.08
	} else {
		cfg.RouletteRedWeight /= sum
		cfg.RouletteBlackWeight /= sum
		cfg.RouletteGreenWeight /= sum
	}
}

func ParseTOD(raw datatypes.JSON) []float64 {
	var tod []float64
	if err := json.Unmarshal(raw, &tod); err != nil || len(tod) != 24 {
		return append([]float64(nil), defaultTOD...)
	}
	return tod
}

func clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}

func TODMultiplier(cfg domain.SocialSimSettings, hour int) float64 {
	tod := ParseTOD(cfg.TODMultipliers)
	if hour < 0 || hour > 23 {
		hour = 0
	}
	return tod[hour]
}
