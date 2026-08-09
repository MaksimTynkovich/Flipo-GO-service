package socialsim

import (
	"time"

	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/google/uuid"
)

// CrashBridge adapts Simulator to crash.BetOverlay.
type CrashBridge struct {
	Sim *Simulator
}

func (b CrashBridge) OnCrashState(roundID uuid.UUID, phase string, multiplier float64, endsAt *time.Time) {
	if b.Sim == nil {
		return
	}
	b.Sim.OnCrashState(CrashStateHook{
		RoundID:    roundID,
		Phase:      phase,
		Multiplier: multiplier,
		EndsAt:     endsAt,
	})
}

func (b CrashBridge) CrashBets(roundID uuid.UUID) []crash.BetView {
	if b.Sim == nil {
		return nil
	}
	ghosts := b.Sim.CrashBets(roundID)
	out := make([]crash.BetView, 0, len(ghosts))
	for _, g := range ghosts {
		out = append(out, crash.BetView{
			ID:                    g.ID,
			UserID:                g.UserID,
			Username:              g.Username,
			FirstName:             g.FirstName,
			PhotoURL:              g.PhotoURL,
			AmountNanoton:         g.AmountNanoton,
			FundingType:           g.FundingType,
			Status:                g.Status,
			CashoutMultiplier:     g.CashoutMultiplier,
			AutoCashoutMultiplier: g.AutoCashoutMultiplier,
			PayoutNanoton:         g.PayoutNanoton,
		})
	}
	return out
}

// RouletteBridge adapts Simulator to roulette.BetOverlay.
type RouletteBridge struct {
	Sim *Simulator
}

func (b RouletteBridge) OnRouletteState(roundID uuid.UUID, phase string, endsAt *time.Time, resultColor string) {
	if b.Sim == nil {
		return
	}
	b.Sim.OnRouletteState(RouletteStateHook{
		RoundID: roundID,
		Phase:   phase,
		EndsAt:  endsAt,
		Result:  resultColor,
	})
}

func (b RouletteBridge) RouletteBets(roundID uuid.UUID) []roulette.BetView {
	if b.Sim == nil {
		return nil
	}
	ghosts := b.Sim.RouletteBets(roundID)
	out := make([]roulette.BetView, 0, len(ghosts))
	for _, g := range ghosts {
		out = append(out, roulette.BetView{
			ID:            g.ID,
			UserID:        g.UserID,
			Username:      g.Username,
			FirstName:     g.FirstName,
			PhotoURL:      g.PhotoURL,
			Color:         g.Color,
			AmountNanoton: g.AmountNanoton,
			FundingType:   g.FundingType,
		})
	}
	return out
}
