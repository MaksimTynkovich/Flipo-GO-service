package roulette

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type RoundState struct {
	RoundID        uuid.UUID `json:"round_id"`
	RoundNumber    int64     `json:"round_number"`
	Phase          string    `json:"phase"`
	EndsAt         time.Time `json:"ends_at"`
	ServerSeedHash string    `json:"server_seed_hash"`
	Result         string    `json:"result,omitempty"`
	ServerSeed     string    `json:"server_seed,omitempty"`
}

type Service struct {
	games    domain.GameRepository
	balance  *balance.Service
	cache    domain.GameStateCache
	bettingS int
	spinS    int
}

func NewService(games domain.GameRepository, balance *balance.Service, cache domain.GameStateCache, bettingS, spinS int) *Service {
	return &Service{games: games, balance: balance, cache: cache, bettingS: bettingS, spinS: spinS}
}

func (s *Service) CurrentState(ctx context.Context) (*RoundState, error) {
	data, err := s.cache.Get(ctx, "roulette:round:current")
	if err != nil || data == nil {
		return nil, nil
	}
	var state RoundState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (s *Service) PlaceBet(ctx context.Context, userID uuid.UUID, color string, amount int64, idempotencyKey string) (*domain.GameBet, error) {
	if amount <= 0 {
		return nil, domain.ErrInvalidAmount
	}
	if color != "red" && color != "black" && color != "green" {
		return nil, domain.ErrInvalidAmount
	}

	if existing, _ := s.games.FindBetByIdempotency(ctx, idempotencyKey); existing != nil {
		return existing, nil
	}

	state, err := s.CurrentState(ctx)
	if err != nil || state == nil || state.Phase != "betting" {
		return nil, domain.ErrRoundNotOpen
	}

	betID := uuid.New()
	if _, err := s.balance.Debit(ctx, userID, amount, domain.LedgerBet, "game_bet", betID); err != nil {
		return nil, err
	}

	selection, _ := json.Marshal(map[string]string{"color": color})
	bet := &domain.GameBet{
		ID:             betID,
		RoundID:        state.RoundID,
		UserID:         userID,
		GameType:       domain.GameRoulette,
		AmountNanoton:  amount,
		Selection:      datatypes.JSON(selection),
		Status:         domain.BetPending,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      time.Now().UTC(),
	}
	if err := s.games.CreateBet(ctx, bet); err != nil {
		return nil, err
	}
	return bet, nil
}

func (s *Service) SettleRound(ctx context.Context, roundID uuid.UUID, serverSeed string, nonce int64) error {
	result := provablyfair.RouletteResult(serverSeed, nonce)
	resultJSON, _ := json.Marshal(map[string]string{"color": result})

	round, err := s.games.GetRoundByID(ctx, roundID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	round.Status = "finished"
	round.EndedAt = &now
	round.ServerSeed = serverSeed
	round.ResultPayload = datatypes.JSON(resultJSON)
	if err := s.games.UpdateRound(ctx, round); err != nil {
		return err
	}

	bets, err := s.games.ListPendingBetsByRound(ctx, roundID)
	if err != nil {
		return err
	}

	for _, bet := range bets {
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		betColor := sel["color"]

		if betColor == result {
			payout := provablyfair.RoulettePayout(result, bet.AmountNanoton)
			_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetWon, payout, nil)
			_, _ = s.balance.Credit(ctx, bet.UserID, payout, domain.LedgerWin, "game_bet", bet.ID)
		} else {
			_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetLost, 0, nil)
		}
	}
	return nil
}

func (s *Service) PublishState(ctx context.Context, state *RoundState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if err := s.cache.Set(ctx, "roulette:round:current", data, 0); err != nil {
		return err
	}
	return s.cache.Publish(ctx, "pubsub:game:roulette", data)
}

func (s *Service) CreateRound(ctx context.Context, serverSeed, serverSeedHash string, roundNumber int64) (*domain.GameRound, error) {
	now := time.Now().UTC()
	round := &domain.GameRound{
		ID:             uuid.New(),
		GameType:       domain.GameRoulette,
		RoundNumber:    roundNumber,
		Status:         "betting",
		StartedAt:      now,
		ServerSeedHash: serverSeedHash,
		ServerSeed:     serverSeed,
		Nonce:          roundNumber,
		CreatedAt:      now,
	}
	if err := s.games.CreateRound(ctx, round); err != nil {
		return nil, err
	}

	state := &RoundState{
		RoundID:        round.ID,
		RoundNumber:    roundNumber,
		Phase:          "betting",
		EndsAt:         now.Add(time.Duration(s.bettingS) * time.Second),
		ServerSeedHash: serverSeedHash,
	}
	if err := s.PublishState(ctx, state); err != nil {
		return nil, err
	}
	return round, nil
}

func (s *Service) UpdatePhase(ctx context.Context, state *RoundState) error {
	return s.PublishState(ctx, state)
}

func ColorLabel(n int) string {
	return fmt.Sprintf("round-%d", n)
}
