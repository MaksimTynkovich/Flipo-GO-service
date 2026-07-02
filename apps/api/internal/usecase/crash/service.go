package crash

import (
	"context"
	"math"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type RoundState struct {
	RoundID        uuid.UUID `json:"round_id"`
	RoundNumber    int64     `json:"round_number"`
	Phase          string    `json:"phase"`
	Multiplier     float64   `json:"multiplier"`
	CrashPoint     float64   `json:"crash_point,omitempty"`
	EndsAt         time.Time `json:"ends_at,omitempty"`
	ServerSeedHash string    `json:"server_seed_hash"`
}

type Service struct {
	games   domain.GameRepository
	balance *balance.Service
	cache   domain.GameStateCache
	tickMs  int
}

func NewService(games domain.GameRepository, balance *balance.Service, cache domain.GameStateCache, tickMs int) *Service {
	return &Service{games: games, balance: balance, cache: cache, tickMs: tickMs}
}

func (s *Service) CurrentState(ctx context.Context) (*RoundState, error) {
	data, err := s.cache.Get(ctx, "crash:round:current")
	if err != nil || data == nil {
		return nil, nil
	}
	var state RoundState
	if err := jsonUnmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (s *Service) PlaceBet(ctx context.Context, userID uuid.UUID, amount int64, idempotencyKey string) (*domain.GameBet, error) {
	if amount <= 0 {
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

	bet := &domain.GameBet{
		ID:             betID,
		RoundID:        state.RoundID,
		UserID:         userID,
		GameType:       domain.GameCrash,
		AmountNanoton:  amount,
		Status:         domain.BetPending,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      time.Now().UTC(),
	}
	if err := s.games.CreateBet(ctx, bet); err != nil {
		return nil, err
	}
	return bet, nil
}

func (s *Service) Cashout(ctx context.Context, userID, betID uuid.UUID, multiplier float64) (int64, error) {
	state, err := s.CurrentState(ctx)
	if err != nil || state == nil || state.Phase != "running" {
		return 0, domain.ErrRoundNotOpen
	}
	if multiplier > state.Multiplier {
		multiplier = state.Multiplier
	}

	bets, err := s.games.ListPendingBetsByRound(ctx, state.RoundID)
	if err != nil {
		return 0, err
	}
	var target *domain.GameBet
	for i := range bets {
		if bets[i].ID == betID && bets[i].UserID == userID {
			target = &bets[i]
			break
		}
	}
	if target == nil {
		return 0, domain.ErrInvalidAmount
	}

	payout := int64(math.Floor(float64(target.AmountNanoton) * multiplier))
	ok, err := s.games.SettleBet(ctx, betID, domain.BetCashedOut, payout, &multiplier)
	if err != nil || !ok {
		return 0, domain.ErrRoundNotOpen
	}
	return s.balance.Credit(ctx, userID, payout, domain.LedgerWin, "game_bet", betID)
}

func (s *Service) SettleCrashed(ctx context.Context, roundID uuid.UUID) error {
	bets, err := s.games.ListPendingBetsByRound(ctx, roundID)
	if err != nil {
		return err
	}
	for _, bet := range bets {
		_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetLost, 0, nil)
	}
	return nil
}

func (s *Service) PublishState(ctx context.Context, state *RoundState) error {
	data, err := jsonMarshal(state)
	if err != nil {
		return err
	}
	if err := s.cache.Set(ctx, "crash:round:current", data, 0); err != nil {
		return err
	}
	return s.cache.Publish(ctx, "pubsub:game:crash", data)
}
