package risk

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Service struct {
	platform domain.PlatformRepository
	games    domain.GameRepository
	users    domain.UserRepository
	isAdmin  func(telegramID int64) bool
}

func NewService(platform domain.PlatformRepository, games domain.GameRepository, users domain.UserRepository) *Service {
	return &Service{platform: platform, games: games, users: users}
}

func (s *Service) SetAdminChecker(isAdmin func(telegramID int64) bool) {
	s.isAdmin = isAdmin
}

func (s *Service) isTelegramAdmin(telegramID int64) bool {
	return s.isAdmin != nil && telegramID > 0 && s.isAdmin(telegramID)
}

type ModeAccess struct {
	Enabled   bool `json:"enabled"`
	Available bool `json:"available"`
}

// ListModeAccess returns enabled/available flags for all user-facing modes.
func (s *Service) ListModeAccess(ctx context.Context, telegramID int64) (map[string]ModeAccess, error) {
	configs, err := s.platform.ListGameConfigs(ctx)
	if err != nil {
		return nil, err
	}
	byType := make(map[domain.GameType]domain.GameConfig, len(configs))
	for _, cfg := range configs {
		byType[cfg.GameType] = cfg
	}
	admin := s.isTelegramAdmin(telegramID)
	out := make(map[string]ModeAccess, len(domain.AllGameModes))
	for _, mode := range domain.AllGameModes {
		cfg, ok := byType[mode]
		enabled := true
		if ok {
			enabled = cfg.Enabled
		}
		out[string(mode)] = ModeAccess{
			Enabled:   enabled,
			Available: enabled || admin,
		}
	}
	return out, nil
}

// EnsureModeAccess blocks non-admins when a mode is disabled for users.
func (s *Service) EnsureModeAccess(ctx context.Context, gameType domain.GameType, telegramID int64) error {
	cfg, err := s.platform.GetGameConfig(ctx, gameType)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if cfg.Enabled {
		return nil
	}
	if s.isTelegramAdmin(telegramID) {
		return nil
	}
	return domain.ErrGameDisabled
}

type BetCheckInput struct {
	UserID     uuid.UUID
	TelegramID int64
	GameType   domain.GameType
	RoundID    uuid.UUID
	Amount     int64
	MaxPayout  int64
}

func (s *Service) ValidateBet(ctx context.Context, in BetCheckInput) error {
	user, err := s.users.FindByID(ctx, in.UserID)
	if err != nil {
		return err
	}
	if user.IsBanned {
		return domain.ErrUserBanned
	}

	telegramID := in.TelegramID
	if telegramID == 0 {
		telegramID = user.TelegramID
	}
	if err := s.EnsureModeAccess(ctx, in.GameType, telegramID); err != nil {
		return err
	}

	cfg, err := s.platform.GetGameConfig(ctx, in.GameType)
	if err != nil {
		return err
	}
	if in.Amount < cfg.MinBetNanoton {
		return domain.ErrBetBelowMinimum
	}
	if in.Amount > cfg.MaxBetNanoton {
		return domain.ErrBetLimitExceeded
	}
	if in.MaxPayout > cfg.MaxPayoutNanoton {
		return domain.ErrBetLimitExceeded
	}

	settings, err := s.platform.GetRiskSettings(ctx)
	if err != nil {
		return err
	}
	_ = settings

	if in.RoundID != uuid.Nil {
		exposure, err := s.games.SumRoundBets(ctx, in.RoundID)
		if err != nil {
			return err
		}
		if exposure+in.Amount > settings.MaxRoundExposureNanoton {
			return domain.ErrBetLimitExceeded
		}
	}

	since := time.Now().UTC().Truncate(24 * time.Hour)
	dailyWins, err := s.games.SumUserWinsSince(ctx, in.UserID, since)
	if err != nil {
		return err
	}
	if dailyWins >= settings.MaxDailyWinNanoton {
		return domain.ErrDailyWinCap
	}

	return nil
}

type WithdrawalRisk struct {
	Score        int
	Flags        []string
	ReviewReason *string
	NeedsReview  bool
}

func (s *Service) EvaluateWithdrawal(ctx context.Context, userID uuid.UUID, netNanoton int64) (WithdrawalRisk, error) {
	settings, err := s.platform.GetRiskSettings(ctx)
	if err != nil {
		return WithdrawalRisk{}, err
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return WithdrawalRisk{}, err
	}

	flags := make([]string, 0, 4)
	score := 0
	if user.IsBanned {
		flags = append(flags, "banned_user")
		score += 100
	}
	flags = append(flags, user.RiskFlags...)

	if netNanoton >= settings.AutoReviewWithdrawNanoton {
		flags = append(flags, "large_withdrawal")
		score += 50
	}

	since := time.Now().UTC().Truncate(24 * time.Hour)
	dailyWins, err := s.games.SumUserWinsSince(ctx, userID, since)
	if err != nil {
		return WithdrawalRisk{}, err
	}
	if dailyWins >= settings.MaxDailyWinNanoton/2 {
		flags = append(flags, "high_daily_wins")
		score += 30
	}

	held, holdReason, err := s.IsWithdrawHeld(ctx, user)
	if err != nil {
		return WithdrawalRisk{}, err
	}
	if held {
		flags = append(flags, holdReason)
		score += 100
	}

	needsReview := netNanoton >= settings.AutoReviewWithdrawNanoton || score >= 50 || held
	var reason *string
	if needsReview {
		msg := fmt.Sprintf("auto review: score=%d net=%d", score, netNanoton)
		if held {
			msg = holdReason
		}
		reason = &msg
	}

	return WithdrawalRisk{
		Score:        score,
		Flags:        dedupe(flags),
		ReviewReason: reason,
		NeedsReview:  needsReview,
	}, nil
}

// IsWithdrawHeld reports whether TON/gift withdrawals should be soft-held for this user.
func (s *Service) IsWithdrawHeld(ctx context.Context, user *domain.User) (bool, string, error) {
	if user == nil {
		return false, "", nil
	}
	if user.WithdrawalsDisabled {
		return true, "withdrawals_disabled", nil
	}
	settings, err := s.platform.GetWithdrawalSettings(ctx)
	if err != nil {
		return false, "", err
	}
	if settings != nil && settings.Enabled {
		return true, "global_withdrawals_disabled", nil
	}
	return false, "", nil
}

// IsUserWithdrawHeld loads the user and checks the silent withdrawal hold.
func (s *Service) IsUserWithdrawHeld(ctx context.Context, userID uuid.UUID) (bool, string, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return false, "", err
	}
	return s.IsWithdrawHeld(ctx, user)
}

func dedupe(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

// WalletEvaluator adapts risk scoring for the wallet service.
type WalletEvaluator struct {
	*Service
}

func (w WalletEvaluator) EvaluateWithdrawal(ctx context.Context, userID uuid.UUID, netNanoton int64) (int, []string, *string, bool, error) {
	result, err := w.Service.EvaluateWithdrawal(ctx, userID, netNanoton)
	if err != nil {
		return 0, nil, nil, false, err
	}
	return result.Score, result.Flags, result.ReviewReason, result.NeedsReview, nil
}
