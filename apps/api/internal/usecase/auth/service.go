package auth

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID     uuid.UUID `json:"user_id"`
	TelegramID int64     `json:"telegram_id"`
	jwt.RegisteredClaims
}

type Service struct {
	users               domain.UserRepository
	botToken            string
	jwtSecret           []byte
	jwtExpiry           time.Duration
	debugAuthEnabled    bool
	debugTelegramID     int64
	debugUsername       string
	debugInitialBalance int64
}

func NewService(users domain.UserRepository, botToken string, jwtSecret string, jwtExpiry time.Duration, opts ...ServiceOption) *Service {
	s := &Service{
		users:     users,
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

func (s *Service) DebugAuthEnabled() bool {
	return s.debugAuthEnabled
}

func (s *Service) Authenticate(ctx context.Context, initData string) (string, *domain.User, error) {
	parsed, err := telegram.ValidateInitData(initData, s.botToken, 24*time.Hour)
	if err != nil {
		return "", nil, err
	}

	user := &domain.User{
		ID:         uuid.New(),
		TelegramID: parsed.User.ID,
		Username:   parsed.User.Username,
		FirstName:  parsed.User.FirstName,
		LastName:   parsed.User.LastName,
		PhotoURL:   parsed.User.PhotoURL,
		StakingTier: domain.TierBase,
	}

	existing, err := s.users.FindByTelegramID(ctx, parsed.User.ID)
	if err == nil && existing != nil {
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
	return token, user, nil
}

func (s *Service) issueToken(user *domain.User) (string, error) {
	claims := Claims{
		UserID:     user.ID,
		TelegramID: user.TelegramID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
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
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *Service) GetUser(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	return s.users.FindByID(ctx, userID)
}

func (s *Service) UpdateWallet(ctx context.Context, userID uuid.UUID, wallet string) error {
	return s.users.UpdateWallet(ctx, userID, wallet)
}
