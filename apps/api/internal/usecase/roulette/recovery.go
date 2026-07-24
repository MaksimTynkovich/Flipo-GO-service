package roulette

import (
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

// PickBestHouseColor chooses the wheel color that maximizes house PnL
// given current stakes. Ties prefer green, then red, then black.
func PickBestHouseColor(bets []domain.GameBet) string {
	red, green, black, total := ColorStakeTotals(bets)
	best := "green"
	bestPnL := HousePnLIfColor("green", red, green, black, total)
	for _, color := range []string{"red", "black"} {
		pnl := HousePnLIfColor(color, red, green, black, total)
		if pnl > bestPnL {
			best = color
			bestPnL = pnl
		}
	}
	return best
}
