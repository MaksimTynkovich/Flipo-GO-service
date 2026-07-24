package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const adminLoginChallengeTTL = 5 * time.Minute

type AdminLoginStatus string

const (
	AdminLoginPending  AdminLoginStatus = "pending"
	AdminLoginApproved AdminLoginStatus = "approved"
	AdminLoginDenied   AdminLoginStatus = "denied"
	AdminLoginExpired  AdminLoginStatus = "expired"
)

type AdminLoginChallenge struct {
	ID             string
	UserID         uuid.UUID
	TelegramID     int64
	Username       string
	FirstName      string
	LastName       string
	IP             string
	UserAgent      string
	Status         AdminLoginStatus
	Token          string
	ApprovedBy     int64
	CreatedAt      time.Time
	ResolvedAt     *time.Time
}

type AdminLoginAlerter interface {
	AlertAdminPanelLogin(ctx context.Context, challengeID string, actor telegram.AdminActor, ip, userAgent string)
}

func (s *Service) SetAdminLoginAlerter(alerter AdminLoginAlerter) {
	s.adminLoginAlerter = alerter
}

type adminLoginStore struct {
	mu   sync.Mutex
	byID map[string]*AdminLoginChallenge
}

func (s *Service) ensureLoginStore() *adminLoginStore {
	if s.adminLogins == nil {
		s.adminLogins = &adminLoginStore{byID: make(map[string]*AdminLoginChallenge)}
	}
	return s.adminLogins
}

// RequestAdminPanelLogin validates the password and creates a pending challenge
// that must be approved via Telegram by an allowlisted admin.
func (s *Service) RequestAdminPanelLogin(ctx context.Context, password, ip, userAgent string) (*AdminLoginChallenge, error) {
	if s.adminPanelPassword == "" {
		return nil, domain.ErrAdminPasswordNotSet
	}
	if subtle.ConstantTimeCompare([]byte(password), []byte(s.adminPanelPassword)) != 1 {
		return nil, domain.ErrAdminPasswordInvalid
	}
	if len(s.adminTelegramOrder) == 0 {
		return nil, domain.ErrAdminActorMissing
	}

	var user *domain.User
	for _, telegramID := range s.adminTelegramOrder {
		found, err := s.users.FindByTelegramID(ctx, telegramID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return nil, err
		}
		if found != nil {
			if found.IsBanned {
				return nil, domain.ErrUserBanned
			}
			user = found
			break
		}
	}
	if user == nil {
		return nil, domain.ErrAdminActorMissing
	}

	id, err := newChallengeID()
	if err != nil {
		return nil, err
	}
	ch := &AdminLoginChallenge{
		ID:         id,
		UserID:     user.ID,
		TelegramID: user.TelegramID,
		Username:   user.Username,
		FirstName:  user.FirstName,
		LastName:   user.LastName,
		IP:         ip,
		UserAgent:  userAgent,
		Status:     AdminLoginPending,
		CreatedAt:  time.Now().UTC(),
	}
	store := s.ensureLoginStore()
	store.mu.Lock()
	s.pruneLoginChallengesLocked(store, time.Now().UTC())
	store.byID[id] = ch
	store.mu.Unlock()

	if s.adminLoginAlerter != nil {
		s.adminLoginAlerter.AlertAdminPanelLogin(ctx, id, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, ip, userAgent)
	}

	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_admin_panel_pending",
		EventCategory: "auth",
		Status:        "pending",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"source":       "admin_panel",
			"challenge_id": id,
			"ip":           ip,
		},
	})

	out := *ch
	return &out, nil
}

// GetAdminPanelLoginStatus returns the current challenge state (and token if approved).
func (s *Service) GetAdminPanelLoginStatus(ctx context.Context, challengeID string) (*AdminLoginChallenge, error) {
	store := s.ensureLoginStore()
	store.mu.Lock()
	defer store.mu.Unlock()
	s.pruneLoginChallengesLocked(store, time.Now().UTC())
	ch, ok := store.byID[challengeID]
	if !ok || ch == nil {
		return nil, domain.ErrAdminLoginNotFound
	}
	if ch.Status == AdminLoginPending && time.Since(ch.CreatedAt) > adminLoginChallengeTTL {
		ch.Status = AdminLoginExpired
		now := time.Now().UTC()
		ch.ResolvedAt = &now
	}
	out := *ch
	return &out, nil
}

