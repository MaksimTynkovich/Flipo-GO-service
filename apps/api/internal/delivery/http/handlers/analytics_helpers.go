package handlers

import (
	"context"

	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/google/uuid"
)

func trackUserEvent(analyticsSvc *analyticsuc.Service, ctx context.Context, userID uuid.UUID, category, name, status, errorCode, errorMessage string, properties map[string]any) {
	if userID == uuid.Nil {
		return
	}
	analyticsSvc.Track(ctx, analyticsuc.EventInput{
		UserID:        &userID,
		Source:        "api",
		EventName:     name,
		EventCategory: category,
		Status:        status,
		ErrorCode:     errorCode,
		ErrorMessage:  errorMessage,
		Properties:    properties,
	})
}
