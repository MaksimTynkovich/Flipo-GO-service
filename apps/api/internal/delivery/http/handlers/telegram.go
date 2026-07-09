package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/gin-gonic/gin"
)

type TelegramHandler struct {
	updates       *telegram.BotUpdates
	webhookSecret string
}

func NewTelegramHandler(updates *telegram.BotUpdates, webhookSecret string) *TelegramHandler {
	return &TelegramHandler{
		updates:       updates,
		webhookSecret: webhookSecret,
	}
}

func (h *TelegramHandler) Webhook(c *gin.Context) {
	if h.webhookSecret != "" && c.GetHeader("X-Telegram-Bot-Api-Secret-Token") != h.webhookSecret {
		c.Status(http.StatusUnauthorized)
		return
	}
	if h.updates == nil || !h.updates.Enabled() {
		c.Status(http.StatusServiceUnavailable)
		return
	}

	var update telegram.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	if err := h.updates.HandleUpdate(c.Request.Context(), update); err != nil {
		respondInternal(c, err)
		return
	}

	c.Status(http.StatusOK)
}
