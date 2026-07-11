package pvp

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	CountdownSeconds      = 3
	SpinSeconds           = 14
	HistoryLimit          = 12
	HistoryVisibleSeconds = 10
	OpenRoomTTL           = 5 * time.Minute
)

type TickNotifier interface {
	NotifyGameTick(game string, data []byte)
}

type GiftView struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	ImageURL       string `json:"image_url"`
	CollectionSlug string `json:"collection_slug,omitempty"`
	ValueNanoton   int64  `json:"value_nanoton,omitempty"`
}

type PlayerView struct {
	UserID         uuid.UUID  `json:"user_id"`
	FirstName      string     `json:"first_name"`
	Username       string     `json:"username"`
	PhotoURL       string     `json:"photo_url,omitempty"`
	StakeNanoton   int64      `json:"stake_nanoton"`
	BalanceNanoton int64      `json:"balance_nanoton,omitempty"`
	WinChanceBps   int        `json:"win_chance_bps,omitempty"`
	FundingType    string     `json:"funding_type,omitempty"`
	Gift           *GiftView  `json:"gift,omitempty"`
	Gifts          []GiftView `json:"gifts,omitempty"`
	IsWinner       bool       `json:"is_winner,omitempty"`
}

type RoomView struct {
	ID               uuid.UUID    `json:"id"`
	CreatorID        uuid.UUID    `json:"creator_id"`
	BetAmountNanoton int64        `json:"bet_amount_nanoton"`
	StakeToleranceBps int         `json:"stake_tolerance_bps"`
	MaxPlayers       int         `json:"max_players"`
	Status           string      `json:"status"`
	PlayerCount      int         `json:"player_count"`
	Players          []PlayerView `json:"players"`
	WinnerID         *uuid.UUID  `json:"winner_id,omitempty"`
	PayoutNanoton    *int64      `json:"payout_nanoton,omitempty"`
	SpinAt           *time.Time  `json:"spin_at,omitempty"`
	SpinEndsAt       *time.Time  `json:"spin_ends_at,omitempty"`
	FinishedAt       *time.Time  `json:"finished_at,omitempty"`
	CreatedAt        time.Time   `json:"created_at"`
	GameRoundID      *uuid.UUID  `json:"game_round_id,omitempty"`
	ServerSeedHash   string      `json:"server_seed_hash,omitempty"`
	ServerSeed       string      `json:"server_seed,omitempty"`
	Simulated        bool        `json:"simulated,omitempty"`
}

// RoomOverlay merges visual-only ghost rooms into the PvP lobby.
type RoomOverlay interface {
	PvPGhostRooms() []RoomView
}

type LobbyState struct {
	Active  []RoomView `json:"active"`
	History []RoomView `json:"history"`
}

func (s *LobbyState) Marshal() []byte {
	data, _ := json.Marshal(s)
	return data
}
