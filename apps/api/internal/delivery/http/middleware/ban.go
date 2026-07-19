package middleware

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// UserBanGate rejects authenticated player API traffic for banned accounts.
// Admins bypass so staff accounts remain usable even if flagged by mistake.
func UserBanGate(authSvc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		if authSvc == nil {
			c.Next()
			return
		}
		userID := GetUserID(c)
		if userID == uuid.Nil {
			c.Next()
			return
		}
		user, err := authSvc.GetUser(c.Request.Context(), userID)
		if err != nil || user == nil {
			c.Next()
			return
		}
		if !user.IsBanned || authSvc.IsAdmin(user.TelegramID) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "Аккаунт заблокирован.",
			"code":  "user_banned",
		})
	}
}
