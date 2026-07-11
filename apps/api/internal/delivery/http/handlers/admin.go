package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/admin"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/fairness"
	"github.com/flipo/flipo/apps/api/internal/usecase/telegramadmin"
	"github.com/flipo/flipo/apps/api/internal/usecase/treasury"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AdminHandler struct {
	admin             *admin.Service
	analytics         *analyticsuc.Service
	fairness          *fairness.Service
	treasury          *treasury.Service
	telegram          *telegramadmin.Service
	hotAddr           string
	onSocialSimUpdate func(domain.SocialSimSettings)
}

func NewAdminHandler(adminSvc *admin.Service, analyticsSvc *analyticsuc.Service, fairnessSvc *fairness.Service, treasurySvc *treasury.Service, telegramSvc *telegramadmin.Service, hotAddr string) *AdminHandler {
	return &AdminHandler{
		admin:     adminSvc,
		analytics: analyticsSvc,
		fairness:  fairnessSvc,
		treasury:  treasurySvc,
		telegram:  telegramSvc,
		hotAddr:   hotAddr,
	}
}

func (h *AdminHandler) SetSocialSimUpdater(fn func(domain.SocialSimSettings)) {
	h.onSocialSimUpdate = fn
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
	users, err := h.admin.ListUsers(c.Request.Context(), c.Query("q"))
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *AdminHandler) UserBets(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID пользователя"})
		return
	}
	bets, err := h.admin.UserBets(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, bets)
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
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	broadcast, err := h.telegram.CreateBroadcast(c.Request.Context(), adminID, req.Message)
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
			RiskScore:     t.RiskScore,
			RiskFlags:     t.RiskFlagList(),
			ReviewReason:  t.ReviewReason,
			CreatedAt:     t.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			ConfirmedAt:   confirmedAt,
		})
	}
	return out
}
