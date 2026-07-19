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
	mu      sync.RWMutex
	enabled bool
	message string
}

func NewMaintenanceState() *MaintenanceState {
	return &MaintenanceState{}
}

func (s *MaintenanceState) Set(enabled bool, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.enabled = enabled
	s.message = message
}

func (s *MaintenanceState) Snapshot() (enabled bool, message string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.enabled, s.message
}

func (s *MaintenanceState) Load(settings *domain.PlatformMaintenanceSettings) {
	if settings == nil {
		s.Set(false, "")
		return
	}
	s.Set(settings.Enabled, settings.Message)
}

const defaultMaintenanceMessage = "Скоро вернёмся."

// MaintenanceGate blocks public/player API traffic while maintenance mode is on.
// Auth, admin panel, admins with a valid JWT, webhook, health, and the public
// status endpoint stay available so staff can keep using the product.
func MaintenanceGate(state *MaintenanceState, authSvc *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		enabled, message := state.Snapshot()
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
		if message == "" {
			message = defaultMaintenanceMessage
		}
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"error":   message,
			"code":    "maintenance",
			"message": message,
		})
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
