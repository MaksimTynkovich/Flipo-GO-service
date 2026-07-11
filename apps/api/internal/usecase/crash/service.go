package crash

import (
	"context"
	"log/slog"
	"math"
	"sync/atomic"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	"github.com/google/uuid"
	"gorm.io/datatypes"
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

type GiftView struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"image_url"`
}

type BetView struct {
	ID                     uuid.UUID `json:"id"`
	UserID                 uuid.UUID `json:"user_id"`
	Username               string    `json:"username"`
	FirstName              string    `json:"first_name"`
	PhotoURL               string    `json:"photo_url"`
	AmountNanoton          int64     `json:"amount_nanoton"`
	FundingType            string    `json:"funding_type"`
	Gift                   *GiftView `json:"gift,omitempty"`
	Status                 string    `json:"status"`
	CashoutMultiplier      *float64  `json:"cashout_multiplier,omitempty"`
	AutoCashoutMultiplier  *float64  `json:"auto_cashout_multiplier,omitempty"`
	PayoutNanoton          int64     `json:"payout_nanoton,omitempty"`
	// Internal-only: never expose bot/sim markers to clients.
	Simulated bool `json:"-"`
}

// BetOverlay merges visual-only ghost bets into round bet feeds.
type BetOverlay interface {
	OnCrashState(roundID uuid.UUID, phase string, multiplier float64, endsAt *time.Time)
	CrashBets(roundID uuid.UUID) []BetView
}

type betSelection struct {
	AutoCashoutMultiplier *float64 `json:"auto_cashout_multiplier,omitempty"`
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
	funding   *betfunding.Service
	inventory domain.InventoryRepository
	cache     domain.GameStateCache
	tickMs    int
	notifier  TickNotifier
	overlay   BetOverlay
	memState  atomic.Pointer[RoundState]
	persistCh chan []byte
}

func NewService(
	games domain.GameRepository,
	balance *balance.Service,
	funding *betfunding.Service,
	inventory domain.InventoryRepository,
	cache domain.GameStateCache,
	tickMs int,
) *Service {
	s := &Service{
		games:     games,
		balance:   balance,
		funding:   funding,
		inventory: inventory,
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

func (s *Service) SetBetOverlay(overlay BetOverlay) {
	s.overlay = overlay
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

func (s *Service) ActiveBets(ctx context.Context, userID uuid.UUID) ([]domain.GameBet, error) {
	state, err := s.CurrentState(ctx)
	if err != nil || state == nil {
		return nil, err
	}
	return s.games.ListPendingBetsByUserAndRound(ctx, userID, state.RoundID)
}

func (s *Service) ActiveBet(ctx context.Context, userID uuid.UUID) (*domain.GameBet, error) {
	bets, err := s.ActiveBets(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(bets) == 0 {
		return nil, nil
	}
	return &bets[0], nil
}

func (s *Service) PlaceBet(ctx context.Context, userID uuid.UUID, stake betfunding.StakeInput, idempotencyKey string, autoCashout *float64) (*domain.GameBet, error) {
	if existing, _ := s.games.FindBetByIdempotency(ctx, idempotencyKey); existing != nil {
		return existing, nil
	}

	state, err := s.CurrentState(ctx)
	if err != nil || state == nil || state.Phase != "betting" {
		return nil, domain.ErrRoundNotOpen
	}

	if autoCashout != nil {
		if *autoCashout < 1.01 || *autoCashout > 1000 || math.IsNaN(*autoCashout) || math.IsInf(*autoCashout, 0) {
			return nil, domain.ErrInvalidAmount
		}
		rounded := math.Floor(*autoCashout*100) / 100
		autoCashout = &rounded
	}

	betID := uuid.New()
	resolved, err := s.funding.ResolveAndLock(ctx, userID, betID, stake, "game_bet")
	if err != nil {
		return nil, err
	}

	selection, _ := jsonMarshal(betSelection{AutoCashoutMultiplier: autoCashout})
	bet := &domain.GameBet{
		ID:              betID,
		RoundID:         state.RoundID,
		UserID:          userID,
		GameType:        domain.GameCrash,
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

	return s.settleCashout(ctx, *target, multiplier)
}

// ProcessAutoCashouts settles pending bets whose auto target has been reached.
// Pays at the configured target (not the live tick), as long as live >= target.
func (s *Service) ProcessAutoCashouts(ctx context.Context, multiplier float64) {
	state, err := s.CurrentState(ctx)
	if err != nil || state == nil || state.Phase != "running" {
		return
	}

	bets, err := s.games.ListPendingBetsByRound(ctx, state.RoundID)
	if err != nil {
		return
	}

	changed := false
	for _, bet := range bets {
		target := autoCashoutFromSelection(bet.Selection)
		if target == nil || multiplier < *target {
			continue
		}
		if _, err := s.settleCashout(ctx, bet, *target); err != nil {
			slog.Warn("crash auto-cashout failed", "bet_id", bet.ID, "error", err)
			continue
		}
		changed = true
	}
	if changed {
		_ = s.PublishBets(ctx, state.RoundID)
	}
}

func (s *Service) settleCashout(ctx context.Context, bet domain.GameBet, multiplier float64) (int64, error) {
	if multiplier < 1 {
		multiplier = 1
	}
	payout := int64(math.Floor(float64(bet.AmountNanoton) * multiplier))
	credit := s.funding.WinTONCredit(bet, payout)
	ok, err := s.games.SettleBet(ctx, bet.ID, domain.BetCashedOut, credit, &multiplier)
	if err != nil || !ok {
		return 0, domain.ErrRoundNotOpen
	}
	if credit > 0 {
		if _, err := s.balance.Credit(ctx, bet.UserID, credit, domain.LedgerWin, "game_bet", bet.ID); err != nil {
			return 0, err
		}
	}
	_ = s.funding.ReleaseOnWin(ctx, bet)
	_ = s.PublishBets(ctx, bet.RoundID)
	return credit, nil
}

func autoCashoutFromSelection(raw datatypes.JSON) *float64 {
	if len(raw) == 0 {
		return nil
	}
	var sel betSelection
	if err := jsonUnmarshal(raw, &sel); err != nil || sel.AutoCashoutMultiplier == nil {
		return nil
	}
	v := *sel.AutoCashoutMultiplier
	if v < 1.01 {
		return nil
	}
	return &v
}

func (s *Service) SettleCrashed(ctx context.Context, roundID uuid.UUID) error {
	bets, err := s.games.ListPendingBetsByRound(ctx, roundID)
	if err != nil {
		return err
	}
	for _, bet := range bets {
		_, _ = s.games.SettleBet(ctx, bet.ID, domain.BetLost, 0, nil)
		_ = s.funding.SettleLoss(ctx, bet)
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

	if s.overlay != nil {
		s.overlay.OnCrashState(state.RoundID, state.Phase, state.Multiplier, state.EndsAt)
	}

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
			FundingType:   string(bet.FundingType),
			Status:        string(bet.Status),
			PayoutNanoton: bet.PayoutNanoton,
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
		if bet.CashoutMultiplier != nil {
			mult := *bet.CashoutMultiplier
			view.CashoutMultiplier = &mult
		}
		if auto := autoCashoutFromSelection(bet.Selection); auto != nil {
			view.AutoCashoutMultiplier = auto
		}
		if bet.User.ID != uuid.Nil {
			view.Username = bet.User.Username
			view.FirstName = bet.User.FirstName
			view.PhotoURL = bet.User.PhotoURL
		}
		views = append(views, view)
	}

	if s.overlay != nil {
		views = append(views, s.overlay.CrashBets(roundID)...)
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
