package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Claims struct {
	UserID      uuid.UUID `json:"user_id"`
	TelegramID  int64     `json:"telegram_id"`
	AdminPanel  bool      `json:"admin_panel,omitempty"`
	jwt.RegisteredClaims
}

const adminPanelTokenTTL = 12 * time.Hour

type AdminEventNotifier interface {
	NotifyReferralJoined(ctx context.Context, actor, referrer telegram.AdminActor)
}

type Service struct {
	users               domain.UserRepository
	referrals           *referral.Service
	botToken            string
	jwtSecret           []byte
	jwtExpiry           time.Duration
	adminTelegramIDs    map[int64]struct{}
	adminTelegramOrder  []int64
	adminPanelPassword  string
	debugAuthEnabled    bool
	debugTelegramID     int64
	debugUsername       string
	debugInitialBalance int64
	analytics           *analyticsuc.Service
	adminEvents         AdminEventNotifier
}

func NewService(users domain.UserRepository, botToken string, jwtSecret string, jwtExpiry time.Duration, referrals *referral.Service, opts ...ServiceOption) *Service {
	s := &Service{
		users:     users,
		referrals: referrals,
		botToken:  botToken,
		jwtSecret: []byte(jwtSecret),
		jwtExpiry: jwtExpiry,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

type ServiceOption func(*Service)

func WithDebugAuth(enabled bool, telegramID int64, username string, initialBalance int64) ServiceOption {
	return func(s *Service) {
		s.debugAuthEnabled = enabled
		s.debugTelegramID = telegramID
		s.debugUsername = username
		s.debugInitialBalance = initialBalance
	}
}

func WithAdminTelegramIDs(ids []int64) ServiceOption {
	return func(s *Service) {
		if s.adminTelegramIDs == nil {
			s.adminTelegramIDs = make(map[int64]struct{}, len(ids))
		}
		s.adminTelegramOrder = append([]int64(nil), ids...)
		for _, id := range ids {
			s.adminTelegramIDs[id] = struct{}{}
		}
	}
}

func WithAdminPanelPassword(password string) ServiceOption {
	return func(s *Service) {
		s.adminPanelPassword = password
	}
}

func WithAnalytics(analyticsSvc *analyticsuc.Service) ServiceOption {
	return func(s *Service) {
		s.analytics = analyticsSvc
	}
}

func WithAdminEvents(notifier AdminEventNotifier) ServiceOption {
	return func(s *Service) {
		s.adminEvents = notifier
	}
}

func (s *Service) DebugAuthEnabled() bool {
	return s.debugAuthEnabled
}

func (s *Service) Authenticate(ctx context.Context, initData string, referralCode string) (string, *domain.User, error) {
	parsed, err := telegram.ValidateInitData(initData, s.botToken, 24*time.Hour)
	if err != nil {
		return "", nil, err
	}

	code := referralCode
	if code == "" {
		code = parsed.StartParam
	}

	user := &domain.User{
		ID:          uuid.New(),
		TelegramID:  parsed.User.ID,
		Username:    parsed.User.Username,
		FirstName:   parsed.User.FirstName,
		LastName:    parsed.User.LastName,
		PhotoURL:    parsed.User.PhotoURL,
		StakingTier: domain.TierBase,
	}

	existing, findErr := s.users.FindByTelegramID(ctx, parsed.User.ID)
	isNew := errors.Is(findErr, gorm.ErrRecordNotFound)
	if findErr != nil && !isNew {
		return "", nil, findErr
	}
	if existing != nil {
		if existing.IsBanned {
			return "", nil, domain.ErrUserBanned
		}
		user.ID = existing.ID
		user.BettingBalance = existing.BettingBalance
		user.StakingTier = existing.StakingTier
		user.TonWallet = existing.TonWallet
		user.ReferrerID = existing.ReferrerID
	}

	if err := s.users.Upsert(ctx, user); err != nil {
		return "", nil, err
	}

	if isNew && s.referrals != nil && code != "" {
		_ = s.referrals.TryAssignReferrer(ctx, user.ID, code)
		if refreshed, err := s.users.FindByID(ctx, user.ID); err == nil && refreshed != nil {
			user = refreshed
		}
		if user.ReferrerID != nil {
			s.analytics.Track(ctx, analyticsuc.EventInput{
				UserID:        &user.ID,
				ReferrerID:    user.ReferrerID,
				TelegramID:    &user.TelegramID,
				Source:        "api",
				EventName:     "referral_assigned",
				EventCategory: "acquisition",
				Status:        "success",
				StartParam:    code,
				StakingTier:   string(user.StakingTier),
				Properties: map[string]any{
					"source": "referral",
					"is_new": isNew,
				},
			})
			if s.adminEvents != nil {
				if referrer, err := s.users.FindByID(ctx, *user.ReferrerID); err == nil && referrer != nil {
					s.adminEvents.NotifyReferralJoined(ctx,
						telegram.AdminActor{
							TelegramID: user.TelegramID,
							Username:   user.Username,
							FirstName:  user.FirstName,
							LastName:   user.LastName,
						},
						telegram.AdminActor{
							TelegramID: referrer.TelegramID,
							Username:   referrer.Username,
							FirstName:  referrer.FirstName,
							LastName:   referrer.LastName,
						},
					)
				}
			}
		}
	}

	token, err := s.issueToken(user)
	if err != nil {
		return "", nil, err
	}
	authSource := "direct"
	if code != "" {
		authSource = "referral"
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		ReferrerID:    user.ReferrerID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_succeeded",
		EventCategory: "auth",
		Status:        "success",
		StartParam:    code,
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"is_new": isNew,
			"source": authSource,
		},
	})
	return token, user, nil
}

