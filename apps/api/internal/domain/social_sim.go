package domain

import (
	"time"

	"gorm.io/datatypes"
)

// SocialSimSettings — singleton (id=1) knobs for visual online/bet overlay.
// Ghost activity never writes game_bets / PvP rows or touches balances/GGR.
type SocialSimSettings struct {
	ID                      int            `gorm:"primaryKey" json:"id"`
	Enabled                 bool           `gorm:"not null;default:false" json:"enabled"`
	CrashEnabled            bool           `gorm:"not null;default:true" json:"crash_enabled"`
	RouletteEnabled         bool           `gorm:"not null;default:true" json:"roulette_enabled"`
	PvPEnabled              bool           `gorm:"not null;default:true" json:"pvp_enabled"`
	LobbyEnabled            bool           `gorm:"not null;default:true" json:"lobby_enabled"`
	OnlineBaseMin           int            `gorm:"not null;default:18" json:"online_base_min"`
	OnlineBaseMax           int            `gorm:"not null;default:42" json:"online_base_max"`
	OnlineJitter            float64        `gorm:"type:double precision;not null;default:0.12" json:"online_jitter"`
	TODMultipliers          datatypes.JSON `gorm:"type:jsonb;not null" json:"tod_multipliers"`
	BetIntensity            float64        `gorm:"type:double precision;not null;default:8" json:"bet_intensity"`
	BetSpread               float64        `gorm:"type:double precision;not null;default:0.25" json:"bet_spread"`
	BetBurstChance          float64        `gorm:"type:double precision;not null;default:0.35" json:"bet_burst_chance"`
	IdleGapMsMin            int            `gorm:"not null;default:400" json:"idle_gap_ms_min"`
	IdleGapMsMax            int            `gorm:"not null;default:2200" json:"idle_gap_ms_max"`
	StakeP50                float64        `gorm:"type:double precision;not null;default:0.15" json:"stake_p50"`
	StakeP90                float64        `gorm:"type:double precision;not null;default:0.55" json:"stake_p90"`
	CrashAutoCashoutShare   float64        `gorm:"type:double precision;not null;default:0.55" json:"crash_auto_cashout_share"`
	CrashCashoutMin         float64        `gorm:"type:double precision;not null;default:1.2" json:"crash_cashout_min"`
	CrashCashoutMax         float64        `gorm:"type:double precision;not null;default:4.5" json:"crash_cashout_max"`
	RouletteRedWeight       float64        `gorm:"type:double precision;not null;default:0.46" json:"roulette_red_weight"`
	RouletteBlackWeight     float64        `gorm:"type:double precision;not null;default:0.46" json:"roulette_black_weight"`
	RouletteGreenWeight     float64        `gorm:"type:double precision;not null;default:0.08" json:"roulette_green_weight"`
	PvPMaxGhostRooms        int            `gorm:"not null;default:4" json:"pvp_max_ghost_rooms"`
	PvPRoomTTLSecMin        int            `gorm:"not null;default:25" json:"pvp_room_ttl_sec_min"`
	PvPRoomTTLSecMax        int            `gorm:"not null;default:90" json:"pvp_room_ttl_sec_max"`
	PvPStakeMinFrac         float64        `gorm:"type:double precision;not null;default:0.12" json:"pvp_stake_min_frac"`
	PvPStakeMaxFrac         float64        `gorm:"type:double precision;not null;default:0.7" json:"pvp_stake_max_frac"`
	Chaos                   float64        `gorm:"type:double precision;not null;default:0.35" json:"chaos"`
	UpdatedAt               time.Time      `json:"updated_at"`
}

func (SocialSimSettings) TableName() string { return "social_sim_settings" }

// PresenceSnapshot is the public online overlay payload.
type PresenceSnapshot struct {
	Online    int            `json:"online"`
	ByGame    map[string]int `json:"by_game"`
	UpdatedAt time.Time      `json:"updated_at"`
}
