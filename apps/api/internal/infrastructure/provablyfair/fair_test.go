package provablyfair_test

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
)

func TestRouletteResultDeterministic(t *testing.T) {
	r1 := provablyfair.RouletteResult("testseed", 1)
	r2 := provablyfair.RouletteResult("testseed", 1)
	if r1 != r2 {
		t.Fatalf("expected deterministic result, got %s and %s", r1, r2)
	}
	if r1 != "red" && r1 != "black" && r1 != "green" {
		t.Fatalf("invalid color: %s", r1)
	}
}

func TestCrashPointMinimum(t *testing.T) {
	cp := provablyfair.CrashPoint("abc123")
	if cp < 1.0 {
		t.Fatalf("crash point must be >= 1.0, got %f", cp)
	}
}

func TestHashChainLength(t *testing.T) {
	chain := provablyfair.HashChain("seed", 10)
	if len(chain) != 10 {
		t.Fatalf("expected chain length 10, got %d", len(chain))
	}
}
