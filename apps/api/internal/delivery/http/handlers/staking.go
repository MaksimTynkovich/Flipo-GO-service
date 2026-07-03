package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StakingHandler struct {
	staking *staking.Service
}

func NewStakingHandler(svc *staking.Service) *StakingHandler {
	return &StakingHandler{staking: svc}
}

func (h *StakingHandler) ListProfileGifts(c *gin.Context) {
	userID := middleware.GetUserID(c)
	resp, err := h.staking.ListProfileGifts(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item_id"})
			return
		}
		pos, err = h.staking.Stake(c.Request.Context(), userID, itemID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug or item_id required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, pos)
}

func (h *StakingHandler) Unstake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	posID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.staking.Unstake(c.Request.Context(), userID, posID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *StakingHandler) ListPositions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	positions, err := h.staking.ListPositions(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, positions)
}
