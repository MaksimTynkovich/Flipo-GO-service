package provablyfair

import (
	"testing"

	"github.com/google/uuid"
)

func TestFindRouletteSeed(t *testing.T) {
	nonce := int64(12345)
	for _, color := range []string{"red", "black", "green"} {
		seed, ok := FindRouletteSeed(color, nil, nonce, 200000)
		if !ok {
			t.Fatalf("no seed found for color %s", color)
		}
		if RouletteResult(seed, nonce) != color {
			t.Fatalf("seed produced wrong color for %s", color)
		}
	}
}

func TestFindCrashHash(t *testing.T) {
	hash, ok := FindCrashHash(2.0, 5.0, 0, 200000)
	if !ok {
		t.Fatal("no crash hash found in [2,5]")
	}
	p := CrashPoint(hash)
	if p < 2.0 || p > 5.0 {
		t.Fatalf("crash point %v out of range", p)
	}
}

func TestFindCrashHashExact(t *testing.T) {
	const exact = 2.0
	hash, ok := FindCrashHash(0, 0, exact, 200000)
	if !ok {
		t.Fatalf("no crash hash found for exact %v", exact)
	}
	if CrashPoint(hash) != exact {
		t.Fatalf("crash point %v != exact %v", CrashPoint(hash), exact)
	}
}

func TestFindPvPSeed(t *testing.T) {
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	weights := []int64{100, 100, 100}
	seed, ok := FindPvPSeed(2, 999, ids, weights, 200000)
	if !ok {
		t.Fatal("no pvp seed found for index 2")
	}
	if PvPWeightedWinnerIndex(seed, 999, ids, weights) != 2 {
		t.Fatalf("pvp seed produced wrong winner")
	}
}
