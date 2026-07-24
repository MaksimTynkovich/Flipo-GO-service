package roulette

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	outcomeuc "github.com/flipo/flipo/apps/api/internal/usecase/outcome"
	rouletteuc "github.com/flipo/flipo/apps/api/internal/usecase/roulette"
)

type Engine struct {
	svc            *rouletteuc.Service
	games          domain.GameRepository
	outcome        *outcomeuc.Service
	bettingS       int
	spinS          int
	resultPauseS   int
	resultDisplayS int
}

func NewEngine(svc *rouletteuc.Service, games domain.GameRepository, bettingS, spinS, resultPauseS, resultDisplayS int, outcomeSvc *outcomeuc.Service) *Engine {
	return &Engine{svc: svc, games: games, bettingS: bettingS, spinS: spinS, resultPauseS: resultPauseS, resultDisplayS: resultDisplayS, outcome: outcomeSvc}
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
	roundNum, err := e.games.GetNextRoundNumber(ctx, domain.GameRoulette)
	if err != nil {
		time.Sleep(time.Second)
		return
	}

	serverSeed := ""
	adminInfluenced := false
	deferredSeed := false

	if e.outcome != nil {
		if override, ok, oerr := e.outcome.TakePending(ctx, domain.GameRoulette); oerr == nil && ok {
			if t, terr := e.outcome.DecodeRouletteTarget(override); terr == nil {
				mode, weight := e.outcome.RouletteMode(t)
				if outcomeuc.ShouldApply(mode, weight) {
					if found, foundOk := provablyfair.FindRouletteSeed(t.Color, t.Number, roundNum, 100000); foundOk {
						serverSeed = found
						adminInfluenced = true
					}
				}
			}
		}
	}

	if serverSeed == "" {
		recoveryActive, biasWeight, rerr := e.svc.RecoverySnapshot(ctx)
		if rerr != nil {
			slog.Warn("roulette recovery snapshot", "error", rerr)
		}
		if recoveryActive {
			deferredSeed = true
			// Seed chosen after betting against live exposure (bias_weight may still skip).
			_ = biasWeight
		} else {
			serverSeed = randomServerSeed()
		}
	}

	serverSeedHash := ""
	if serverSeed != "" {
		serverSeedHash = provablyfair.HashSHA256(serverSeed)
	}

	round, err := e.svc.CreateRound(ctx, serverSeed, serverSeedHash, roundNum)
	if err != nil {
		slog.Error("create roulette round", "error", err)
		time.Sleep(time.Second)
		return
	}

	if adminInfluenced {
		if uerr := e.svc.MarkAdminInfluenced(ctx, round.ID); uerr != nil {
			slog.Warn("mark roulette round admin-influenced", "error", uerr)
		}
	}

	time.Sleep(time.Duration(e.bettingS) * time.Second)

	if deferredSeed {
		recoveryActive, biasWeight, _ := e.svc.RecoverySnapshot(ctx)
		serverSeed = ""
		adminInfluenced = false
		if recoveryActive && outcomeuc.ShouldApply(outcomeuc.ModeBias, biasWeight) {
			bets, berr := e.games.ListPendingBetsByRound(ctx, round.ID)
			if berr != nil {
				slog.Warn("roulette recovery list bets", "error", berr)
			} else {
				color := rouletteuc.PickBestHouseColor(bets)
				if found, foundOk := provablyfair.FindRouletteSeed(color, nil, roundNum, 100000); foundOk {
					serverSeed = found
					adminInfluenced = true
					slog.Info("roulette recovery seed", "color", color, "round", roundNum)
				}
			}
		}
		if serverSeed == "" {
			serverSeed = randomServerSeed()
		}
		hash, aerr := e.svc.AttachRoundSeed(ctx, round.ID, serverSeed, adminInfluenced)
		if aerr != nil {
			slog.Error("attach roulette seed", "error", aerr)
			time.Sleep(time.Second)
			return
		}
		serverSeedHash = hash
	}

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
	time.Sleep(time.Duration(e.resultPauseS) * time.Second)

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
	time.Sleep(time.Duration(e.resultDisplayS) * time.Second)
}

func randomServerSeed() string {
	seedBytes := make([]byte, 32)
	_, _ = rand.Read(seedBytes)
	return hex.EncodeToString(seedBytes)
}
