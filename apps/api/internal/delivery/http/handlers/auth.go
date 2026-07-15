package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth      *auth.Service
	analytics *analyticsuc.Service
}

type userView struct {
	ID             string             `json:"id"`
	TelegramID     int64              `json:"telegram_id"`
	Username       string             `json:"username"`
	FirstName      string             `json:"first_name"`
	PhotoURL       string             `json:"photo_url,omitempty"`
	BettingBalance int64              `json:"betting_balance"`
	PromoBalance   int64              `json:"promo_balance"`
	StakingTier    domain.StakingTier `json:"staking_tier"`
	TonWallet      string             `json:"ton_wallet,omitempty"`
	IsAdmin        bool               `json:"is_admin"`
}

func NewAuthHandler(authSvc *auth.Service, analyticsSvc *analyticsuc.Service) *AuthHandler {
	return &AuthHandler{auth: authSvc, analytics: analyticsSvc}
}

func (h *AuthHandler) TelegramAuth(c *gin.Context) {
	var req struct {
		InitData     string `json:"init_data" binding:"required"`
		ReferralCode string `json:"referral_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		h.analytics.Track(c.Request.Context(), analyticsuc.EventInput{
			Source:        "api",
			EventName:     "auth_failed",
			EventCategory: "auth",
			Status:        "error",
			ErrorCode:     "invalid_payload",
			ErrorMessage:  err.Error(),
		})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, user, err := h.auth.Authenticate(c.Request.Context(), req.InitData, req.ReferralCode)
	if err != nil {
		h.analytics.Track(c.Request.Context(), analyticsuc.EventInput{
			Source:        "api",
			EventName:     "auth_failed",
			EventCategory: "auth",
			Status:        "error",
			ErrorCode:     "telegram_auth_failed",
			ErrorMessage:  err.Error(),
			StartParam:    req.ReferralCode,
		})
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	if user != nil {
		_ = h.auth.TouchLastIP(c.Request.Context(), user.ID, middleware.ExtractClientIP(c))
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  toUserView(h.auth, user),
	})
}

func (h *AuthHandler) DebugAuth(c *gin.Context) {
	if !h.auth.DebugAuthEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "Не найдено"})
		return
	}

	token, user, err := h.auth.AuthenticateDebug(c.Request.Context())
	if err != nil {
		h.analytics.Track(c.Request.Context(), analyticsuc.EventInput{
			Source:        "api",
			EventName:     "auth_debug_failed",
			EventCategory: "auth",
			Status:        "error",
			ErrorCode:     "debug_auth_failed",
			ErrorMessage:  err.Error(),
		})
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	if user != nil {
		_ = h.auth.TouchLastIP(c.Request.Context(), user.ID, middleware.ExtractClientIP(c))
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  toUserView(h.auth, user),
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.auth.GetUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
		return
	}
	c.JSON(http.StatusOK, toUserView(h.auth, user))
}

func (h *AuthHandler) UpdateWallet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Wallet string `json:"wallet" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wallet, err := h.auth.UpdateWallet(c.Request.Context(), userID, req.Wallet)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidWallet) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"wallet": wallet})
}

func (h *AuthHandler) ClearWallet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if err := h.auth.ClearWallet(c.Request.Context(), userID); err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func toUserView(authSvc *auth.Service, user *domain.User) userView {
	return userView{
		ID:             user.ID.String(),
		TelegramID:     user.TelegramID,
		Username:       user.Username,
		FirstName:      user.FirstName,
		PhotoURL:       user.PhotoURL,
		BettingBalance: user.BettingBalance,
		PromoBalance:   user.PromoBalance,
		StakingTier:    user.StakingTier,
		TonWallet:      user.TonWallet,
		IsAdmin:        authSvc.IsAdmin(user.TelegramID),
	}
}
