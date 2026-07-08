package provablyfair

import (
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

// PvPWinnerIndex picks a deterministic winner among sorted player IDs.
func PvPWinnerIndex(serverSeed string, nonce int64, playerIDs []uuid.UUID) int {
	if len(playerIDs) == 0 {
		return 0
	}
	ids := append([]uuid.UUID(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i].String() < ids[j].String() })
	clientSeed := ""
	for i, id := range ids {
		if i > 0 {
			clientSeed += ","
		}
		clientSeed += id.String()
	}
	h := HashSHA256(fmt.Sprintf("%s:%s:%d", serverSeed, clientSeed, nonce))
	return int(hexToInt(h[:8]) % int64(len(ids)))
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
		chain := HashChain(serverSeed, int(nonce)+1)
		if int(nonce) < 0 || int(nonce) >= len(chain) {
			return false
		}
		return CrashPoint(chain[nonce]) == crash
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
		idx := PvPWinnerIndex(serverSeed, nonce, playerIDs)
		if idx < 0 || idx >= len(playerIDs) {
			return false
		}
		return playerIDs[idx].String() == winnerStr
	default:
		return false
	}
}
