package middleware

import (
	"net/http"
	"time"

	applog "github.com/flipo/flipo/apps/api/internal/infrastructure/log"
	"github.com/gin-gonic/gin"
	"log/slog"
)

func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		attrs := append(applog.RequestAttrs(c),
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
			"response_bytes", c.Writer.Size(),
		)
		if len(c.Errors) > 0 {
			attrs = append(attrs, "handler_errors", c.Errors.String())
		}

		ctx := c.Request.Context()
		switch {
		case status >= http.StatusInternalServerError:
			slog.ErrorContext(ctx, "http_request", attrs...)
		case status >= http.StatusBadRequest:
			slog.WarnContext(ctx, "http_request", attrs...)
		default:
			slog.InfoContext(ctx, "http_request", attrs...)
		}
	}
}

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				attrs := append(applog.RequestAttrs(c), "panic", recovered)
				slog.ErrorContext(c.Request.Context(), "panic_recovered", attrs...)
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error": "Внутренняя ошибка сервера",
					"code":  "internal_error",
				})
			}
		}()
		c.Next()
	}
}