func (s *Service) AuthenticateDebug(ctx context.Context) (string, *domain.User, error) {
	if !s.debugAuthEnabled {
		return "", nil, errors.New("debug auth disabled")
	}

	user := &domain.User{
		ID:             uuid.New(),
		TelegramID:     s.debugTelegramID,
		Username:       s.debugUsername,
		FirstName:      "Debug",
		LastName:       "User",
		StakingTier:    domain.TierBase,
		BettingBalance: s.debugInitialBalance,
	}

	existing, err := s.users.FindByTelegramID(ctx, s.debugTelegramID)
	if err == nil && existing != nil {
		if existing.IsBanned {
			return "", nil, domain.ErrUserBanned
		}
		user.ID = existing.ID
		user.BettingBalance = existing.BettingBalance
		user.StakingTier = existing.StakingTier
		user.TonWallet = existing.TonWallet
	}

	if err := s.users.Upsert(ctx, user); err != nil {
		return "", nil, err
	}

	token, err := s.issueToken(user)
	if err != nil {
		return "", nil, err
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_debug_succeeded",
		EventCategory: "auth",
		Status:        "success",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"source": "debug",
		},
	})
	return token, user, nil
}

func (s *Service) issueToken(user *domain.User) (string, error) {
	return s.issueTokenWithOpts(user, false, s.jwtExpiry)
}

func (s *Service) issueTokenWithOpts(user *domain.User, adminPanel bool, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID:     user.ID,
		TelegramID: user.TelegramID,
		AdminPanel: adminPanel,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *Service) AdminPanelPasswordConfigured() bool {
	return s.adminPanelPassword != ""
}

// AuthenticateAdminPanel issues a JWT for browser /admin login (no Telegram initData).
// Actor is the first ADMIN_TELEGRAM_IDS user that already exists in the DB.
func (s *Service) AuthenticateAdminPanel(ctx context.Context, password string) (string, *domain.User, error) {
	if s.adminPanelPassword == "" {
		return "", nil, domain.ErrAdminPasswordNotSet
	}
	if subtle.ConstantTimeCompare([]byte(password), []byte(s.adminPanelPassword)) != 1 {
		return "", nil, domain.ErrAdminPasswordInvalid
	}
	if len(s.adminTelegramOrder) == 0 {
		return "", nil, domain.ErrAdminActorMissing
	}

	var user *domain.User
	for _, telegramID := range s.adminTelegramOrder {
		found, err := s.users.FindByTelegramID(ctx, telegramID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return "", nil, err
		}
		if found != nil {
			if found.IsBanned {
				return "", nil, domain.ErrUserBanned
			}
			user = found
			break
		}
	}
	if user == nil {
		return "", nil, domain.ErrAdminActorMissing
	}

	token, err := s.issueTokenWithOpts(user, true, adminPanelTokenTTL)
	if err != nil {
		return "", nil, err
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_admin_panel_succeeded",
		EventCategory: "auth",
		Status:        "success",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"source": "admin_panel",
		},
	})
	return token, user, nil
}

func (s *Service) ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("Недействительный токен")
	}
	return claims, nil
}

func (s *Service) GetUser(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	return s.users.FindByID(ctx, userID)
}

func (s *Service) IsAdmin(telegramID int64) bool {
	if len(s.adminTelegramIDs) == 0 {
		return false
	}
	_, ok := s.adminTelegramIDs[telegramID]
	return ok
}

func (s *Service) CanAccessAdmin(claims *Claims) bool {
	if s == nil || claims == nil {
		return false
	}
	if s.IsAdmin(claims.TelegramID) {
		return true
	}
	return claims.AdminPanel && s.AdminPanelPasswordConfigured()
}

func (s *Service) UpdateWallet(ctx context.Context, userID uuid.UUID, wallet string) (string, error) {
	normalized, err := ton.NormalizeAddress(wallet)
	if err != nil {
		return "", domain.ErrInvalidWallet
	}
	if err := s.users.UpdateWallet(ctx, userID, normalized); err != nil {
		return "", err
	}
	return normalized, nil
}

func (s *Service) ClearWallet(ctx context.Context, userID uuid.UUID) error {
	return s.users.UpdateWallet(ctx, userID, "")
}
