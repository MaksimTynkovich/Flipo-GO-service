package handlers

import (
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/gin-gonic/gin"
)

type MaintenanceHandler struct {
	platform domain.PlatformRepository
	state    *middleware.MaintenanceState
}

func NewMaintenanceHandler(platform domain.PlatformRepository, state *middleware.MaintenanceState) *MaintenanceHandler {
	return &MaintenanceHandler{platform: platform, state: state}
}

const publicDefaultMaintenanceMessage = "Скоро вернёмся."

func (h *MaintenanceHandler) Status(c *gin.Context) {
	if h.state != nil {
		enabled, acceptBets, message := h.state.Snapshot()
		message = strings.TrimSpace(message)
		if enabled && message == "" {
			message = publicDefaultMaintenanceMessage
		}
		c.JSON(http.StatusOK, gin.H{
			"enabled":     enabled,
			"accept_bets": acceptBets,
			"message":     message,
		})
		return
	}

	settings, err := h.platform.GetMaintenanceSettings(c.Request.Context())
	if err != nil {
		// Fail open for the status probe so the app can still boot if DB hiccups.
		c.JSON(http.StatusOK, gin.H{"enabled": false, "accept_bets": true, "message": ""})
		return
	}
	message := strings.TrimSpace(settings.Message)
	if settings.Enabled && message == "" {
		message = publicDefaultMaintenanceMessage
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled":     settings.Enabled,
		"accept_bets": settings.AcceptBets,
		"message":     message,
	})
}
