package crash

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"time"

	crashuc "github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Engine struct {
	svc         *crashuc.Service
	games       domain.GameRepository
	chain       []string
	chainIx     int
	tickMs      int
	betS        int
	growthPerMs float64
}

func NewEngine(svc *crashuc.Service, games domain.GameRepository, tickMs, betS int, growthPerMs float64) *Engine {
	seedBytes := make([]byte, 32)
	_, _ = rand.Read(seedBytes)
	seed := hex.EncodeToString(seedBytes)
	chain := provablyfair.HashChain(seed, 10000)
	return &Engine{svc: svc, games: games, chain: chain, chainIx: 0, tickMs: tickMs, betS: betS, growthPerMs: growthPerMs}
}

func (e *Engine) Run(ctx context.Context) {
	slog.Info("crash engine started")

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		acquired, err := e.svc.TryAcquireEngineLock(ctx)
		if err != nil || !acquired {
			slog.Warn("crash engine waiting for leader lock")
			time.Sleep(2 * time.Second)
			continue
		}

		lockCtx, lockCancel := context.WithCancel(ctx)
		go e.renewLock(lockCtx)

		e.recoverOrphans(ctx)

		for {
			select {
			case <-ctx.Done():
				lockCancel()
				_ = e.svc.ReleaseEngineLock(context.Background())
				return
			default:
				func() {
					defer func() {
						if r := recover(); r != nil {
							slog.Error("crash round panic", "error", r)
							time.Sleep(time.Second)
						}
					}()
					e.runRound(ctx)
				}()
			}
		}
	}
}

func (e *Engine) renewLock(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := e.svc.RenewEngineLock(ctx); err != nil {
				slog.Warn("crash engine lock renew failed", "error", err)
			}
		}
	}
}

func (e *Engine) recoverOrphans(ctx context.Context) {
	state, err := e.svc.CurrentState(ctx)
	if err != nil || state == nil {
		return
	}
	if state.Phase != "betting" && state.Phase != "running" {
		return
	}

	slog.Warn("recovering stale crash round",
		"round", state.RoundNumber,
		"phase", state.Phase,
		"multiplier", state.Multiplier,
	)

	round, err := e.games.GetRoundByID(ctx, state.RoundID)
	if err != nil || round == nil {
		return
	}

	crashPoint := state.Multiplier
	if round.ServerSeed != "" {
		crashPoint = provablyfair.CrashPoint(round.ServerSeed)
	}

	_ = e.svc.PublishState(ctx, &crashuc.RoundState{
		RoundID:        state.RoundID,
		RoundNumber:    state.RoundNumber,
		Phase:          "crashed",
		Multiplier:     crashPoint,
		CrashPoint:     crashPoint,
		ServerSeedHash: state.ServerSeedHash,
	})

	go e.finishRound(context.Background(), round, crashPoint, state.RoundID)
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
		slog.Error("crash create round failed", "error", err)
		time.Sleep(time.Second)
		return
	}

	betEnds := now.Add(time.Duration(e.betS) * time.Second)
	betState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "betting",
		Multiplier:     1.0,
		EndsAt:         &betEnds,
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, betState)
	_ = e.svc.PublishBets(ctx, roundID)
	time.Sleep(time.Duration(e.betS) * time.Second)

	runStarted := time.Now().UTC()
	multiplier := 1.0
	tick := time.Duration(e.tickMs) * time.Millisecond
	runState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "running",
		Multiplier:     multiplier,
		RunningSince:   &runStarted,
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, runState)

	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for multiplier < crashPoint {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		elapsedMs := time.Since(runStarted).Milliseconds()
		raw := math.Exp(e.growthPerMs * float64(elapsedMs))
		multiplier = math.Floor(raw*100) / 100
		if multiplier < 1 {
			multiplier = 1
		}
		if multiplier >= crashPoint {
			multiplier = crashPoint
		}

		runState.Multiplier = multiplier
		_ = e.svc.PublishState(ctx, runState)

		if multiplier >= crashPoint {
			break
		}
	}

	crashState := &crashuc.RoundState{
		RoundID:        roundID,
		RoundNumber:    roundNum,
		Phase:          "crashed",
		Multiplier:     multiplier,
		CrashPoint:     crashPoint,
		ServerSeedHash: serverSeedHash,
	}
	_ = e.svc.PublishState(ctx, crashState)

	go e.finishRound(context.Background(), round, crashPoint, roundID)

	time.Sleep(3 * time.Second)
}

func (e *Engine) finishRound(ctx context.Context, round *domain.GameRound, crashPoint float64, roundID uuid.UUID) {
	finishCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if err := e.svc.SettleCrashed(finishCtx, roundID); err != nil {
		slog.Error("crash settle failed", "error", err, "round_id", roundID)
	}

	end := time.Now().UTC()
	round.Status = "finished"
	round.EndedAt = &end
	resultJSON, _ := json.Marshal(map[string]float64{"crash_point": crashPoint})
	round.ResultPayload = datatypes.JSON(resultJSON)
	if err := e.games.UpdateRound(finishCtx, round); err != nil {
		slog.Error("crash update round failed", "error", err)
	}
}
