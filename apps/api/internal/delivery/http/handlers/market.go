package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/market"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MarketHandler struct {
	market *market.Service
}

func NewMarketHandler(svc *market.Service) *MarketHandler {
	return &MarketHandler{market: svc}
}

func (h *MarketHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	listings, err := h.market.List(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, listings)
}

func (h *MarketHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	listing, err := h.market.Get(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "listing not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, listing)
}

func (h *MarketHandler) ListMine(c *gin.Context) {
	userID := middleware.GetUserID(c)
	listings, err := h.market.ListMine(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, listings)
}

func (h *MarketHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		ItemID       string `json:"item_id" binding:"required"`
		PriceNanoton int64  `json:"price_nanoton" binding:"required"`
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

	listing, err := h.market.CreateListing(c.Request.Context(), userID, itemID, req.PriceNanoton)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, domain.ErrForbidden) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, listing)
}

func (h *MarketHandler) Cancel(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.market.CancelListing(c.Request.Context(), userID, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *MarketHandler) Buy(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	balance, err := h.market.Purchase(c.Request.Context(), userID, id)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, domain.ErrInsufficientFunds) {
			status = http.StatusPaymentRequired
		} else if errors.Is(err, domain.ErrPromoFundsRestricted) {
			status = http.StatusPaymentRequired
		} else if errors.Is(err, domain.ErrForbidden) {
			status = http.StatusForbidden
		} else if errors.Is(err, domain.ErrNotFound) {
			status = http.StatusNotFound
		}
		msg := err.Error()
		if errors.Is(err, domain.ErrInsufficientFunds) {
			msg = "Недостаточно средств"
		} else if errors.Is(err, domain.ErrPromoFundsRestricted) {
			msg = "Бонус нельзя тратить на маркет"
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"balance":       balance.BettingBalance,
		"promo_balance": balance.PromoBalance,
	})
}
