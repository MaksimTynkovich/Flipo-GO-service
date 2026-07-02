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

// RouletteResult: 0=green (14x), 1-7=red (2x), 8-14=black (2x)
func RouletteResult(serverSeed string, nonce int64) string {
	h := HashSHA256(fmt.Sprintf("%s:%d", serverSeed, nonce))
	val := hexToInt(h[:8]) % 15
	switch {
	case val == 0:
		return "green"
	case val <= 7:
		return "red"
	default:
		return "black"
	}
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
