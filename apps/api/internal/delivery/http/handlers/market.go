package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/market"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MarketHandler struct {
	market    *market.Service
	analytics *analyticsuc.Service
}

func NewMarketHandler(svc *market.Service, analyticsSvc *analyticsuc.Service) *MarketHandler {
	return &MarketHandler{market: svc, analytics: analyticsSvc}
}

func (h *MarketHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	listings, err := h.market.List(c.Request.Context(), limit, offset)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, listings)
}

func (h *MarketHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	listing, err := h.market.Get(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Лот не найден"})
			return
		}
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, listing)
}

func (h *MarketHandler) ListMine(c *gin.Context) {
	userID := middleware.GetUserID(c)
	listings, err := h.market.ListMine(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
		return
	}

	listing, err := h.market.CreateListing(c.Request.Context(), userID, itemID, req.PriceNanoton)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_listing_created", "error", "create_failed", err.Error(), map[string]any{
			"item_id":       req.ItemID,
			"price_nanoton": req.PriceNanoton,
		})
		status := http.StatusBadRequest
		if errors.Is(err, domain.ErrForbidden) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_listing_created", "success", "", "", map[string]any{
		"listing_id":    listing.ID,
		"item_id":       req.ItemID,
		"price_nanoton": req.PriceNanoton,
	})
	c.JSON(http.StatusCreated, listing)
}

func (h *MarketHandler) Cancel(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	if err := h.market.CancelListing(c.Request.Context(), userID, id); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_listing_cancelled", "error", "cancel_failed", err.Error(), map[string]any{"listing_id": id.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_listing_cancelled", "success", "", "", map[string]any{"listing_id": id.String()})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *MarketHandler) Buy(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}

	balance, err := h.market.Purchase(c.Request.Context(), userID, id)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_purchase_completed", "error", "purchase_failed", err.Error(), map[string]any{"listing_id": id.String()})
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
	trackUserEvent(h.analytics, c.Request.Context(), userID, "market", "market_purchase_completed", "success", "", "", map[string]any{
		"listing_id":    id.String(),
		"balance_after": balance.BettingBalance,
		"promo_balance": balance.PromoBalance,
	})
	c.JSON(http.StatusOK, gin.H{
		"balance":       balance.BettingBalance,
		"promo_balance": balance.PromoBalance,
	})
}
