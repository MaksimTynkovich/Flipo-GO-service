package handlers

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/admin"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	casesuc "github.com/flipo/flipo/apps/api/internal/usecase/cases"
	"github.com/flipo/flipo/apps/api/internal/usecase/fairness"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/flipo/flipo/apps/api/internal/usecase/outcome"
	"github.com/flipo/flipo/apps/api/internal/usecase/market"
	"github.com/flipo/flipo/apps/api/internal/usecase/telegramadmin"
	"github.com/flipo/flipo/apps/api/internal/usecase/treasury"
	"github.com/flipo/flipo/apps/api/internal/usecase/wheel"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AdminHandler struct {
	admin               *admin.Service
	analytics           *analyticsuc.Service
	fairness            *fairness.Service
	outcome             *outcome.Service
	treasury            *treasury.Service
	telegram            *telegramadmin.Service
	wheel               *wheel.Service
	cases               *casesuc.Service
	inventory           *inventory.Service
	botSync             *market.BotSyncService
	hotAddr             string
	casesUploadDir      string
	onSocialSimUpdate   func(domain.SocialSimSettings)
	onMaintenanceUpdate func(domain.PlatformMaintenanceSettings)
	onlineCounter       func() int
}

func NewAdminHandler(adminSvc *admin.Service, analyticsSvc *analyticsuc.Service, fairnessSvc *fairness.Service, outcomeSvc *outcome.Service, treasurySvc *treasury.Service, telegramSvc *telegramadmin.Service, hotAddr string) *AdminHandler {
	return &AdminHandler{
		admin:     adminSvc,
		analytics: analyticsSvc,
		fairness:  fairnessSvc,
		outcome:   outcomeSvc,
		treasury:  treasurySvc,
		telegram:  telegramSvc,
		hotAddr:   hotAddr,
	}
}

func (h *AdminHandler) SetSocialSimUpdater(fn func(domain.SocialSimSettings)) {
	h.onSocialSimUpdate = fn
}

func (h *AdminHandler) SetMaintenanceUpdater(fn func(domain.PlatformMaintenanceSettings)) {
	h.onMaintenanceUpdate = fn
}

func (h *AdminHandler) SetBotGiftSync(sync *market.BotSyncService) {
	h.botSync = sync
}

func (h *AdminHandler) SetWheelService(wheelSvc *wheel.Service) {
	h.wheel = wheelSvc
}

func (h *AdminHandler) SetCasesService(casesSvc *casesuc.Service) {
	h.cases = casesSvc
}

func (h *AdminHandler) SetCasesUploadDir(dir string) {
	h.casesUploadDir = strings.TrimSpace(dir)
}

func (h *AdminHandler) SetInventoryService(invSvc *inventory.Service) {
	h.inventory = invSvc
}

func (h *AdminHandler) SetOnlineCounter(fn func() int) {
	h.onlineCounter = fn
}

func (h *AdminHandler) OnlineNow(c *gin.Context) {
	online := 0
	if h.onlineCounter != nil {
		online = h.onlineCounter()
	}
	c.JSON(http.StatusOK, gin.H{"online": online})
}

