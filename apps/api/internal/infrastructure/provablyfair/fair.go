package provablyfair

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
)

func HashSHA256(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func HashChain(seed string, length int) []string {
	chain := make([]string, length)
	current := seed
	for i := length - 1; i >= 0; i-- {
		current = HashSHA256(current)
		chain[i] = current
	}
	return chain
}

// WheelOrder — порядок чисел на колесе (по часовой от 0).
var WheelOrder = []int{0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14}

// RouletteResultIndex: 0–14 (индекс сектора на колесе).
func RouletteResultIndex(serverSeed string, nonce int64) int {
	h := HashSHA256(fmt.Sprintf("%s:%d", serverSeed, nonce))
	return int(hexToInt(h[:8]) % 15)
}

func RouletteWheelNumber(index int) int {
	if index < 0 || index >= len(WheelOrder) {
		return 0
	}
	return WheelOrder[index]
}

// RouletteNumberColor: 0=green, 1–7=red, 8–14=black.
func RouletteNumberColor(n int) string {
	switch {
	case n == 0:
		return "green"
	case n >= 1 && n <= 7:
		return "red"
	default:
		return "black"
	}
}

func RouletteResult(serverSeed string, nonce int64) string {
	idx := RouletteResultIndex(serverSeed, nonce)
	return RouletteNumberColor(RouletteWheelNumber(idx))
}

func RoulettePayout(color string, amount int64) int64 {
	switch color {
	case "green":
		return amount * 14
	case "red", "black":
		return amount * 2
	default:
		return 0
	}
}

// CrashPoint from hash with ~1% house edge
func CrashPoint(hash string) float64 {
	h := hexToInt(HashSHA256(hash)[:8])
	if h%33 == 0 {
		return 1.0
	}
	e := float64(h%0xFFFFFFFF) / float64(0xFFFFFFFF)
	return math.Max(1.0, math.Floor((100.0/(1.0-e))/100.0*100)/100)
}

func hexToInt(hexStr string) int64 {
	var val int64
	for _, c := range hexStr {
		val <<= 4
		switch {
		case c >= '0' && c <= '9':
			val |= int64(c - '0')
		case c >= 'a' && c <= 'f':
			val |= int64(c-'a') + 10
		case c >= 'A' && c <= 'F':
			val |= int64(c-'A') + 10
		}
	}
	return val
}
