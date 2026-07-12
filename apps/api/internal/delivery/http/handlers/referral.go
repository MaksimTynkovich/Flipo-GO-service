package handlers

import (
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/flipo/flipo/apps/api/internal/usecase/referral"
	"github.com/gin-gonic/gin"
)

type ReferralHandler struct {
	referrals     *referral.Service
	auth          *auth.Service
	adminNotifier *telegram.AdminNotifier
}

func NewReferralHandler(referrals *referral.Service, authSvc *auth.Service, adminNotifier *telegram.AdminNotifier) *ReferralHandler {
	return &ReferralHandler{referrals: referrals, auth: authSvc, adminNotifier: adminNotifier}
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

type referralShareRequest struct {
	Action string `json:"action"`
}

func (h *ReferralHandler) ShareEvent(c *gin.Context) {
	var req referralShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondBadRequest(c, err, "Некорректное тело запроса", "invalid_body")
		return
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "copy" && action != "share" && action != "send" {
		respondBadRequest(c, nil, "action должен быть copy или share", "invalid_action")
		return
	}

	userID := middleware.GetUserID(c)
	user, err := h.auth.GetUser(c.Request.Context(), userID)
	if err != nil || user == nil {
		respondInternal(c, err)
		return
	}

	if h.adminNotifier != nil {
		h.adminNotifier.NotifyReferralShare(c.Request.Context(), telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, action)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
