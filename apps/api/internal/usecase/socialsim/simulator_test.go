package socialsim

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

func TestNormalizeClampsAndTOD(t *testing.T) {
	cfg := DefaultSettings()
	cfg.OnlineBaseMax = 1
	cfg.OnlineBaseMin = 10
	cfg.Chaos = 5
	cfg.StakeP90 = 0.05
	cfg.StakeP50 = 0.2
	Normalize(&cfg)
	if cfg.OnlineBaseMax < cfg.OnlineBaseMin {
		t.Fatalf("max < min after normalize")
	}
	if cfg.Chaos != 1 {
		t.Fatalf("chaos=%v want 1", cfg.Chaos)
	}
	if cfg.StakeP90 < cfg.StakeP50 {
		t.Fatalf("p90 < p50")
	}
	tod := ParseTOD(cfg.TODMultipliers)
	if len(tod) != 24 {
		t.Fatalf("tod len=%d", len(tod))
	}
}

func TestPreviewOnlineDisabled(t *testing.T) {
	cfg := DefaultSettings()
	cfg.Enabled = false
	if PreviewOnline(cfg) != 0 {
		t.Fatal("expected 0 when disabled")
	}
}

func TestGhostBetsNeverTouchDBShape(t *testing.T) {
	sim := NewSimulator(nil, nil, nil)
	cfg := DefaultSettings()
	cfg.Enabled = true
	cfg.CrashEnabled = true
	cfg.BetIntensity = 5
	sim.ApplySettings(cfg)

	roundID := domain.GameRound{}.ID // zero uuid ok for hook then replace
	_ = roundID
	id := [16]byte{1}
	var uid [16]byte
	copy(uid[:], id[:])
	// Use OnCrashState with a non-nil round via uuid from personas path
	sim.OnCrashState(CrashStateHook{
		RoundID: sim.personas[0].ID, // reuse as round id for test
		Phase:   "betting",
		EndsAt:  ptrTime(time.Now().Add(8 * time.Second)),
	})
	sim.mu.Lock()
	sim.crashTarget = 3
	sim.crashNextBet = time.Now().Add(-time.Second)
	sim.mu.Unlock()
	sim.tickBets(nil)

	bets := sim.CrashBets(sim.personas[0].ID)
	if len(bets) == 0 {
		t.Fatal("expected ghost bets")
	}
	for _, b := range bets {
		if !b.Simulated {
			t.Fatal("ghost must be simulated")
		}
		if b.FundingType != "balance" {
			t.Fatalf("funding=%s", b.FundingType)
		}
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
