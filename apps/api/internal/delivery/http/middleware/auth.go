package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	applog "github.com/flipo/flipo/apps/api/internal/infrastructure/log"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const UserIDKey = "user_id"

func JWTAuth(authSvc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			logAuthFailure(c, "missing_authorization", nil)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация", "code": "missing_authorization"})
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := authSvc.ParseToken(token)
		if err != nil {
			logAuthFailure(c, "invalid_token", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Недействительный токен", "code": "invalid_token"})
			return
		}
		c.Set(UserIDKey, claims.UserID)
		c.Next()
	}
}

func logAuthFailure(c *gin.Context, reason string, err error) {
	attrs := append(applog.RequestAttrs(c), "reason", reason)
	if err != nil {
		attrs = append(attrs, "error", err.Error())
	}
	slog.WarnContext(c.Request.Context(), "auth_failed", attrs...)
}

func GetUserID(c *gin.Context) uuid.UUID {
	id, _ := c.Get(UserIDKey)
	if uid, ok := id.(uuid.UUID); ok {
		return uid
	}
	return uuid.Nil
}

func corsAllowHeaders(c *gin.Context) string {
	headers := "Authorization, Content-Type, X-Telegram-Init-Data, X-Session-ID, X-Client-Path, X-Request-ID"
	if strings.Contains(strings.ToLower(c.GetHeader("Access-Control-Request-Headers")), "ngrok-skip-browser-warning") {
		headers += ", ngrok-skip-browser-warning"
	}
	return headers
}

func CORS(allowedOrigins ...string) gin.HandlerFunc {
	origins := normalizeOrigins(allowedOrigins)
	allowAll := len(origins) == 0 || (len(origins) == 1 && origins[0] == "*")

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowAll {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if origin != "" && originAllowed(origin, origins) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", corsAllowHeaders(c))
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func normalizeOrigins(origins []string) []string {
	out := make([]string, 0, len(origins))
	for _, o := range origins {
		o = strings.TrimSpace(o)
		if o != "" {
			out = append(out, o)
		}
	}
	return out
}

func originAllowed(origin string, allowed []string) bool {
	for _, o := range allowed {
		if o == origin {
			return true
		}
	}
	return false
}

func RequestMeta() gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := strings.TrimSpace(c.GetHeader("X-Session-ID"))
		requestID := strings.TrimSpace(c.GetHeader("X-Request-ID"))
		if requestID == "" {
			requestID = uuid.NewString()
		}
		c.Header("X-Request-ID", requestID)
		ctx := analyticsuc.WithRequestMeta(c.Request.Context(), analyticsuc.RequestMeta{
			RequestID: requestID,
			SessionID: sessionID,
			Path:      strings.TrimSpace(c.GetHeader("X-Client-Path")),
			Method:    c.Request.Method,
			UserAgent: c.Request.UserAgent(),
			IPAddress: c.ClientIP(),
		})
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
