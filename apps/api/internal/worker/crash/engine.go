package crash

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"math"
	"time"

	crashuc "github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/google/uuid"
)

type Engine struct {
	svc     *crashuc.Service
	games   domain.GameRepository
	chain   []string
	chainIx int
	tickMs  int
	betS    int
}

func NewEngine(svc *crashuc.Service, games domain.GameRepository, tickMs, betS int) *Engine {
	seedBytes := make([]byte, 32)
	_, _ = rand.Read(seedBytes)
	seed := hex.EncodeToString(seedBytes)
	chain := provablyfair.HashChain(seed, 10000)
	return &Engine{svc: svc, games: games, chain: chain, chainIx: 0, tickMs: tickMs, betS: betS}
}

func (e *Engine) Run(ctx context.Context) {
	slog.Info("crash engine started")
	for {
		select {
		case <-ctx.Done():
			return
		default:
			e.runRound(ctx)
		}
	}
}

func (e *Engine) runRound(ctx context.Context) {
	if e.chainIx >= len(e.chain) {
		e.chainIx = 0
	}
	hash := e.chain[e.chainIx]
	e.chainIx++
	crashPoint := provablyfair.CrashPoint(hash)

	roundNum, err := e.games.GetNextRoundNumber(ctx, domain.GameCrash)
	if err != nil {
		time.Sleep(time.Second)
		return
	}

	roundID := uuid.New()
	now := time.Now().UTC()
	serverSeedHash := provablyfair.HashSHA256(hash)
	round := &domain.GameRound{
		ID:             roundID,
		GameType:       domain.GameCrash,
		RoundNumber:    roundNum,
		Status:         "betting",
		StartedAt:      now,
		ServerSeedHash: serverSeedHash,
		ServerSeed:     hash,
		Nonce:          roundNum,
		CreatedAt:      now,
	}
	if err := e.games.CreateRound(ctx, round); err != nil {
		time.Sleep(time.Second)
		return
	}

	betState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "betting",
		EndsAt:         now.Add(time.Duration(e.betS) * time.Second),
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, betState)
	time.Sleep(time.Duration(e.betS) * time.Second)

	multiplier := 1.0
	tick := time.Duration(e.tickMs) * time.Millisecond
	runState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "running",
		Multiplier:     multiplier,
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, runState)

	for multiplier < crashPoint {
		select {
		case <-ctx.Done():
			return
		case <-time.After(tick):
		}
		multiplier = math.Floor((multiplier+0.01)*100) / 100
		runState.Multiplier = multiplier
		_ = e.svc.PublishState(ctx, runState)
	}

	_ = e.svc.SettleCrashed(ctx, roundID)
	end := time.Now().UTC()
	round.Status = "finished"
	round.EndedAt = &end
	_ = e.games.UpdateRound(ctx, round)

	crashState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "crashed",
		Multiplier:     multiplier,
		CrashPoint:     crashPoint,
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, crashState)
	time.Sleep(3 * time.Second)
}
