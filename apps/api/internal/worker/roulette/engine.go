package roulette

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	rouletteuc "github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
)

type Engine struct {
	svc      *rouletteuc.Service
	games    domain.GameRepository
	bettingS int
	spinS    int
}

func NewEngine(svc *rouletteuc.Service, games domain.GameRepository, bettingS, spinS int) *Engine {
	return &Engine{svc: svc, games: games, bettingS: bettingS, spinS: spinS}
}

func (e *Engine) Run(ctx context.Context) {
	slog.Info("roulette engine started")
	for {
		select {
		case <-ctx.Done():
			slog.Info("roulette engine stopped")
			return
		default:
			e.runRound(ctx)
		}
	}
}

func (e *Engine) runRound(ctx context.Context) {
	seedBytes := make([]byte, 32)
	_, _ = rand.Read(seedBytes)
	serverSeed := hex.EncodeToString(seedBytes)
	serverSeedHash := provablyfair.HashSHA256(serverSeed)

	roundNum, err := e.games.GetNextRoundNumber(ctx, domain.GameRoulette)
	if err != nil {
		time.Sleep(time.Second)
		return
	}

	round, err := e.svc.CreateRound(ctx, serverSeed, serverSeedHash, roundNum)
	if err != nil {
		slog.Error("create roulette round", "error", err)
		time.Sleep(time.Second)
		return
	}

	time.Sleep(time.Duration(e.bettingS) * time.Second)

	resultIndex := provablyfair.RouletteResultIndex(serverSeed, roundNum)
	resultNumber := provablyfair.RouletteWheelNumber(resultIndex)
	spinEnds := time.Now().Add(time.Duration(e.spinS) * time.Second)
	spinState := &rouletteuc.RoundState{
		RoundID:        round.ID,
		RoundNumber:    roundNum,
		Phase:          "spinning",
		EndsAt:         spinEnds,
		SpinEndsAt:     spinEnds,
		ServerSeedHash: serverSeedHash,
		ResultIndex:    &resultIndex,
		ResultNumber:   &resultNumber,
	}
	_ = e.svc.UpdatePhase(ctx, spinState)
	time.Sleep(time.Duration(e.spinS) * time.Second)

	result := provablyfair.RouletteNumberColor(resultNumber)
	if err := e.svc.SettleRound(ctx, round.ID, serverSeed, roundNum); err != nil {
		slog.Error("settle roulette round", "error", err)
	}

	resultState := &rouletteuc.RoundState{
		RoundID:        round.ID,
		RoundNumber:    roundNum,
		Phase:          "result",
		ServerSeedHash: serverSeedHash,
		ServerSeed:     serverSeed,
		ResultIndex:    &resultIndex,
		ResultNumber:   &resultNumber,
		Result:         result,
	}
	_ = e.svc.UpdatePhase(ctx, resultState)
	time.Sleep(2 * time.Second)
}
