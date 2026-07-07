package pvp

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	CountdownSeconds = 3
	SpinSeconds      = 7
	HistoryLimit     = 12
)

type TickNotifier interface {
	NotifyGameTick(game string, data []byte)
}

type PlayerView struct {
	UserID    uuid.UUID `json:"user_id"`
	FirstName string    `json:"first_name"`
	Username  string    `json:"username"`
	PhotoURL  string    `json:"photo_url,omitempty"`
	IsWinner  bool      `json:"is_winner,omitempty"`
}

type RoomView struct {
	ID               uuid.UUID   `json:"id"`
	CreatorID        uuid.UUID   `json:"creator_id"`
	BetAmountNanoton int64       `json:"bet_amount_nanoton"`
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
}

type LobbyState struct {
	Active  []RoomView `json:"active"`
	History []RoomView `json:"history"`
}

func (s *LobbyState) Marshal() []byte {
	data, _ := json.Marshal(s)
	return data
}
