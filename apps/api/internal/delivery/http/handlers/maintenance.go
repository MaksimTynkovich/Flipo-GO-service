package handlers

import (
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/gin-gonic/gin"
)

type MaintenanceHandler struct {
	platform domain.PlatformRepository
}

func NewMaintenanceHandler(platform domain.PlatformRepository) *MaintenanceHandler {
	return &MaintenanceHandler{platform: platform}
}

const publicDefaultMaintenanceMessage = "Скоро вернёмся."

func (h *MaintenanceHandler) Status(c *gin.Context) {
	settings, err := h.platform.GetMaintenanceSettings(c.Request.Context())
	if err != nil {
		// Fail open for the status probe so the app can still boot if DB hiccups.
		c.JSON(http.StatusOK, gin.H{"enabled": false, "message": ""})
		return
	}
	message := strings.TrimSpace(settings.Message)
	if settings.Enabled && message == "" {
		message = publicDefaultMaintenanceMessage
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled": settings.Enabled,
		"message": message,
	})
}
