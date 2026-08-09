package postgres

import (
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// applyExcludeAdminUsers drops rows whose user_id belongs to an ADMIN_TELEGRAM_IDS account.
// No-op when the allowlist is empty.
func applyExcludeAdminUsers(q *gorm.DB, userIDColumn string, adminTelegramIDs []int64) *gorm.DB {
	if q == nil || len(adminTelegramIDs) == 0 || strings.TrimSpace(userIDColumn) == "" {
		return q
	}
	return q.Where(
		userIDColumn+" NOT IN (SELECT id FROM users WHERE telegram_id IN ? AND deleted_at IS NULL)",
		adminTelegramIDs,
	)
}

// applyExcludeAdminTelegram drops rows whose telegram_id is in the admin allowlist.
func applyExcludeAdminTelegram(q *gorm.DB, telegramColumn string, adminTelegramIDs []int64) *gorm.DB {
	if q == nil || len(adminTelegramIDs) == 0 || strings.TrimSpace(telegramColumn) == "" {
		return q
	}
	return q.Where(telegramColumn+" NOT IN ?", adminTelegramIDs)
}

// adminTelegramNotInExpr returns a SQL boolean expression for trusted int64 IDs
// from ADMIN_TELEGRAM_IDS (literals — easier to inject into raw SQL).
// Empty allowlist → "TRUE".
func adminTelegramNotInExpr(column string, adminTelegramIDs []int64) string {
	if len(adminTelegramIDs) == 0 || strings.TrimSpace(column) == "" {
		return "TRUE"
	}
	var b strings.Builder
	b.WriteString("COALESCE(")
	b.WriteString(column)
	b.WriteString(", 0) NOT IN (")
	for i, id := range adminTelegramIDs {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatInt(id, 10))
	}
	b.WriteByte(')')
	return b.String()
}
