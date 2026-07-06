package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/gin-gonic/gin"
)

type ReferralHandler struct {
	referrals *referral.Service
}

func NewReferralHandler(referrals *referral.Service) *ReferralHandler {
	return &ReferralHandler{referrals: referrals}
}

func (h *ReferralHandler) Stats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	stats, err := h.referrals.GetStats(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}
