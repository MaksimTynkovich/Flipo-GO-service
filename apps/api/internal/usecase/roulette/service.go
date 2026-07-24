package roulette

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
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

type GiftView struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"image_url"`
}

type BetView struct {
	ID            uuid.UUID `json:"id"`
	UserID        uuid.UUID `json:"user_id"`
	Username      string    `json:"username"`
	FirstName     string    `json:"first_name"`
	PhotoURL      string    `json:"photo_url"`
	Color         string    `json:"color"`
	AmountNanoton int64     `json:"amount_nanoton"`
	FundingType   string    `json:"funding_type"`
	Gift          *GiftView `json:"gift,omitempty"`
	// Internal-only: never expose bot/sim markers to clients.
	Simulated bool `json:"-"`
}

// BetOverlay merges visual-only ghost bets into roulette bet feeds.
type BetOverlay interface {
	OnRouletteState(roundID uuid.UUID, phase string, endsAt *time.Time, resultColor string)
	RouletteBets(roundID uuid.UUID) []BetView
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
	games     domain.GameRepository
	users     domain.UserRepository
	balance   *balance.Service
	funding   *betfunding.Service
	inventory domain.InventoryRepository
	cache     domain.GameStateCache
	bettingS  int
	spinS     int
	overlay   BetOverlay
	admin     AdminGameNotifier
	betHook   func(context.Context, uuid.UUID, int64)
}

type AdminGameNotifier interface {
	NotifyGameResult(ctx context.Context, actor telegram.AdminActor, game, outcome, selection string, stakeNanoton, payoutNanoton int64, multiplier, crashPoint *float64, resultLabel string)
}

func (s *Service) SetQualifyingBetHook(hook func(context.Context, uuid.UUID, int64)) {
	s.betHook = hook
}

func (s *Service) SetAdminNotifier(notifier AdminGameNotifier) {
	s.admin = notifier
}

func (s *Service) SetUsers(users domain.UserRepository) {
	s.users = users
}

func NewService(
	games domain.GameRepository,
	balance *balance.Service,
	funding *betfunding.Service,
	inventory domain.InventoryRepository,
	cache domain.GameStateCache,
	bettingS, spinS int,
) *Service {
	return &Service{games: games, balance: balance, funding: funding, inventory: inventory, cache: cache, bettingS: bettingS, spinS: spinS}
}

func (s *Service) SetBetOverlay(overlay BetOverlay) {
	s.overlay = overlay
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

func (s *Service) PlaceBet(ctx context.Context, userID uuid.UUID, color string, stake betfunding.StakeInput, idempotencyKey string) (*domain.GameBet, error) {
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
	resolved, err := s.funding.ResolveAndLock(ctx, userID, betID, stake, "game_bet")
	if err != nil {
		return nil, err
	}

	selection, _ := json.Marshal(map[string]string{"color": color})
	bet := &domain.GameBet{
		ID:              betID,
		RoundID:         state.RoundID,
		UserID:          userID,
		GameType:        domain.GameRoulette,
		AmountNanoton:   resolved.AmountNanoton,
		FundingType:     resolved.FundingType,
		InventoryItemID: resolved.InventoryItemID,
		Selection:       datatypes.JSON(selection),
		Status:          domain.BetPending,
		IdempotencyKey:  idempotencyKey,
		CreatedAt:       time.Now().UTC(),
	}
	if err := s.games.CreateBet(ctx, bet); err != nil {
		s.funding.Rollback(ctx, userID, betID, resolved, "game_bet")
		return nil, err
	}
	if s.betHook != nil {
		s.betHook(ctx, userID, resolved.AmountNanoton)
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

	type colorAgg struct {
		userID uuid.UUID
		color  string
		count  int
		stake  int64
		payout int64
		won    bool
	}
	// One admin notification per user per color (multiple bets on the same color → one row).
	aggs := make(map[string]*colorAgg, len(bets))

	for _, bet := range bets {
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		betColor := sel["color"]

		var credit int64
		won := betColor == result
		if won {
			gross := provablyfair.RoulettePayout(result, bet.AmountNanoton)
			credit = s.funding.WinTONCredit(bet, gross)
			_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetWon, credit, nil)
			if credit > 0 {
				_, _ = s.balance.Credit(ctx, bet.UserID, credit, domain.LedgerWin, "game_bet", bet.ID)
			}
			_ = s.funding.ReleaseOnWin(ctx, bet)
		} else {
			_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetLost, 0, nil)
			_ = s.funding.SettleLoss(ctx, bet)
		}

		key := bet.UserID.String() + "|" + betColor
		agg := aggs[key]
		if agg == nil {
			agg = &colorAgg{userID: bet.UserID, color: betColor, won: won}
			aggs[key] = agg
		}
		agg.count++
		agg.stake += bet.AmountNanoton
		agg.payout += credit
	}

	if s.admin != nil && len(aggs) > 0 {
		resultLbl := fmt.Sprintf("выпало %s (%d)", rouletteColorLabel(result), resultNumber)
		for _, agg := range aggs {
			outcome := "lose"
			if agg.won {
				outcome = "win"
			}
			selection := rouletteColorLabel(agg.color)
			if agg.count > 1 {
				selection = fmt.Sprintf("%s · %s", selection, rouletteBetsCountLabel(agg.count))
			}
			s.admin.NotifyGameResult(
				ctx,
				s.actorForUser(ctx, agg.userID),
				"roulette",
				outcome,
				selection,
				agg.stake,
				agg.payout,
				nil,
				nil,
				resultLbl,
			)
		}
	}

	_ = s.PublishBets(ctx, roundID)
	return nil
}

func rouletteColorLabel(color string) string {
	switch color {
	case "red":
		return "красное"
	case "black":
		return "чёрное"
	case "green":
		return "зелёное"
	default:
		return color
	}
}

func rouletteBetsCountLabel(n int) string {
	if n <= 1 {
		return ""
	}
	mod100 := n % 100
	mod10 := n % 10
	switch {
	case mod100 >= 11 && mod100 <= 14:
		return fmt.Sprintf("%d ставок", n)
	case mod10 == 1:
		return fmt.Sprintf("%d ставка", n)
	case mod10 >= 2 && mod10 <= 4:
		return fmt.Sprintf("%d ставки", n)
	default:
		return fmt.Sprintf("%d ставок", n)
	}
}

func (s *Service) actorForUser(ctx context.Context, userID uuid.UUID) telegram.AdminActor {
	if s.users == nil {
		return telegram.AdminActor{}
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user == nil {
		return telegram.AdminActor{}
	}
	return telegram.AdminActor{
		TelegramID: user.TelegramID,
		Username:   user.Username,
		FirstName:  user.FirstName,
		LastName:   user.LastName,
	}
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
	// Include settled bets so the player list stays visible through the result phase.
	bets, err := s.games.ListBetsByRoundWithUser(ctx, roundID)
	if err != nil {
		return nil, err
	}

	views := make([]BetView, 0, len(bets))
	totals := ColorTotals{}
	counts := ColorCounts{}

	for _, bet := range bets {
		if bet.Status == domain.BetRefunded {
			continue
		}
		var sel map[string]string
		_ = json.Unmarshal(bet.Selection, &sel)
		color := sel["color"]

		view := BetView{
			ID:            bet.ID,
			UserID:        bet.UserID,
			Color:         color,
			AmountNanoton: bet.AmountNanoton,
			FundingType:   string(bet.FundingType),
		}
		if bet.InventoryItemID != nil && s.inventory != nil {
			if item, err := s.inventory.FindByID(ctx, *bet.InventoryItemID); err == nil {
				view.Gift = &GiftView{
					ID:       item.ID.String(),
					Name:     item.Name,
					ImageURL: item.ImageURL,
				}
			}
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

	if s.overlay != nil {
		for _, ghost := range s.overlay.RouletteBets(roundID) {
			views = append(views, ghost)
			switch ghost.Color {
			case "red":
				totals.Red += ghost.AmountNanoton
				counts.Red++
			case "green":
				totals.Green += ghost.AmountNanoton
				counts.Green++
			case "black":
				totals.Black += ghost.AmountNanoton
				counts.Black++
			}
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
	if s.overlay != nil {
		endsAt := state.EndsAt
		s.overlay.OnRouletteState(state.RoundID, state.Phase, &endsAt, state.Result)
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