func (h *AdminHandler) WheelStats(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusOK, gin.H{
			"today":                   gin.H{"spins": 0, "unique_users": 0, "prizes_nanoton": 0},
			"last_7_days":             gin.H{"spins": 0, "unique_users": 0, "prizes_nanoton": 0},
			"all_time":                gin.H{"spins": 0, "unique_users": 0, "prizes_nanoton": 0},
			"sources_today":           gin.H{"daily": gin.H{"spins": 0, "prizes_nanoton": 0}, "bonus": gin.H{"spins": 0, "prizes_nanoton": 0}},
			"sources_all_time":        gin.H{"daily": gin.H{"spins": 0, "prizes_nanoton": 0}, "bonus": gin.H{"spins": 0, "prizes_nanoton": 0}},
			"prize_breakdown":         []any{},
			"spins_by_day":            []any{},
			"pending_bonus_spins":     0,
			"spins_today":             0,
			"prizes_today_nanoton":    0,
			"spins_all_time":          0,
			"prizes_all_time_nanoton": 0,
		})
		return
	}
	stats, err := h.wheel.AdminStats(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) ListWheelSegments(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusOK, []any{})
		return
	}
	items, err := h.wheel.AdminListSegments(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) UpdateWheelSegment(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "колесо недоступно"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный id"})
		return
	}
	var body wheel.AdminSegmentUpdate
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.wheel.AdminUpdateSegment(c.Request.Context(), id, body)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "приз не найден"})
			return
		}
		if errors.Is(err, domain.ErrInvalidAmount) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *AdminHandler) ListWheelSpinOverrides(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusOK, []any{})
		return
	}
	items, err := h.wheel.AdminListSpinOverrides(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	if items == nil {
		items = []domain.WheelSpinOverrideView{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) CreateWheelSpinOverride(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "колесо недоступно"})
		return
	}
	adminID := middleware.GetUserID(c)
	var req struct {
		TelegramID int64  `json:"telegram_id"`
		SegmentID  string `json:"segment_id"`
		Note       string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TelegramID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "укажите telegram_id"})
		return
	}
	segmentID, err := uuid.Parse(req.SegmentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный segment_id"})
		return
	}
	item, err := h.wheel.AdminSetSpinOverride(c.Request.Context(), adminID, req.TelegramID, segmentID, req.Note)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь или приз не найден"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AdminHandler) DeleteWheelSpinOverride(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "колесо недоступно"})
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный id"})
		return
	}
	if err := h.wheel.AdminDeleteSpinOverride(c.Request.Context(), id); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "подкрутка не найдена"})
			return
		}
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GrantWheelBonusSpins(c *gin.Context) {
	if h.wheel == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "колесо недоступно"})
		return
	}
	var req struct {
		TelegramID int64 `json:"telegram_id"`
		Count      int   `json:"count"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TelegramID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "укажите telegram_id"})
		return
	}
	result, err := h.wheel.AdminGrantBonusSpins(c.Request.Context(), req.TelegramID, req.Count)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "пользователь не найден"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) RevenueSummary(c *gin.Context) {
	summary, err := h.admin.Summary(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, summary)
}

func (h *AdminHandler) RevenueTimeseries(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	series, err := h.admin.Timeseries(c.Request.Context(), days)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, series)
}

func (h *AdminHandler) Transfers(c *gin.Context) {
	items, err := h.admin.ListTransfers(c.Request.Context(), 100)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, toAdminTransferViews(items))
}

func (h *AdminHandler) Ledger(c *gin.Context) {
	items, err := h.admin.ListLedger(c.Request.Context(), 50)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) GameStats(c *gin.Context) {
	stats, err := h.admin.GameStats(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) RiskUsers(c *gin.Context) {
	users, err := h.admin.RiskUsers(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) AuditLogs(c *gin.Context) {
	logs, err := h.admin.AuditLogs(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, logs)
}

func (h *AdminHandler) ListNotifications(c *gin.Context) {
	category := strings.TrimSpace(c.Query("category"))
	unreadOnly := c.Query("unread") == "1" || strings.EqualFold(c.Query("unread"), "true")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	items, err := h.admin.ListNotifications(c.Request.Context(), category, unreadOnly, limit)
	if err != nil {
		respondInternal(c, err)
		return
	}
	if items == nil {
		items = []domain.AdminNotification{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) UnreadNotificationCount(c *gin.Context) {
	category := strings.TrimSpace(c.Query("category"))
	count, err := h.admin.UnreadNotificationCount(c.Request.Context(), category)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"count": count})
}

func (h *AdminHandler) MarkNotificationRead(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.admin.MarkNotificationRead(c.Request.Context(), id); err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) MarkAllNotificationsRead(c *gin.Context) {
	var body struct {
		Category string `json:"category"`
	}
	_ = c.ShouldBindJSON(&body)
	category := strings.TrimSpace(body.Category)
	if category == "" {
		category = strings.TrimSpace(c.Query("category"))
	}
	n, err := h.admin.MarkAllNotificationsRead(c.Request.Context(), category)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "marked": n})
}

func (h *AdminHandler) AnalyticsOverview(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "1"))
	if days <= 0 {
		days = 1
	}
	since := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)
	filter := domain.AnalyticsOverviewFilter{
		ErrorCode: c.Query("error_code"),
		InputID:   c.Query("input_id"),
	}
	overview, err := h.analytics.Overview(c.Request.Context(), since, filter)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, overview)
}

func (h *AdminHandler) AnalyticsUserDrilldown(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "60"))
	sessionID := c.Query("session_id")
	drilldown, err := h.analytics.UserDrilldown(c.Request.Context(), userID, limit, sessionID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, drilldown)
}

func (h *AdminHandler) ReviewTransfer(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	transferID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID перевода"})
		return
	}
	var req struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.ReviewWithdrawal(c.Request.Context(), adminID, transferID, req.Approve, req.Note); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	minReferrals, _ := strconv.Atoi(c.Query("min_referrals"))
	if minReferrals < 0 {
		minReferrals = 0
	}
	users, err := h.admin.ListUsers(c.Request.Context(), c.Query("q"), c.DefaultQuery("sort", "last_login"), minReferrals)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) SetUserBanned(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	var req struct {
		Banned bool   `json:"banned"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.SetUserBanned(c.Request.Context(), adminID, userID, req.Banned, req.Reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "banned": req.Banned})
}

