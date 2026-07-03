package provablyfair_test

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
)

func TestRouletteResultDeterministic(t *testing.T) {
	i1 := provablyfair.RouletteResultIndex("testseed", 1)
	i2 := provablyfair.RouletteResultIndex("testseed", 1)
	if i1 != i2 {
		t.Fatalf("expected deterministic index, got %d and %d", i1, i2)
	}
	if i1 < 0 || i1 > 14 {
		t.Fatalf("invalid index: %d", i1)
	}
	n := provablyfair.RouletteWheelNumber(i1)
	c := provablyfair.RouletteNumberColor(n)
	if c != "red" && c != "black" && c != "green" {
		t.Fatalf("invalid color: %s", c)
	}
}

func TestWheelOrder(t *testing.T) {
	order := provablyfair.WheelOrder
	if len(order) != 15 {
		t.Fatalf("expected 15 segments, got %d", len(order))
	}
	if order[0] != 0 || order[1] != 1 || order[2] != 8 {
		t.Fatalf("unexpected wheel order start: %v", order[:3])
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
