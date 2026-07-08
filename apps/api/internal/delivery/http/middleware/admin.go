package middleware

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
)

func AdminAuth(authSvc *auth.Service, adminTelegramIDs []int64) gin.HandlerFunc {
	allowed := make(map[int64]struct{}, len(adminTelegramIDs))
	for _, id := range adminTelegramIDs {
		allowed[id] = struct{}{}
	}

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
		if len(allowed) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access not configured"})
			return
		}
		if _, ok := allowed[claims.TelegramID]; !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			return
		}
		c.Set(UserIDKey, claims.UserID)
		c.Set("telegram_id", claims.TelegramID)
		c.Next()
	}
}

func ParseAdminTelegramIDs(raw string) []int64 {
	parts := strings.Split(raw, ",")
	out := make([]int64, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil {
			continue
		}
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}