func (h *AdminHandler) SetUserWithdrawalsDisabled(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	var req struct {
		Disabled bool   `json:"disabled"`
		Reason   string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.SetUserWithdrawalsDisabled(c.Request.Context(), adminID, userID, req.Disabled, req.Reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "withdrawals_disabled": req.Disabled})
}

func (h *AdminHandler) SetUserBalance(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	var req struct {
		BalanceNanoton int64  `json:"balance_nanoton"`
		Reason         string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.admin.SetUserBalance(c.Request.Context(), adminID, userID, req.BalanceNanoton, req.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":                true,
		"previous_balance":  result.PreviousBalance,
		"betting_balance":   result.BettingBalance,
		"delta":             result.Delta,
	})
}

func (h *AdminHandler) UserAudience(c *gin.Context) {
	stats, err := h.admin.UserAudience(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) UserBets(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	resp, err := h.admin.UserBets(c.Request.Context(), userID, c.DefaultQuery("period", "7d"))
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) UserTransfers(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	resp, err := h.admin.UserTransfers(c.Request.Context(), userID, c.DefaultQuery("period", "7d"))
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"period":  resp.Period,
		"summary": resp.Summary,
		"items":   toAdminTransferViews(resp.Items),
	})
}

func (h *AdminHandler) ListGameConfigs(c *gin.Context) {
	configs, err := h.admin.ListGameConfigs(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, configs)
}

