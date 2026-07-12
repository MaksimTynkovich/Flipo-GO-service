package provablyfair

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"github.com/google/uuid"
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

// PvPWinnerIndex picks a deterministic winner among sorted player IDs (equal odds).
func PvPWinnerIndex(serverSeed string, nonce int64, playerIDs []uuid.UUID) int {
	return PvPWeightedWinnerIndex(serverSeed, nonce, playerIDs, nil)
}

// PvPWeightedWinnerIndex picks a winner proportional to weights (same order as sorted playerIDs).
// When weights is nil or sums to zero, all players have equal odds.
func PvPWeightedWinnerIndex(serverSeed string, nonce int64, playerIDs []uuid.UUID, weights []int64) int {
	if len(playerIDs) == 0 {
		return 0
	}
	ids := append([]uuid.UUID(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i].String() < ids[j].String() })

	orderedWeights := weights
	if len(weights) == len(playerIDs) && len(weights) > 1 {
		// Re-order weights to match sorted IDs.
		byID := make(map[string]int64, len(playerIDs))
		for i, id := range playerIDs {
			byID[id.String()] = weights[i]
		}
		orderedWeights = make([]int64, len(ids))
		for i, id := range ids {
			orderedWeights[i] = byID[id.String()]
		}
	}

	clientSeed := ""
	for i, id := range ids {
		if i > 0 {
			clientSeed += ","
		}
		clientSeed += id.String()
		if len(orderedWeights) == len(ids) {
			clientSeed += fmt.Sprintf(":%d", orderedWeights[i])
		}
	}

	var total int64
	if len(orderedWeights) == len(ids) {
		for _, w := range orderedWeights {
			if w > 0 {
				total += w
			}
		}
	}
	if total <= 0 {
		h := HashSHA256(fmt.Sprintf("%s:%s:%d", serverSeed, clientSeed, nonce))
		return int(hexToInt(h[:8]) % int64(len(ids)))
	}

	h := HashSHA256(fmt.Sprintf("%s:%s:%d", serverSeed, clientSeed, nonce))
	roll := hexToInt(h[:8]) % total
	var acc int64
	for i, w := range orderedWeights {
		if w <= 0 {
			continue
		}
		acc += w
		if roll < acc {
			return i
		}
	}
	return len(ids) - 1
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

// VerifyRound checks that a finished round's result matches committed server seed hash.
func VerifyRound(gameType string, serverSeedHash, serverSeed string, nonce int64, resultPayload []byte) bool {
	if serverSeedHash == "" || serverSeed == "" {
		return false
	}
	if HashSHA256(serverSeed) != serverSeedHash {
		return false
	}

	switch gameType {
	case "roulette":
		var payload map[string]any
		if err := json.Unmarshal(resultPayload, &payload); err != nil {
			return false
		}
		color, _ := payload["color"].(string)
		return RouletteResult(serverSeed, nonce) == color
	case "crash":
		var payload map[string]any
		if err := json.Unmarshal(resultPayload, &payload); err != nil {
			return false
		}
		crash, ok := payload["crash_point"].(float64)
		if !ok {
			return false
		}
		return CrashPoint(serverSeed) == crash
	case "pvp":
		var payload map[string]any
		if err := json.Unmarshal(resultPayload, &payload); err != nil {
			return false
		}
		winnerStr, _ := payload["winner_id"].(string)
		rawIDs, ok := payload["player_ids"].([]any)
		if !ok || winnerStr == "" {
			return false
		}
		playerIDs := make([]uuid.UUID, 0, len(rawIDs))
		for _, raw := range rawIDs {
			idStr, _ := raw.(string)
			id, err := uuid.Parse(idStr)
			if err != nil {
				return false
			}
			playerIDs = append(playerIDs, id)
		}
		var weights []int64
		if rawStakes, ok := payload["player_stakes_nanoton"].([]any); ok && len(rawStakes) == len(playerIDs) {
			weights = make([]int64, len(rawStakes))
			for i, raw := range rawStakes {
				switch v := raw.(type) {
				case float64:
					weights[i] = int64(v)
				case json.Number:
					n, _ := v.Int64()
					weights[i] = n
				}
			}
		}
		idx := PvPWeightedWinnerIndex(serverSeed, nonce, playerIDs, weights)
		if idx < 0 || idx >= len(playerIDs) {
			return false
		}
		return playerIDs[idx].String() == winnerStr
	default:
		return false
	}
}

// FindRouletteSeed searches for a random server seed whose roulette outcome
// matches targetColor (and optionally targetNumber) at the given nonce.
// Returns the seed and true, or ("", false) if maxTries were exhausted.
// The found seed keeps the round provably-fair (VerifyRound still passes).
func FindRouletteSeed(targetColor string, targetNumber *int, nonce int64, maxTries int) (string, bool) {
	for i := 0; i < maxTries; i++ {
		seed := randomSeed()
		idx := RouletteResultIndex(seed, nonce)
		num := RouletteWheelNumber(idx)
		color := RouletteNumberColor(num)
		if color != targetColor {
			continue
		}
		if targetNumber != nil && num != *targetNumber {
			continue
		}
		return seed, true
	}
	return "", false
}

// FindCrashHash searches for a random hash whose CrashPoint lies within
// [minPoint, maxPoint]. If exactPoint > 0 the hash must produce exactly that
// point. Returns the hash and true, or ("", false) otherwise.
func FindCrashHash(minPoint, maxPoint, exactPoint float64, maxTries int) (string, bool) {
	if exactPoint > 0 {
		for i := 0; i < maxTries; i++ {
			hash := randomHash()
			if CrashPoint(hash) == exactPoint {
				return hash, true
			}
		}
		return "", false
	}
	if minPoint < 1 {
		minPoint = 1
	}
	if maxPoint < minPoint {
		maxPoint = minPoint
	}
	for i := 0; i < maxTries; i++ {
		hash := randomHash()
		point := CrashPoint(hash)
		if point >= minPoint && point <= maxPoint {
			return hash, true
		}
	}
	return "", false
}

// FindPvPSeed searches for a random server seed whose weighted winner index
// equals targetIdx at the given nonce for the provided players/weights.
func FindPvPSeed(targetIdx int, nonce int64, playerIDs []uuid.UUID, weights []int64, maxTries int) (string, bool) {
	for i := 0; i < maxTries; i++ {
		seed := randomSeed()
		if PvPWeightedWinnerIndex(seed, nonce, playerIDs, weights) == targetIdx {
			return seed, true
		}
	}
	return "", false
}

func randomSeed() string {
	seedBytes := make([]byte, 32)
	_, _ = rand.Read(seedBytes)
	return hex.EncodeToString(seedBytes)
}

func randomHash() string {
	return randomSeed()
}
