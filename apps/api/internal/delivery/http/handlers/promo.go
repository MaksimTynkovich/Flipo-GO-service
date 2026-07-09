package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/promo"
	"github.com/gin-gonic/gin"
)

type PromoHandler struct {
	promo     *promo.Service
	analytics *analyticsuc.Service
}

func NewPromoHandler(promoSvc *promo.Service, analyticsSvc *analyticsuc.Service) *PromoHandler {
	return &PromoHandler{promo: promoSvc, analytics: analyticsSvc}
}

func (h *PromoHandler) Activate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "promo", "promo_activated", "error", "promo_required", "Введите промокод", nil)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Введите промокод",
			"code":  "promo_required",
		})
		return
	}
	status, err := h.promo.Activate(c.Request.Context(), userID, req.Code)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "promo", "promo_activated", "error", "promo_failed", err.Error(), map[string]any{"code": req.Code})
		writePromoError(c, err)
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "promo", "promo_activated", "success", "", "", map[string]any{"code": req.Code, "bonus_nanoton": status.BonusNanoton})
	c.JSON(http.StatusOK, status)
}

func (h *PromoHandler) Status(c *gin.Context) {
	userID := middleware.GetUserID(c)
	status, err := h.promo.Status(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}

func writePromoError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrPromoInvalid):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Промокод недействителен",
			"code":  "promo_invalid",
		})
	case errors.Is(err, domain.ErrPromoExpired):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Промокод истёк",
			"code":  "promo_expired",
		})
	case errors.Is(err, domain.ErrPromoExhausted):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Промокод исчерпан",
			"code":  "promo_exhausted",
		})
	case errors.Is(err, domain.ErrPromoAlreadyRedeemed):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Промокод уже использован",
			"code":  "promo_already_redeemed",
		})
	default:
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error()})
	}
}
