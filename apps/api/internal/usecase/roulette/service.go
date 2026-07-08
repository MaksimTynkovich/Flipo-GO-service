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
	SpinEndsAt     time.Time `json:"spin_ends_at,omitempty"`
	ServerSeedHash string    `json:"server_seed_hash"`
	ResultIndex    *int      `json:"result_index,omitempty"`
	ResultNumber   *int      `json:"result_number,omitempty"`
	Result         string    `json:"result,omitempty"`
	ServerSeed     string    `json:"server_seed,omitempty"`
}

type BetView struct {
	ID            uuid.UUID `json:"id"`
	UserID        uuid.UUID `json:"user_id"`
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	PhotoURL      string    `json:"photo_url"`
	Color         string    `json:"color"`
	AmountNanoton int64     `json:"amount_nanoton"`
}

type ColorTotals struct {
	Red   int64 `json:"red"`
	Green int64 `json:"green"`
	Black int64 `json:"black"`
}

type ColorCounts struct {
	Red   int `json:"red"`
	Green int `json:"green"`
	Black int `json:"black"`
}

type RoundBetsState struct {
	RoundID uuid.UUID   `json:"round_id"`
	Bets    []BetView   `json:"bets"`
	Totals  ColorTotals `json:"totals"`
	Counts  ColorCounts `json:"counts"`
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
	_ = s.PublishBets(ctx, state.RoundID)
	return bet, nil
}

func (s *Service) SettleRound(ctx context.Context, roundID uuid.UUID, serverSeed string, nonce int64) error {
	resultIndex := provablyfair.RouletteResultIndex(serverSeed, nonce)
	resultNumber := provablyfair.RouletteWheelNumber(resultIndex)
	result := provablyfair.RouletteNumberColor(resultNumber)
	resultJSON, _ := json.Marshal(map[string]interface{}{
		"color":  result,
		"number": resultNumber,
		"index":  resultIndex,
	})

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
	bets, err := s.games.ListPendingBetsByRoundWithUser(ctx, roundID)
	if err != nil {
		return nil, err
	}

	views := make([]BetView, 0, len(bets))
	totals := ColorTotals{}
	counts := ColorCounts{}

	for _, bet := range bets {
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		color := sel["color"]

		view := BetView{
			ID:            bet.ID,
			UserID:        bet.UserID,
			Color:         color,
			AmountNanoton: bet.AmountNanoton,
		}
		if bet.User.ID != uuid.Nil {
			view.Username = bet.User.Username
			view.FirstName = bet.User.FirstName
			view.PhotoURL = bet.User.PhotoURL
		}

		views = append(views, view)
		switch color {
		case "red":
			totals.Red += bet.AmountNanoton
			counts.Red++
		case "green":
			totals.Green += bet.AmountNanoton
			counts.Green++
		case "black":
			totals.Black += bet.AmountNanoton
			counts.Black++
		}
	}

	return &RoundBetsState{
		RoundID: roundID,
		Bets:    views,
		Totals:  totals,
		Counts:  counts,
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
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return s.cache.Publish(ctx, "pubsub:game:roulette:bets", data)
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
	_ = s.PublishBets(ctx, round.ID)
	return round, nil
}

func (s *Service) UpdatePhase(ctx context.Context, state *RoundState) error {
	return s.PublishState(ctx, state)
}

type HistoryEntry struct {
	RoundID     string `json:"round_id"`
	RoundNumber int64  `json:"round_number"`
	Number      int    `json:"number"`
	Color       string `json:"color"`
}

func (s *Service) GetHistory(ctx context.Context, limit int) ([]HistoryEntry, error) {
	rounds, err := s.games.ListRecentFinishedRounds(ctx, domain.GameRoulette, limit)
	if err != nil {
		return nil, err
	}
	entries := make([]HistoryEntry, 0, len(rounds))
	for _, round := range rounds {
		var payload struct {
			Color  string `json:"color"`
			Number int    `json:"number"`
		}
		if len(round.ResultPayload) > 0 {
			_ = json.Unmarshal(round.ResultPayload, &payload)
		}
		if payload.Color == "" {
			continue
		}
		entries = append(entries, HistoryEntry{
			RoundID:     round.ID.String(),
			RoundNumber: round.RoundNumber,
			Number:      payload.Number,
			Color:       payload.Color,
		})
	}
	return entries, nil
}

func ColorLabel(n int) string {
	return fmt.Sprintf("round-%d", n)
}
