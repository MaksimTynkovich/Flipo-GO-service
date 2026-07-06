package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth *auth.Service
}

func NewAuthHandler(authSvc *auth.Service) *AuthHandler {
	return &AuthHandler{auth: authSvc}
}

func (h *AuthHandler) TelegramAuth(c *gin.Context) {
	var req struct {
		InitData     string `json:"init_data" binding:"required"`
		ReferralCode string `json:"referral_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, user, err := h.auth.Authenticate(c.Request.Context(), req.InitData, req.ReferralCode)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

func (h *AuthHandler) DebugAuth(c *gin.Context) {
	if !h.auth.DebugAuthEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	token, user, err := h.auth.AuthenticateDebug(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.auth.GetUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"wallet": wallet})
}

func (h *AuthHandler) ClearWallet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if err := h.auth.ClearWallet(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
