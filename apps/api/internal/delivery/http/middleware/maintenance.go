package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
)

// MaintenanceState holds a cached kill-switch for site-wide maintenance.
type MaintenanceState struct {
	mu         sync.RWMutex
	enabled    bool
	acceptBets bool
	message    string
	messageEN  string
	messageRU  string
}

func NewMaintenanceState() *MaintenanceState {
	return &MaintenanceState{acceptBets: true}
}

func (s *MaintenanceState) Set(enabled bool, acceptBets bool, message, messageEN, messageRU string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.enabled = enabled
	s.acceptBets = acceptBets
	s.message = message
	s.messageEN = messageEN
	s.messageRU = messageRU
}

func (s *MaintenanceState) Snapshot() (enabled bool, acceptBets bool, message, messageEN, messageRU string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.enabled, s.acceptBets, s.message, s.messageEN, s.messageRU
}

func (s *MaintenanceState) Load(settings *domain.PlatformMaintenanceSettings) {
	if settings == nil {
		s.Set(false, true, "", "", "")
		return
	}
	s.Set(settings.Enabled, settings.AcceptBets, settings.Message, settings.MessageEN, settings.MessageRU)
}

func maintenanceJSON(enabled, acceptBets bool, message, messageEN, messageRU string) gin.H {
	return gin.H{
		"enabled":     enabled,
		"accept_bets": acceptBets,
		"message":     strings.TrimSpace(message),
		"message_en":  strings.TrimSpace(messageEN),
		"message_ru":  strings.TrimSpace(messageRU),
	}
}

const defaultMaintenanceMessage = "Скоро вернёмся."

// MaintenanceGate blocks public/player API traffic while maintenance mode is on.
// Auth, admin panel, admins with a valid JWT, webhook, health, and the public
// status endpoint stay available so staff can keep using the product.
func MaintenanceGate(state *MaintenanceState, authSvc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		enabled, _, message, messageEN, messageRU := state.Snapshot()
		if !enabled {
			c.Next()
			return
		}
		if maintenancePathAllowed(c.Request.Method, c.Request.URL.Path) {
			c.Next()
			return
		}
		if authSvc != nil && maintenanceRequestIsAdmin(c, authSvc) {
			c.Next()
			return
		}
		payload := maintenanceJSON(true, false, message, messageEN, messageRU)
		if payload["message"] == "" {
			payload["message"] = defaultMaintenanceMessage
		}
		payload["error"] = payload["message"]
		payload["code"] = "maintenance"
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, payload)
	}
}

func maintenanceRequestIsAdmin(c *gin.Context, authSvc *auth.Service) bool {
	token := ""
	if header := c.GetHeader("Authorization"); header != "" {
		token = strings.TrimPrefix(header, "Bearer ")
	}
	if token == "" {
		token = c.Query("token")
	}
	if token == "" {
		return false
	}
	claims, err := authSvc.ParseToken(token)
	if err != nil {
		return false
	}
	return authSvc.IsAdmin(claims.TelegramID)
}

func maintenancePathAllowed(method, path string) bool {
	if path == "/health" || path == "/ready" {
		return true
	}
	if strings.HasPrefix(path, "/static/") {
		return true
	}
	if strings.HasPrefix(path, "/ws/games/") {
		// Public game feeds stay open; bets/mutations are still blocked without admin JWT.
		return true
	}
	if path == "/api/v1/maintenance" && method == http.MethodGet {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/auth/") {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/admin/") {
		return true
	}
	if path == "/api/v1/telegram/webhook" && method == http.MethodPost {
		return true
	}
	if path == "/api/v1/payments/cryptobot/webhook" && method == http.MethodPost {
		return true
	}
	if path == "/api/v1/analytics/events" && method == http.MethodPost {
		return true
	}
	return false
}

// RefreshMaintenanceState periodically reloads settings from the repository.
func RefreshMaintenanceState(state *MaintenanceState, load func() (*domain.PlatformMaintenanceSettings, error), every time.Duration, stop <-chan struct{}) {
	if every <= 0 {
		every = 15 * time.Second
	}
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			settings, err := load()
			if err != nil {
				continue
			}
			state.Load(settings)
		}
	}
}
