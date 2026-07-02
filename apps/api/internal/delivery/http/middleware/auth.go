package middleware

import (
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const UserIDKey = "user_id"

func JWTAuth(authSvc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := authSvc.ParseToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(UserIDKey, claims.UserID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) uuid.UUID {
	id, _ := c.Get(UserIDKey)
	if uid, ok := id.(uuid.UUID); ok {
		return uid
	}
	return uuid.Nil
}

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Telegram-Init-Data")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
