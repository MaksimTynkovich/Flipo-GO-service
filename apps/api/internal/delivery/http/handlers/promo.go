package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/promo"
	"github.com/gin-gonic/gin"
)

type PromoHandler struct {
	promo *promo.Service
}

func NewPromoHandler(promoSvc *promo.Service) *PromoHandler {
	return &PromoHandler{promo: promoSvc}
}

func (h *PromoHandler) Activate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Введите промокод",
			"code":  "promo_required",
		})
		return
	}
	status, err := h.promo.Activate(c.Request.Context(), userID, req.Code)
	if err != nil {
		writePromoError(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *PromoHandler) Status(c *gin.Context) {
	userID := middleware.GetUserID(c)
	status, err := h.promo.Status(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

func writePromoError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrPromoInvalid):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Промокод недействителен",
			"code":  "promo_invalid",
		})
	case errors.Is(err, domain.ErrPromoExpired):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Промокод истёк",
			"code":  "promo_expired",
		})
	case errors.Is(err, domain.ErrPromoExhausted):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Промокод исчерпан",
			"code":  "promo_exhausted",
		})
	case errors.Is(err, domain.ErrPromoAlreadyRedeemed):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Промокод уже использован",
			"code":  "promo_already_redeemed",
		})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
