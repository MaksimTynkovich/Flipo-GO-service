package socialsim

import (
	"time"

	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/pvp"
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
			Simulated:             true,
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
			Simulated:     true,
		})
	}
	return out
}

// PvPBridge adapts Simulator to pvp.RoomOverlay.
type PvPBridge struct {
	Sim *Simulator
}

func (b PvPBridge) PvPGhostRooms() []pvp.RoomView {
	if b.Sim == nil {
		return nil
	}
	ghosts := b.Sim.PvPGhostRooms()
	out := make([]pvp.RoomView, 0, len(ghosts))
	for _, g := range ghosts {
		players := make([]pvp.PlayerView, 0, len(g.Players))
		for _, p := range g.Players {
			players = append(players, pvp.PlayerView{
				UserID:       p.UserID,
				FirstName:    p.FirstName,
				Username:     p.Username,
				PhotoURL:     p.PhotoURL,
				StakeNanoton: p.StakeNanoton,
				FundingType:  p.FundingType,
				IsWinner:     p.IsWinner,
			})
		}
		out = append(out, pvp.RoomView{
			ID:                g.ID,
			CreatorID:         g.CreatorID,
			BetAmountNanoton:  g.BetAmountNanoton,
			StakeToleranceBps: g.StakeToleranceBps,
			MaxPlayers:        g.MaxPlayers,
			Status:            g.Status,
			PlayerCount:       g.PlayerCount,
			Players:           players,
			WinnerID:          g.WinnerID,
			PayoutNanoton:     g.PayoutNanoton,
			SpinAt:            g.SpinAt,
			SpinEndsAt:        g.SpinEndsAt,
			FinishedAt:        g.FinishedAt,
			CreatedAt:         g.CreatedAt,
			Simulated:         true,
		})
	}
	return out
}

func (b PvPBridge) ClaimOpenGhostRoom(roomID uuid.UUID) (*pvp.GhostRoomClaim, bool) {
	if b.Sim == nil {
		return nil, false
	}
	ghost, ok := b.Sim.ClaimOpenGhostRoom(roomID)
	if !ok || ghost == nil || len(ghost.Players) == 0 {
		return nil, false
	}
	bot := ghost.Players[0]
	persona, found := b.Sim.PersonaByID(bot.UserID)
	telegramID := int64(-1)
	if found {
		telegramID = persona.TelegramID
	}
	return &pvp.GhostRoomClaim{
		ID:               ghost.ID,
		BetAmountNanoton: ghost.BetAmountNanoton,
		BotUserID:        bot.UserID,
		BotTelegramID:    telegramID,
		BotUsername:      bot.Username,
		BotFirstName:     bot.FirstName,
		BotPhotoURL:      bot.PhotoURL,
		CreatedAt:        ghost.CreatedAt,
	}, true
}

func (b PvPBridge) BotJoinsEnabled() bool {
	if b.Sim == nil {
		return false
	}
	return b.Sim.BotJoinsEnabled()
}

func (b PvPBridge) PlanBotJoins(rooms []pvp.OpenHumanRoom) []pvp.PlannedBotJoin {
	if b.Sim == nil || len(rooms) == 0 {
		return nil
	}
	in := make([]HumanOpenRoom, 0, len(rooms))
	for _, room := range rooms {
		in = append(in, HumanOpenRoom{
			ID:               room.ID,
			CreatorID:        room.CreatorID,
			BetAmountNanoton: room.BetAmountNanoton,
			CreatedAt:        room.CreatedAt,
			PlayerIDs:        room.PlayerIDs,
		})
	}
	planned := b.Sim.PlanBotJoins(in)
	out := make([]pvp.PlannedBotJoin, 0, len(planned))
	for _, item := range planned {
		out = append(out, pvp.PlannedBotJoin{
			RoomID:        item.RoomID,
			BotUserID:     item.Bot.ID,
			BotTelegramID: item.Bot.TelegramID,
			BotUsername:   item.Bot.Username,
			BotFirstName:  item.Bot.FirstName,
			BotPhotoURL:   item.Bot.PhotoURL,
			StakeNanoton:  item.StakeNanoton,
		})
	}
	return out
}
