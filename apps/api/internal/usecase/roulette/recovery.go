package roulette

import (
	"crypto/rand"
	"encoding/json"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
)

// ColorStakeTotals sums pending bet stakes by color (real bets only).
func ColorStakeTotals(bets []domain.GameBet) (red, green, black, total int64) {
	for _, bet := range bets {
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		switch sel["color"] {
		case "red":
			red += bet.AmountNanoton
		case "green":
			green += bet.AmountNanoton
		case "black":
			black += bet.AmountNanoton
		}
		total += bet.AmountNanoton
	}
	return red, green, black, total
}

// HousePnLIfColor returns house profit if the given color wins:
// totalStakes - payout owed to winners of that color.
func HousePnLIfColor(color string, red, green, black, total int64) int64 {
	var onColor int64
	switch color {
	case "red":
		onColor = red
	case "green":
		onColor = green
	case "black":
		onColor = black
	default:
		return total
	}
	return total - provablyfair.RoulettePayout(color, onColor)
}

// PickBestHouseColor chooses red or black to maximize house PnL given stakes.
// Green is never auto-picked: thin green books make it the "optimal" drain almost
// every round and look obviously rigged (~1/15 natural rate).
func PickBestHouseColor(bets []domain.GameBet) string {
	red, green, black, total := ColorStakeTotals(bets)
	redPnL := HousePnLIfColor("red", red, green, black, total)
	blackPnL := HousePnLIfColor("black", red, green, black, total)
	if redPnL > blackPnL {
		return "red"
	}
	if blackPnL > redPnL {
		return "black"
	}
	// Equal PnL: lean to the lighter book; if still tied, coin flip.
	if red < black {
		return "red"
	}
	if black < red {
		return "black"
	}
	return randomRedOrBlack()
}

func randomRedOrBlack() string {
	var b [1]byte
	if _, err := rand.Read(b[:]); err != nil || b[0]%2 == 0 {
		return "red"
	}
	return "black"
}
