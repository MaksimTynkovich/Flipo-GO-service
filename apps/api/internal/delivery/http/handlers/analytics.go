package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AnalyticsHandler struct {
	auth      *auth.Service
	analytics *analyticsuc.Service
}

func NewAnalyticsHandler(authSvc *auth.Service, analyticsSvc *analyticsuc.Service) *AnalyticsHandler {
	return &AnalyticsHandler{auth: authSvc, analytics: analyticsSvc}
}

func (h *AnalyticsHandler) Ingest(c *gin.Context) {
	var req struct {
		Events []struct {
			EventName      string         `json:"event_name"`
			EventCategory  string         `json:"event_category"`
			Source         string         `json:"source"`
			SessionID      string         `json:"session_id"`
			AnonymousID    string         `json:"anonymous_id"`
			Path           string         `json:"path"`
			Screen         string         `json:"screen"`
			PreviousScreen string         `json:"previous_screen"`
			Status         string         `json:"status"`
			ErrorCode      string         `json:"error_code"`
			ErrorMessage   string         `json:"error_message"`
			StartParam     string         `json:"start_param"`
			StakingTier    string         `json:"staking_tier"`
			OccurredAt     string         `json:"occurred_at"`
			Properties     map[string]any `json:"properties"`
		} `json:"events" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondBadRequest(c, err, "invalid analytics payload", "invalid_payload")
		return
	}

	var eventUserID *uuid.UUID
	var referrerID *uuid.UUID
	var telegramID *int64
	var stakingTier string
	if user := h.resolveUser(c); user != nil {
		eventUserID = &user.ID
		referrerID = user.ReferrerID
		telegramID = &user.TelegramID
		stakingTier = string(user.StakingTier)
	}

	inputs := make([]analyticsuc.EventInput, 0, len(req.Events))
	for _, event := range req.Events {
		var occurredAt time.Time
		if event.OccurredAt != "" {
			if parsed, err := time.Parse(time.RFC3339, event.OccurredAt); err == nil {
				occurredAt = parsed
			}
		}
		inputs = append(inputs, analyticsuc.EventInput{
			UserID:         eventUserID,
			ReferrerID:     referrerID,
			TelegramID:     telegramID,
			AnonymousID:    strings.TrimSpace(event.AnonymousID),
			SessionID:      strings.TrimSpace(event.SessionID),
			Source:         firstNonEmpty(event.Source, "web"),
			EventName:      strings.TrimSpace(event.EventName),
			EventCategory:  strings.TrimSpace(event.EventCategory),
			Path:           strings.TrimSpace(event.Path),
			Screen:         strings.TrimSpace(event.Screen),
			PreviousScreen: strings.TrimSpace(event.PreviousScreen),
			Status:         strings.TrimSpace(event.Status),
			ErrorCode:      strings.TrimSpace(event.ErrorCode),
			ErrorMessage:   strings.TrimSpace(event.ErrorMessage),
			StartParam:     strings.TrimSpace(event.StartParam),
			StakingTier:    firstNonEmpty(strings.TrimSpace(event.StakingTier), stakingTier),
			Properties:     event.Properties,
			OccurredAt:     occurredAt,
		})
	}
	if err := h.analytics.TrackBatch(c.Request.Context(), inputs); err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AnalyticsHandler) resolveUser(c *gin.Context) *domain.User {
	if h.auth == nil {
		return nil
	}
	header := strings.TrimSpace(c.GetHeader("Authorization"))
	if header == "" {
		return nil
	}
	token := strings.TrimPrefix(header, "Bearer ")
	claims, err := h.auth.ParseToken(token)
	if err != nil {
		return nil
	}
	user, err := h.auth.GetUser(c.Request.Context(), claims.UserID)
	if err != nil {
		return nil
	}
	return user
}

func firstNonEmpty(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
