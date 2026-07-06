package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type InventoryHandler struct {
	inventory *inventory.Service
	staking   *staking.Service
}

func NewInventoryHandler(inv *inventory.Service, stake *staking.Service) *InventoryHandler {
	return &InventoryHandler{inventory: inv, staking: stake}
}

func (h *InventoryHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	items, err := h.inventory.ListAll(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *InventoryHandler) Liquidate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	balance, err := h.inventory.Liquidate(c.Request.Context(), userID, itemID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance": balance})
}

func (h *InventoryHandler) Withdraw(c *gin.Context) {
	userID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.inventory.Withdraw(c.Request.Context(), userID, itemID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item_id"})
		return
	}
	pos, err := h.staking.Stake(c.Request.Context(), userID, itemID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, pos)
}

func (h *InventoryHandler) Unstake(c *gin.Context) {
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

func (h *InventoryHandler) ListStaking(c *gin.Context) {
	userID := middleware.GetUserID(c)
	positions, err := h.staking.ListPositions(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
