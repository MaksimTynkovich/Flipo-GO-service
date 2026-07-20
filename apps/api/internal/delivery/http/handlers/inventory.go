package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type InventoryHandler struct {
	inventory *inventory.Service
	staking   *staking.Service
	analytics *analyticsuc.Service
}

func NewInventoryHandler(inv *inventory.Service, stake *staking.Service, analyticsSvc *analyticsuc.Service) *InventoryHandler {
	return &InventoryHandler{inventory: inv, staking: stake, analytics: analyticsSvc}
}

func (h *InventoryHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	items, err := h.inventory.ListAll(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *InventoryHandler) Deposit(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		TxRef string `json:"tx_ref" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := h.inventory.Deposit(c.Request.Context(), userID, req.TxRef)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_deposit_completed", "error", "deposit_failed", err.Error(), map[string]any{"tx_ref": req.TxRef})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_deposit_completed", "success", "", "", map[string]any{"item_id": item.ID.String(), "tx_ref": req.TxRef})
	c.JSON(http.StatusCreated, item)
}

func (h *InventoryHandler) Liquidate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	balance, err := h.inventory.Liquidate(c.Request.Context(), userID, itemID)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_liquidated", "error", "liquidate_failed", err.Error(), map[string]any{"item_id": itemID.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_liquidated", "success", "", "", map[string]any{"item_id": itemID.String(), "balance_after": balance})
	c.JSON(http.StatusOK, gin.H{"balance": balance})
}

func (h *InventoryHandler) Withdraw(c *gin.Context) {
	userID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	pending, message, err := h.inventory.Withdraw(c.Request.Context(), userID, itemID)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_withdrawn", "error", "withdraw_failed", err.Error(), map[string]any{"item_id": itemID.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "inventory", "inventory_withdrawn", "success", "", "", map[string]any{
		"item_id": itemID.String(),
		"pending": pending,
	})
	resp := gin.H{"ok": true, "pending": pending}
	if message != "" {
		resp["message"] = message
	}
	c.JSON(http.StatusOK, resp)
}

func (h *InventoryHandler) Stake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		ItemID string `json:"item_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
		return
	}
	pos, err := h.staking.Stake(c.Request.Context(), userID, itemID)
	if err != nil {
		writeStakingError(c, err)
		return
	}
	c.JSON(http.StatusCreated, pos)
}

func (h *InventoryHandler) Unstake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	posID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	if err := h.staking.Unstake(c.Request.Context(), userID, posID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *InventoryHandler) ListStaking(c *gin.Context) {
	userID := middleware.GetUserID(c)
	positions, err := h.staking.ListPositions(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, positions)
}

func (h *InventoryHandler) SetFloorPrice(c *gin.Context) {
	var req struct {
		CollectionSlug string `json:"collection_slug" binding:"required"`
		PriceNanoton   int64  `json:"price_nanoton" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.inventory.SetFloorPrice(c.Request.Context(), req.CollectionSlug, req.PriceNanoton); err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
