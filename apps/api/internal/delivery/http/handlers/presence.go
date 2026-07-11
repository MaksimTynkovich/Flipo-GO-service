package handlers

import (
	"net/http"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/gin-gonic/gin"
)

type PresenceSource interface {
	GetPresence() domain.PresenceSnapshot
}

type PresenceHandler struct {
	source PresenceSource
}

func NewPresenceHandler(source PresenceSource) *PresenceHandler {
	return &PresenceHandler{source: source}
}

func (h *PresenceHandler) Get(c *gin.Context) {
	if h == nil || h.source == nil {
		c.JSON(http.StatusOK, domain.PresenceSnapshot{
			Online:    0,
			ByGame:    map[string]int{"crash": 0, "roulette": 0, "pvp": 0},
			UpdatedAt: time.Now().UTC(),
		})
		return
	}
	c.JSON(http.StatusOK, h.source.GetPresence())
}
