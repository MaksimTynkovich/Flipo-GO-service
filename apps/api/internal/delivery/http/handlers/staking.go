package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StakingHandler struct {
	staking   *staking.Service
	analytics *analyticsuc.Service
}

func NewStakingHandler(svc *staking.Service, analyticsSvc *analyticsuc.Service) *StakingHandler {
	return &StakingHandler{staking: svc, analytics: analyticsSvc}
}

func (h *StakingHandler) ListProfileGifts(c *gin.Context) {
	userID := middleware.GetUserID(c)
	resp, err := h.staking.ListProfileGifts(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *StakingHandler) Stake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		ItemID string `json:"item_id"`
		Slug   string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var pos interface{}
	var err error

	switch {
	case req.Slug != "":
		pos, err = h.staking.StakeBySlug(c.Request.Context(), userID, req.Slug)
	case req.ItemID != "":
		itemID, parseErr := uuid.Parse(req.ItemID)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
			return
		}
		pos, err = h.staking.Stake(c.Request.Context(), userID, itemID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите slug или item_id"})
		return
	}

	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_started", "error", "stake_failed", err.Error(), map[string]any{"slug": req.Slug, "item_id": req.ItemID})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_started", "success", "", "", map[string]any{"slug": req.Slug, "item_id": req.ItemID})
	c.JSON(http.StatusCreated, pos)
}

func (h *StakingHandler) Unstake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	posID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	if err := h.staking.Unstake(c.Request.Context(), userID, posID); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_unstake_requested", "error", "unstake_failed", err.Error(), map[string]any{"position_id": posID.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_unstake_requested", "success", "", "", map[string]any{"position_id": posID.String()})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *StakingHandler) ListPositions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	positions, err := h.staking.ListPositions(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, positions)
}
