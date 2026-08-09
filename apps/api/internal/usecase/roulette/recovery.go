package roulette

import (
	"crypto/rand"
	"encoding/json"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
)

// ColorStakeMap sums pending bet stakes by color (real bets only).
func ColorStakeMap(bets []domain.GameBet) (byColor map[string]int64, total int64) {
	byColor = map[string]int64{
		"blue":   0,
		"red":    0,
		"green":  0,
		"yellow": 0,
	}
	for _, bet := range bets {
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		color := sel["color"]
		if _, ok := byColor[color]; ok {
			byColor[color] += bet.AmountNanoton
		}
		total += bet.AmountNanoton
	}
	return byColor, total
}

// HousePnLIfColor returns house profit if the given color wins:
// totalStakes - payout owed to winners of that color.
func HousePnLIfColor(color string, byColor map[string]int64, total int64) int64 {
	if !provablyfair.ValidRouletteColor(color) {
		return total
	}
	return total - provablyfair.RoulettePayout(color, byColor[color])
}

// recoveryColors are eligible for auto house bias. Yellow is never auto-picked:
// a thin yellow book makes it the "optimal" drain and looks obviously rigged.
var recoveryColors = []string{"blue", "red", "green"}

// PickBestHouseColor chooses blue/red/green to maximize house PnL given stakes.
func PickBestHouseColor(bets []domain.GameBet) string {
	byColor, total := ColorStakeMap(bets)

	bestPnL := HousePnLIfColor(recoveryColors[0], byColor, total)
	candidates := []string{recoveryColors[0]}
	for _, color := range recoveryColors[1:] {
		pnl := HousePnLIfColor(color, byColor, total)
		if pnl > bestPnL {
			bestPnL = pnl
			candidates = []string{color}
		} else if pnl == bestPnL {
			candidates = append(candidates, color)
		}
	}

	if len(candidates) == 1 {
		return candidates[0]
	}

	lightest := candidates[0]
	for _, color := range candidates[1:] {
		if byColor[color] < byColor[lightest] {
			lightest = color
		}
	}
	tied := make([]string, 0, len(candidates))
	for _, color := range candidates {
		if byColor[color] == byColor[lightest] {
			tied = append(tied, color)
		}
	}
	if len(tied) == 1 {
		return tied[0]
	}
	return randomAmong(tied)
}

func randomAmong(colors []string) string {
	if len(colors) == 0 {
		return "blue"
	}
	var b [1]byte
	if _, err := rand.Read(b[:]); err != nil {
		return colors[0]
	}
	return colors[int(b[0])%len(colors)]
}
