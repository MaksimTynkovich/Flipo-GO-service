package middleware

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// ExtractClientIP returns the real client IP behind Cloudflare / reverse proxies.
func ExtractClientIP(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	candidates := []string{
		strings.TrimSpace(c.GetHeader("CF-Connecting-IP")),
		strings.TrimSpace(c.GetHeader("True-Client-IP")),
	}
	if xff := strings.TrimSpace(c.GetHeader("X-Forwarded-For")); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			candidates = append(candidates, strings.TrimSpace(xff[:i]))
		} else {
			candidates = append(candidates, xff)
		}
	}
	candidates = append(candidates, strings.TrimSpace(c.GetHeader("X-Real-IP")), c.ClientIP())

	for _, raw := range candidates {
		ip := normalizeIP(raw)
		if ip != "" {
			return ip
		}
	}
	return ""
}

func normalizeIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// Strip port if present ([::1]:123 / 1.2.3.4:5678).
	if host, _, err := net.SplitHostPort(raw); err == nil {
		raw = host
	}
	raw = strings.Trim(raw, "[]")
	parsed := net.ParseIP(raw)
	if parsed == nil {
		return ""
	}
	return parsed.String()
}
