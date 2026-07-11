package middleware

import (
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"

	applog "github.com/flipo/flipo/apps/api/internal/infrastructure/log"
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
			logAdminAuthFailure(c, "missing_authorization", nil)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация", "code": "missing_authorization"})
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := authSvc.ParseToken(token)
		if err != nil {
			logAdminAuthFailure(c, "invalid_token", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Недействительный токен", "code": "invalid_token"})
			return
		}
		if len(allowed) == 0 {
			logAdminAuthFailure(c, "admin_not_configured", nil)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Админ-доступ не настроен", "code": "admin_not_configured"})
			return
		}
		if _, ok := allowed[claims.TelegramID]; !ok {
			logAdminAuthFailure(c, "admin_access_required", nil)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Нужны права администратора", "code": "admin_access_required"})
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

func logAdminAuthFailure(c *gin.Context, reason string, err error) {
	attrs := append(applog.RequestAttrs(c), "reason", reason)
	if err != nil {
		attrs = append(attrs, "error", err.Error())
	}
	slog.WarnContext(c.Request.Context(), "admin_auth_failed", attrs...)
}
