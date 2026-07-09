package analytics

import (
	"context"
	"encoding/json"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Service struct {
	repo domain.AnalyticsRepository
}

func NewService(repo domain.AnalyticsRepository) *Service {
	return &Service{repo: repo}
}

type EventInput struct {
	UserID         *uuid.UUID
	ReferrerID     *uuid.UUID
	TelegramID     *int64
	AnonymousID    string
	SessionID      string
	RequestID      string
	Source         string
	EventName      string
	EventCategory  string
	Path           string
	Screen         string
	PreviousScreen string
	Method         string
	Status         string
	ErrorCode      string
	ErrorMessage   string
	StartParam     string
	StakingTier    string
	UserAgent      string
	IPAddress      string
	Properties     map[string]any
	OccurredAt     time.Time
}

func (s *Service) Track(ctx context.Context, input EventInput) {
	if s == nil || s.repo == nil || input.EventName == "" {
		return
	}
	_ = s.repo.RecordEvents(ctx, []domain.AnalyticsEventCreate{normalizeEvent(ctx, input)})
}

func (s *Service) TrackBatch(ctx context.Context, inputs []EventInput) error {
	if s == nil || s.repo == nil || len(inputs) == 0 {
		return nil
	}
	events := make([]domain.AnalyticsEventCreate, 0, len(inputs))
	for _, input := range inputs {
		if input.EventName == "" {
			continue
		}
		events = append(events, normalizeEvent(ctx, input))
	}
	if len(events) == 0 {
		return nil
	}
	return s.repo.RecordEvents(ctx, events)
}

func (s *Service) Overview(ctx context.Context, since time.Time, filter domain.AnalyticsOverviewFilter) (*domain.AnalyticsOverview, error) {
	return s.repo.GetOverview(ctx, since, filter)
}

func (s *Service) UserDrilldown(ctx context.Context, userID uuid.UUID, limit int, sessionID string) (*domain.AnalyticsUserDrilldown, error) {
	return s.repo.GetUserDrilldown(ctx, userID, limit, sessionID)
}

func normalizeEvent(ctx context.Context, input EventInput) domain.AnalyticsEventCreate {
	meta := RequestMetaFromContext(ctx)
	properties := datatypes.JSON([]byte("{}"))
	if len(input.Properties) > 0 {
		if payload, err := json.Marshal(input.Properties); err == nil {
			properties = datatypes.JSON(payload)
		}
	}
	if input.Source == "" {
		input.Source = "api"
	}
	if input.RequestID == "" {
		input.RequestID = meta.RequestID
	}
	if input.SessionID == "" {
		input.SessionID = meta.SessionID
	}
	if input.Path == "" {
		input.Path = meta.Path
	}
	if input.Method == "" {
		input.Method = meta.Method
	}
	if input.UserAgent == "" {
		input.UserAgent = meta.UserAgent
	}
	if input.IPAddress == "" {
		input.IPAddress = meta.IPAddress
	}
	return domain.AnalyticsEventCreate{
		UserID:         input.UserID,
		ReferrerID:     input.ReferrerID,
		TelegramID:     input.TelegramID,
		AnonymousID:    input.AnonymousID,
		SessionID:      input.SessionID,
		RequestID:      input.RequestID,
		Source:         input.Source,
		EventName:      input.EventName,
		EventCategory:  input.EventCategory,
		Path:           input.Path,
		Screen:         input.Screen,
		PreviousScreen: input.PreviousScreen,
		Method:         input.Method,
		Status:         input.Status,
		ErrorCode:      input.ErrorCode,
		ErrorMessage:   input.ErrorMessage,
		StartParam:     input.StartParam,
		StakingTier:    input.StakingTier,
		UserAgent:      input.UserAgent,
		IPAddress:      input.IPAddress,
		Properties:     properties,
		OccurredAt:     input.OccurredAt,
	}
}