func (h *AdminHandler) UpdateGameConfig(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var cfg domain.GameConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateGameConfig(c.Request.Context(), adminID, cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetRiskSettings(c *gin.Context) {
	settings, err := h.admin.GetRiskSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateRiskSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.PlatformRiskSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateRiskSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) UpdateMarketListingPrice(c *gin.Context) {
	if respondMarketDisabled(c) {
		return
	}
	adminID := middleware.GetUserID(c)
	listingID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID лота"})
		return
	}
	var body struct {
		PriceNanoton int64 `json:"price_nanoton"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateMarketListingPrice(c.Request.Context(), adminID, listingID, body.PriceNanoton); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) SyncBotMarketGifts(c *gin.Context) {
	if respondMarketDisabled(c) {
		return
	}
	if h.botSync == nil || !h.botSync.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MTProto не настроен"})
		return
	}
	result, err := h.botSync.Sync(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) RepriceBotMarketGifts(c *gin.Context) {
	if respondMarketDisabled(c) {
		return
	}
	if h.botSync == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bot sync not configured"})
		return
	}
	result, err := h.botSync.Reprice(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) GetGiftPriceSettings(c *gin.Context) {
	settings, err := h.admin.GetGiftPriceSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateGiftPriceSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var body struct {
		BuyAdjustPercent       float64 `json:"buy_adjust_percent"`
		ValuationAdjustPercent float64 `json:"valuation_adjust_percent"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateGiftPriceSettings(c.Request.Context(), adminID, body.BuyAdjustPercent, body.ValuationAdjustPercent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) ListGiftTraitPrices(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	backdrop := c.Query("backdrop")
	if c.Query("model_only") == "1" || c.Query("model_only") == "true" {
		backdrop = "__empty__"
	}
	result, err := h.admin.ListGiftTraitPrices(c.Request.Context(), domain.GiftTraitPriceFilter{
		CollectionSlug: strings.TrimSpace(c.Query("collection")),
		Model:          strings.TrimSpace(c.Query("model")),
		Backdrop:       strings.TrimSpace(backdrop),
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) UpdateGiftTraitPrice(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var body struct {
		CollectionSlug string `json:"collection_slug" binding:"required"`
		Model          string `json:"model" binding:"required"`
		Backdrop       string `json:"backdrop"`
		PriceNanoton   int64  `json:"price_nanoton" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateGiftTraitPrice(c.Request.Context(), adminID, body.CollectionSlug, body.Model, body.Backdrop, body.PriceNanoton); err != nil {
		if errors.Is(err, domain.ErrInvalidAmount) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректная цена или ключ"})
			return
		}
		if errors.Is(err, domain.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) RotateSeed(c *gin.Context) {
	gameType := domain.GameType(c.Param("game"))
	_, err := h.fairness.RotateSeed(c.Request.Context(), gameType, "")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) SeedHistory(c *gin.Context) {
	gameType := domain.GameType(c.Param("game"))
	history, err := h.fairness.SeedHistory(c.Request.Context(), gameType)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, history)
}

func (h *AdminHandler) ListOutcomeOverrides(c *gin.Context) {
	overrides, err := h.outcome.ListOverrides(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, overrides)
}

func (h *AdminHandler) CreateOutcomeOverride(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var req struct {
		GameType        string  `json:"game_type"`
		Target          any     `json:"target"`
		RoundsRemaining int     `json:"rounds_remaining"`
		DurationMinutes int     `json:"duration_minutes"`
		Note            string  `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	gameType := domain.GameType(req.GameType)
	switch gameType {
	case domain.GameRoulette, domain.GameCrash, domain.GamePvP:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неизвестный тип игры"})
		return
	}
	if req.RoundsRemaining <= 0 {
		req.RoundsRemaining = 1
	}
	ttl := time.Duration(req.DurationMinutes) * time.Minute
	override, err := h.outcome.SetOverride(c.Request.Context(), gameType, req.Target, req.RoundsRemaining, adminID, req.Note, ttl)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, override)
}

func (h *AdminHandler) DeleteOutcomeOverride(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	if err := h.outcome.DeleteOverride(c.Request.Context(), id); err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) TreasuryStatus(c *gin.Context) {
	summary, err := h.admin.Summary(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	status, err := h.treasury.Status(c.Request.Context(), h.hotAddr, summary.PendingLiabilityNanoton)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *AdminHandler) ListPromoCodes(c *gin.Context) {
	items, err := h.admin.ListPromoCodes(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) UpsertPromoCode(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var promo domain.PromoCode
	if err := c.ShouldBindJSON(&promo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(promo.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Введите промокод"})
		return
	}
	if err := h.admin.UpsertPromoCode(c.Request.Context(), adminID, promo); err != nil {
		if errors.Is(err, domain.ErrPromoInvalid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Введите промокод"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) DeletePromoCode(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите код"})
		return
	}
	if err := h.admin.DeletePromoCode(c.Request.Context(), adminID, code); err != nil {
		switch {
		case errors.Is(err, domain.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "Промокод не найден"})
		case errors.Is(err, domain.ErrPromoInUse):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Есть активации"})
		default:
			respondInternal(c, err)
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetBotSettings(c *gin.Context) {
	settings, err := h.admin.GetBotSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateBotSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.TelegramBotSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateBotSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetMaintenanceSettings(c *gin.Context) {
	settings, err := h.admin.GetMaintenanceSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateMaintenanceSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.PlatformMaintenanceSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateMaintenanceSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.onMaintenanceUpdate != nil {
		h.onMaintenanceUpdate(settings)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetWithdrawalSettings(c *gin.Context) {
	settings, err := h.admin.GetWithdrawalSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateWithdrawalSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.PlatformWithdrawalSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateWithdrawalSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) ListPendingGiftWithdrawals(c *gin.Context) {
	if h.inventory == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "инвентарь недоступен"})
		return
	}
	items, err := h.inventory.ListPendingWithdrawals(c.Request.Context(), 50)
	if err != nil {
		respondInternal(c, err)
		return
	}
	if items == nil {
		items = []domain.AdminPendingGiftWithdraw{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) ReviewGiftWithdrawal(c *gin.Context) {
	if h.inventory == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "инвентарь недоступен"})
		return
	}
	adminID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
		return
	}
	var req struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.inventory.ReviewPendingWithdrawal(c.Request.Context(), itemID, req.Approve); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	action := "gift_withdrawal_rejected"
	if req.Approve {
		action = "gift_withdrawal_approved"
	}
	_ = h.admin.RecordAudit(c.Request.Context(), adminID, action, "inventory_item", itemID.String(), map[string]string{
		"note": strings.TrimSpace(req.Note),
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) FulfillGiftWithdrawal(c *gin.Context) {
	if h.inventory == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "инвентарь недоступен"})
		return
	}
	adminID := middleware.GetUserID(c)
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
		return
	}
	var req struct {
		TelegramGiftID string `json:"telegram_gift_id" binding:"required"`
		Note           string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.inventory.FulfillPendingWithdrawal(c.Request.Context(), itemID, req.TelegramGiftID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.admin.RecordAudit(c.Request.Context(), adminID, "gift_withdrawal_fulfilled", "inventory_item", itemID.String(), map[string]string{
		"telegram_gift_id": strings.TrimSpace(req.TelegramGiftID),
		"note":             strings.TrimSpace(req.Note),
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) ListCases(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusOK, []any{})
		return
	}
	items, err := h.cases.AdminList(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) GetCaseCatalogSettings(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	settings, err := h.cases.AdminGetCatalogSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateCaseCatalogSettings(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	var req struct {
		BannersEnabled bool `json:"banners_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	settings, err := h.cases.AdminUpdateCatalogSettings(c.Request.Context(), req.BannersEnabled)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpsertCase(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	var req domain.Case
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if req.Slug == "" || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "нужны slug и title"})
		return
	}
	if req.Kind == "" {
		req.Kind = domain.CaseKindCatalog
	}
	if strings.TrimSpace(req.AccentColor) == "" {
		req.AccentColor = "#3b82f6"
	}
	if req.TargetRTPBPS <= 0 {
		req.TargetRTPBPS = 9000
	}
	if err := h.cases.AdminUpsertCase(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": req.ID})
}

func (h *AdminHandler) ReplaceCaseLoot(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	caseID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный id"})
		return
	}
	var req struct {
		Entries []domain.CaseLootEntry `json:"entries"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.cases.AdminReplaceLoot(c.Request.Context(), caseID, req.Entries); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) ListCasePromoCodes(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	var caseID *uuid.UUID
	if raw := strings.TrimSpace(c.Query("case_id")); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный case_id"})
			return
		}
		caseID = &id
	}
	items, err := h.cases.AdminListCasePromoCodes(c.Request.Context(), caseID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	if items == nil {
		items = []domain.CasePromoCode{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) UpsertCasePromoCode(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	var promo domain.CasePromoCode
	if err := c.ShouldBindJSON(&promo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.cases.AdminUpsertCasePromoCode(c.Request.Context(), &promo); err != nil {
		switch {
		case errors.Is(err, domain.ErrPromoInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Введите промокод"})
		case errors.Is(err, domain.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "Кейс не найден"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) DeleteCasePromoCode(c *gin.Context) {
	if h.cases == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "кейсы недоступны"})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите код"})
		return
	}
	if err := h.cases.AdminDeleteCasePromoCode(c.Request.Context(), code); err != nil {
		switch {
		case errors.Is(err, domain.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "Промокод не найден"})
		case errors.Is(err, domain.ErrPromoInUse):
			c.JSON(http.StatusBadRequest, gin.H{"error": "Есть активации — удаление недоступно"})
		default:
			respondInternal(c, err)
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

const maxCaseImageBytes = 5 << 20 // 5 MiB

func (h *AdminHandler) UploadCaseImage(c *gin.Context) {
	if h.casesUploadDir == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "загрузка картинок недоступна"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "нужен файл (поле file)"})
		return
	}
	if file.Size <= 0 || file.Size > maxCaseImageBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "файл до 5 МБ"})
		return
	}

	src, err := file.Open()
	if err != nil {
		respondInternal(c, err)
		return
	}
	defer src.Close()

	head := make([]byte, 512)
	n, readErr := io.ReadFull(src, head)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		respondInternal(c, readErr)
		return
	}
	head = head[:n]
	ext, ok := caseImageExt(head)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "только JPEG, PNG, WebP или GIF"})
		return
	}

	if err := os.MkdirAll(h.casesUploadDir, 0o755); err != nil {
		respondInternal(c, err)
		return
	}
	name := uuid.New().String() + ext
	destPath := filepath.Join(h.casesUploadDir, name)
	dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		respondInternal(c, err)
		return
	}
	reader := io.MultiReader(bytes.NewReader(head), src)
	written, copyErr := io.Copy(dst, io.LimitReader(reader, maxCaseImageBytes+1))
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(destPath)
		if copyErr != nil {
			respondInternal(c, copyErr)
			return
		}
		respondInternal(c, closeErr)
		return
	}
	if written > maxCaseImageBytes {
		_ = os.Remove(destPath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "файл до 5 МБ"})
		return
	}

	url := "/static/cases/" + name
	c.JSON(http.StatusOK, gin.H{"ok": true, "url": url, "image_url": url})
}

func caseImageExt(head []byte) (string, bool) {
	ct := http.DetectContentType(head)
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return ".jpg", true
	case strings.HasPrefix(ct, "image/png"):
		return ".png", true
	case strings.HasPrefix(ct, "image/gif"):
		return ".gif", true
	case strings.HasPrefix(ct, "image/webp"):
		return ".webp", true
	default:
		// DetectContentType often returns application/octet-stream for webp.
		if len(head) >= 12 && string(head[0:4]) == "RIFF" && string(head[8:12]) == "WEBP" {
			return ".webp", true
		}
		return "", false
	}
}

func (h *AdminHandler) GetYieldSettings(c *gin.Context) {
	settings, err := h.admin.GetYieldSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) GetSocialSimSettings(c *gin.Context) {
	settings, err := h.admin.GetSocialSimSettings(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) UpdateSocialSimSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.SocialSimSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateSocialSimSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.onSocialSimUpdate != nil {
		h.onSocialSimUpdate(settings)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) UpdateYieldSettings(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var settings domain.PlatformYieldSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.admin.UpdateYieldSettings(c.Request.Context(), adminID, settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) CreateBroadcast(c *gin.Context) {
	adminID := middleware.GetUserID(c)
	var req struct {
		Message              string `json:"message" binding:"required"`
		IncludeChannelButton bool   `json:"include_channel_button"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	broadcast, err := h.telegram.CreateBroadcast(c.Request.Context(), adminID, req.Message, req.IncludeChannelButton)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, broadcast)
}

func (h *AdminHandler) ListBroadcasts(c *gin.Context) {
	items, err := h.telegram.ListBroadcasts(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AdminHandler) ListSweeps(c *gin.Context) {
	items, err := h.treasury.ListSweeps(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

type adminTransferView struct {
	ID            string   `json:"id"`
	Direction     string   `json:"direction"`
	Status        string   `json:"status"`
	AmountNanoton int64    `json:"amount_nanoton"`
	FeeNanoton    int64    `json:"fee_nanoton"`
	NetNanoton    int64    `json:"net_nanoton"`
	WalletAddress string   `json:"wallet_address"`
	TxHash        *string  `json:"tx_hash,omitempty"`
	ErrorMessage  *string  `json:"error_message,omitempty"`
	RiskScore     int      `json:"risk_score"`
	RiskFlags     []string `json:"risk_flags,omitempty"`
	ReviewReason  *string  `json:"review_reason,omitempty"`
	CreatedAt     string   `json:"created_at"`
	ConfirmedAt   *string  `json:"confirmed_at,omitempty"`
}

func toAdminTransferViews(items []domain.TonTransfer) []adminTransferView {
	out := make([]adminTransferView, 0, len(items))
	for i := range items {
		t := &items[i]
		var confirmedAt *string
		if t.ConfirmedAt != nil {
			v := t.ConfirmedAt.Format("2006-01-02T15:04:05Z07:00")
			confirmedAt = &v
		}
		out = append(out, adminTransferView{
			ID:            t.ID.String(),
			Direction:     string(t.Direction),
			Status:        string(t.Status),
			AmountNanoton: t.AmountNanoton,
			FeeNanoton:    t.FeeNanoton,
			NetNanoton:    t.NetAmountNanoton(),
			WalletAddress: t.WalletAddress,
			TxHash:        t.TxHash,
			ErrorMessage:  t.ErrorMessage,
			RiskScore:     t.RiskScore,
			RiskFlags:     t.RiskFlagList(),
			ReviewReason:  t.ReviewReason,
			CreatedAt:     t.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			ConfirmedAt:   confirmedAt,
		})
	}
	return out
}
