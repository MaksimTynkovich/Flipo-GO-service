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
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *ReferralHandler) InviteeStatus(c *gin.Context) {
	userID := middleware.GetUserID(c)
	status, err := h.referrals.GetInviteeStatus(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}