// ApproveAdminLogin issues the JWT after an allowlisted admin presses Approve in Telegram.
func (s *Service) ApproveAdminLogin(ctx context.Context, challengeID string, approverTelegramID int64) error {
	if !s.IsAdmin(approverTelegramID) {
		return domain.ErrForbidden
	}
	store := s.ensureLoginStore()
	store.mu.Lock()
	defer store.mu.Unlock()
	s.pruneLoginChallengesLocked(store, time.Now().UTC())
	ch, ok := store.byID[challengeID]
	if !ok || ch == nil {
		return domain.ErrAdminLoginNotFound
	}
	if ch.Status == AdminLoginPending && time.Since(ch.CreatedAt) > adminLoginChallengeTTL {
		ch.Status = AdminLoginExpired
		now := time.Now().UTC()
		ch.ResolvedAt = &now
	}
	switch ch.Status {
	case AdminLoginApproved:
		return nil
	case AdminLoginDenied:
		return domain.ErrAdminLoginDenied
	case AdminLoginExpired:
		return domain.ErrAdminLoginExpired
	case AdminLoginPending:
		// continue
	default:
		return domain.ErrAdminLoginNotFound
	}

	user, err := s.users.FindByID(ctx, ch.UserID)
	if err != nil || user == nil {
		return domain.ErrAdminActorMissing
	}
	if user.IsBanned {
		return domain.ErrUserBanned
	}
	token, err := s.issueTokenWithOpts(user, true, adminPanelTokenTTL)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	ch.Status = AdminLoginApproved
	ch.Token = token
	ch.ApprovedBy = approverTelegramID
	ch.ResolvedAt = &now

	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &user.ID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "auth_admin_panel_succeeded",
		EventCategory: "auth",
		Status:        "success",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"source":       "admin_panel",
			"challenge_id": challengeID,
			"approved_by":  approverTelegramID,
		},
	})
	return nil
}

// DenyAdminLogin rejects a pending challenge.
func (s *Service) DenyAdminLogin(ctx context.Context, challengeID string, approverTelegramID int64) error {
	if !s.IsAdmin(approverTelegramID) {
		return domain.ErrForbidden
	}
	store := s.ensureLoginStore()
	store.mu.Lock()
	defer store.mu.Unlock()
	s.pruneLoginChallengesLocked(store, time.Now().UTC())
	ch, ok := store.byID[challengeID]
	if !ok || ch == nil {
		return domain.ErrAdminLoginNotFound
	}
	if ch.Status != AdminLoginPending {
		if ch.Status == AdminLoginDenied {
			return nil
		}
		if ch.Status == AdminLoginExpired {
			return domain.ErrAdminLoginExpired
		}
		return domain.ErrAdminLoginDenied
	}
	now := time.Now().UTC()
	ch.Status = AdminLoginDenied
	ch.ApprovedBy = approverTelegramID
	ch.ResolvedAt = &now

	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &ch.UserID,
		TelegramID:    &ch.TelegramID,
		Source:        "api",
		EventName:     "auth_admin_panel_denied",
		EventCategory: "auth",
		Status:        "error",
		Properties: map[string]any{
			"source":       "admin_panel",
			"challenge_id": challengeID,
			"denied_by":    approverTelegramID,
		},
	})
	return nil
}

func (s *Service) pruneLoginChallengesLocked(store *adminLoginStore, now time.Time) {
	for id, ch := range store.byID {
		if ch == nil {
			delete(store.byID, id)
			continue
		}
		if now.Sub(ch.CreatedAt) > adminLoginChallengeTTL*2 {
			delete(store.byID, id)
		}
	}
}

func newChallengeID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}
