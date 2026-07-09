package log

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var output io.Writer

func Init(service, env string) {
	level := slog.LevelInfo
	switch strings.ToLower(strings.TrimSpace(os.Getenv("LOG_LEVEL"))) {
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}

	logFile := strings.TrimSpace(os.Getenv("LOG_FILE"))
	if logFile == "" {
		logFile = "../../logs/api.log"
	}

	writer, err := openLogFile(logFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "log init failed: %v\n", err)
		os.Exit(1)
	}
	output = writer

	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if env == "production" {
		handler = slog.NewJSONHandler(writer, opts)
	} else {
		handler = slog.NewTextHandler(writer, opts)
	}

	slog.SetDefault(slog.New(handler).With("service", service, "env", env, "log_file", logFile))
	slog.Info("logging initialized", "path", logFile)
}

func Path() string {
	if output == nil {
		return ""
	}
	if f, ok := output.(*os.File); ok {
		return f.Name()
	}
	return ""
}

func openLogFile(path string) (io.Writer, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create log directory: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}
	return file, nil
}

func RequestAttrs(c *gin.Context) []any {
	meta := analyticsuc.RequestMetaFromContext(c.Request.Context())
	attrs := []any{
		"request_id", meta.RequestID,
		"session_id", meta.SessionID,
		"client_path", meta.Path,
		"http_method", c.Request.Method,
		"route", c.FullPath(),
		"http_path", c.Request.URL.Path,
		"ip", meta.IPAddress,
		"user_agent", meta.UserAgent,
	}
	if id, ok := c.Get("user_id"); ok {
		if uid, ok := id.(uuid.UUID); ok && uid != uuid.Nil {
			attrs = append(attrs, "user_id", uid.String())
		}
	}
	if tid, ok := c.Get("telegram_id"); ok {
		attrs = append(attrs, "telegram_id", tid)
	}
	return attrs
}

func WithComponent(ctx context.Context, component string) context.Context {
	return context.WithValue(ctx, componentKey{}, component)
}

func Component(ctx context.Context) string {
	component, _ := ctx.Value(componentKey{}).(string)
	return component
}

func ComponentAttrs(ctx context.Context) []any {
	if component := Component(ctx); component != "" {
		return []any{"component", component}
	}
	return nil
}

type componentKey struct{}

func DebugContext(ctx context.Context, msg string, attrs ...any) {
	slog.DebugContext(ctx, msg, append(ComponentAttrs(ctx), attrs...)...)
}

func InfoContext(ctx context.Context, msg string, attrs ...any) {
	slog.InfoContext(ctx, msg, append(ComponentAttrs(ctx), attrs...)...)
}

func WarnContext(ctx context.Context, msg string, attrs ...any) {
	slog.WarnContext(ctx, msg, append(ComponentAttrs(ctx), attrs...)...)
}

func ErrorContext(ctx context.Context, msg string, attrs ...any) {
	slog.ErrorContext(ctx, msg, append(ComponentAttrs(ctx), attrs...)...)
}
