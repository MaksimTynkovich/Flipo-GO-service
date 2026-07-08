package crash

import (
	"context"
	"log/slog"
	"math"
	"sync/atomic"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

const engineLockKey = "crash:engine:lock"

type RoundState struct {
	RoundID        uuid.UUID  `json:"round_id"`
	RoundNumber    int64      `json:"round_number"`
	Phase          string     `json:"phase"`
	Multiplier     float64    `json:"multiplier"`
	CrashPoint     float64    `json:"crash_point,omitempty"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	RunningSince   *time.Time `json:"running_since,omitempty"`
	ServerSeedHash string     `json:"server_seed_hash"`
}

type BetView struct {
	ID                uuid.UUID `json:"id"`
	UserID            uuid.UUID `json:"user_id"`
	Username          string    `json:"username"`
	FirstName         string    `json:"first_name"`
	PhotoURL          string    `json:"photo_url"`
	AmountNanoton     int64     `json:"amount_nanoton"`
	Status            string    `json:"status"`
	CashoutMultiplier *float64  `json:"cashout_multiplier,omitempty"`
	PayoutNanoton     int64     `json:"payout_nanoton,omitempty"`
}

type RoundBetsState struct {
	RoundID uuid.UUID `json:"round_id"`
	Bets    []BetView `json:"bets"`
}

type TickNotifier interface {
	NotifyGameTick(game string, data []byte)
}

type Service struct {
	games     domain.GameRepository
	balance   *balance.Service
	cache     domain.GameStateCache
	tickMs    int
	notifier  TickNotifier
	memState  atomic.Pointer[RoundState]
	persistCh chan []byte
}

func NewService(games domain.GameRepository, balance *balance.Service, cache domain.GameStateCache, tickMs int) *Service {
	s := &Service{
		games:     games,
		balance:   balance,
		cache:     cache,
		tickMs:    tickMs,
		persistCh: make(chan []byte, 256),
	}
	go s.persistWorker()
	return s
}

func (s *Service) persistWorker() {
	for data := range s.persistCh {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := s.cache.Set(ctx, "crash:round:current", data, 0); err != nil {
			slog.Warn("crash redis set failed", "error", err)
		}
		if err := s.cache.Publish(ctx, "pubsub:game:crash", data); err != nil {
			slog.Warn("crash redis publish failed", "error", err)
		}
		cancel()
	}
}

func (s *Service) SetTickNotifier(notifier TickNotifier) {
	s.notifier = notifier
}

func (s *Service) CurrentState(ctx context.Context) (*RoundState, error) {
	if live := s.memState.Load(); live != nil {
		copy := *live
		return &copy, nil
	}
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

func (s *Service) TryAcquireEngineLock(ctx context.Context) (bool, error) {
	return s.cache.AcquireLock(ctx, engineLockKey, 20*time.Second)
}

func (s *Service) RenewEngineLock(ctx context.Context) error {
	pubCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return s.cache.Set(pubCtx, engineLockKey, []byte("1"), 20*time.Second)
}

func (s *Service) ReleaseEngineLock(ctx context.Context) error {
	return s.cache.ReleaseLock(ctx, engineLockKey)
}

func (s *Service) ActiveBet(ctx context.Context, userID uuid.UUID) (*domain.GameBet, error) {
	state, err := s.CurrentState(ctx)
	if err != nil || state == nil {
		return nil, err
	}
	return s.games.FindPendingBetByUserAndRound(ctx, userID, state.RoundID)
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
	_ = s.PublishBets(ctx, state.RoundID)
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
	if _, err := s.balance.Credit(ctx, userID, payout, domain.LedgerWin, "game_bet", betID); err != nil {
		return 0, err
	}
	_ = s.PublishBets(ctx, state.RoundID)
	return payout, nil
}

func (s *Service) SettleCrashed(ctx context.Context, roundID uuid.UUID) error {
	bets, err := s.games.ListPendingBetsByRound(ctx, roundID)
	if err != nil {
		return err
	}
	for _, bet := range bets {
		_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetLost, 0, nil)
	}
	return s.PublishBets(ctx, roundID)
}

// PublishState updates in-memory state and WS clients immediately; Redis is best-effort async.
func (s *Service) PublishState(ctx context.Context, state *RoundState) error {
	data, err := jsonMarshal(state)
	if err != nil {
		return err
	}

	copy := *state
	s.memState.Store(&copy)

	if s.notifier != nil {
		s.notifier.NotifyGameTick("crash", data)
	}

	select {
	case s.persistCh <- data:
	default:
		slog.Warn("crash persist queue full")
	}
	return nil
}

type HistoryEntry struct {
	RoundID     string  `json:"round_id"`
	RoundNumber int64   `json:"round_number"`
	CrashPoint  float64 `json:"crash_point"`
}

func (s *Service) GetHistory(ctx context.Context, limit int) ([]HistoryEntry, error) {
	rounds, err := s.games.ListRecentFinishedRounds(ctx, domain.GameCrash, limit)
	if err != nil {
		return nil, err
	}
	entries := make([]HistoryEntry, 0, len(rounds))
	for _, round := range rounds {
		var payload struct {
			CrashPoint float64 `json:"crash_point"`
		}
		if len(round.ResultPayload) > 0 {
			_ = jsonUnmarshal(round.ResultPayload, &payload)
		}
		if payload.CrashPoint < 1 {
			continue
		}
		entries = append(entries, HistoryEntry{
			RoundID:     round.ID.String(),
			RoundNumber: round.RoundNumber,
			CrashPoint:  payload.CrashPoint,
		})
	}
	return entries, nil
}

func (s *Service) GetCurrentRoundBets(ctx context.Context) (*RoundBetsState, error) {
	state, err := s.CurrentState(ctx)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return emptyRoundBets(uuid.Nil), nil
	}
	return s.buildRoundBets(ctx, state.RoundID)
}

func (s *Service) buildRoundBets(ctx context.Context, roundID uuid.UUID) (*RoundBetsState, error) {
	bets, err := s.games.ListBetsByRoundWithUser(ctx, roundID)
	if err != nil {
		return nil, err
	}

	views := make([]BetView, 0, len(bets))
	for _, bet := range bets {
		view := BetView{
			ID:            bet.ID,
			UserID:        bet.UserID,
			AmountNanoton: bet.AmountNanoton,
			Status:        string(bet.Status),
			PayoutNanoton: bet.PayoutNanoton,
		}
		if bet.CashoutMultiplier != nil {
			mult := *bet.CashoutMultiplier
			view.CashoutMultiplier = &mult
		}
		if bet.User.ID != uuid.Nil {
			view.Username = bet.User.Username
			view.FirstName = bet.User.FirstName
			view.PhotoURL = bet.User.PhotoURL
		}
		views = append(views, view)
	}

	return &RoundBetsState{
		RoundID: roundID,
		Bets:    views,
	}, nil
}

func emptyRoundBets(roundID uuid.UUID) *RoundBetsState {
	return &RoundBetsState{
		RoundID: roundID,
		Bets:    []BetView{},
	}
}

func (s *Service) PublishBets(ctx context.Context, roundID uuid.UUID) error {
	if s.cache == nil {
		return nil
	}
	state, err := s.buildRoundBets(ctx, roundID)
	if err != nil {
		return err
	}
	data, err := jsonMarshal(state)
	if err != nil {
		return err
	}
	return s.cache.Publish(ctx, "pubsub:game:crash:bets", data)
}
