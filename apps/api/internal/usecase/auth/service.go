package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/campaign"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Claims struct {
	UserID     uuid.UUID `json:"user_id"`
	TelegramID int64     `json:"telegram_id"`
	AdminPanel bool      `json:"admin_panel,omitempty"`
	jwt.RegisteredClaims
}

const adminPanelTokenTTL = 12 * time.Hour

type StartContext struct {
	Param        string `json:"param,omitempty"`
	Kind         string `json:"kind,omitempty"`
	CampaignID   string `json:"campaign_id,omitempty"`
	CampaignCode string `json:"campaign_code,omitempty"`
	Landing      string `json:"landing,omitempty"`
}

type AdminEventNotifier interface {
	NotifyReferralJoined(ctx context.Context, actor, referrer telegram.AdminActor)
	NotifyBotStart(ctx context.Context, actor telegram.AdminActor, attr telegram.BotStartAttribution)
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
	campaigns           *campaign.Service
	adminEvents         AdminEventNotifier
	adminLoginAlerter   AdminLoginAlerter
	adminLogins         *adminLoginStore
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

func WithCampaigns(campaigns *campaign.Service) ServiceOption {
	return func(s *Service) {
		s.campaigns = campaigns
	}
}

func (s *Service) DebugAuthEnabled() bool {
	return s.debugAuthEnabled
}

func (s *Service) Authenticate(ctx context.Context, initData string, referralCode string) (string, *domain.User, StartContext, error) {
	parsed, err := telegram.ValidateInitData(initData, s.botToken, 24*time.Hour)
	if err != nil {
		return "", nil, StartContext{}, err
	}

	startParam := strings.TrimSpace(parsed.StartParam)
	if startParam == "" {
		startParam = strings.TrimSpace(referralCode)
	}
	payload := campaign.ParseStartPayload(startParam)
	start := StartContext{Param: payload.Raw, Kind: payload.Kind}

	user := &domain.User{
		ID:          uuid.New(),
		TelegramID:  parsed.User.ID,
		Username:    parsed.User.Username,
		FirstName:   parsed.User.FirstName,
		LastName:    parsed.User.LastName,
		PhotoURL:    parsed.User.PhotoURL,
		Locale:      domain.DefaultLocale,
		StakingTier: domain.TierBase,
	}

	existing, findErr := s.users.FindByTelegramID(ctx, parsed.User.ID)
	isNew := errors.Is(findErr, gorm.ErrRecordNotFound)
	if findErr != nil && !isNew {
		return "", nil, StartContext{}, findErr
	}
	if existing != nil {
		if existing.IsBanned {
			return "", nil, StartContext{}, domain.ErrUserBanned
		}
		user.ID = existing.ID
		user.BettingBalance = existing.BettingBalance
		user.StakingTier = existing.StakingTier
		user.TonWallet = existing.TonWallet
		user.ReferrerID = existing.ReferrerID
		user.CampaignID = existing.CampaignID
		user.AcquisitionPayload = existing.AcquisitionPayload
		user.Locale = domain.NormalizeLocale(existing.Locale)
	}

	if err := s.users.Upsert(ctx, user); err != nil {
		return "", nil, StartContext{}, err
	}

	var matchedCampaign *domain.Campaign
	if payload.Kind == campaign.KindCampaign && s.campaigns != nil {
		if found, err := s.campaigns.FindByCode(ctx, payload.CampaignCode); err == nil {
			matchedCampaign = found
		}
		if matchedCampaign != nil {
			start.CampaignID = matchedCampaign.ID.String()
			start.CampaignCode = matchedCampaign.Code
			start.Landing = matchedCampaign.Landing
		}
	}

	if isNew && payload.Raw != "" {
		if ok, err := s.users.SetAcquisitionPayloadIfEmpty(ctx, user.ID, payload.Raw); err == nil && ok {
			user.AcquisitionPayload = payload.Raw
		}
		if matchedCampaign != nil {
			assigned, err := s.users.SetCampaignIfEmpty(ctx, user.ID, matchedCampaign.ID)
			if err == nil && assigned {
				cid := matchedCampaign.ID
				user.CampaignID = &cid
				s.analytics.Track(ctx, analyticsuc.EventInput{
					UserID:        &user.ID,
					TelegramID:    &user.TelegramID,
					Source:        "api",
					EventName:     "campaign_assigned",
					EventCategory: "acquisition",
					Status:        "success",
					StartParam:    payload.Raw,
					StakingTier:   string(user.StakingTier),
					Properties: map[string]any{
						"source":        "campaign",
						"is_new":        isNew,
						"campaign_id":   matchedCampaign.ID.String(),
						"campaign_code": matchedCampaign.Code,
					},
				})
			}
		}
	}

	if isNew && s.referrals != nil && payload.Kind == campaign.KindReferral {
		code := payload.Raw
		if strings.TrimSpace(referralCode) != "" && campaign.ParseStartPayload(referralCode).Kind == campaign.KindReferral {
			code = referralCode
		}
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

	if isNew && s.adminEvents != nil && payload.Raw != "" && payload.Kind != campaign.KindReferral {
		s.adminEvents.NotifyBotStart(ctx,
			telegram.AdminActor{
				TelegramID: user.TelegramID,
				Username:   user.Username,
				FirstName:  user.FirstName,
				LastName:   user.LastName,
			},
			telegram.ResolveBotStartAttribution(ctx, s.campaigns, payload.Raw),
		)
	}

	token, err := s.issueToken(user)
	if err != nil {
		return "", nil, StartContext{}, err
	}
	authSource := "direct"
	switch {
	case user.ReferrerID != nil || payload.Kind == campaign.KindReferral:
		authSource = "referral"
	case payload.Kind == campaign.KindCampaign:
		authSource = "campaign"
	}
	props := map[string]any{
		"is_new": isNew,
		"source": authSource,
	}
	if start.CampaignCode != "" {
		props["campaign_code"] = start.CampaignCode
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		ReferrerID:    user.ReferrerID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_succeeded",
		EventCategory: "auth",
		Status:        "success",
		StartParam:    payload.Raw,
		StakingTier:   string(user.StakingTier),
		Properties:    props,
	})
	return token, user, start, nil
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
		Locale:         domain.DefaultLocale,
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
		user.Locale = domain.NormalizeLocale(existing.Locale)
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

func (s *Service) UpdateLocale(ctx context.Context, userID uuid.UUID, locale string) (*domain.User, error) {
	normalized := domain.NormalizeLocale(locale)
	if err := s.users.UpdateLocale(ctx, userID, normalized); err != nil {
		return nil, err
	}
	return s.users.FindByID(ctx, userID)
}
