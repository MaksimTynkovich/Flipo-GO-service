package http

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/handlers"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Deps struct {
	DB                  *gorm.DB
	Auth                *auth.Service
	AuthHandler         *handlers.AuthHandler
	InventoryHandler    *handlers.InventoryHandler
	StakingHandler      *handlers.StakingHandler
	GameHandler         *handlers.GameHandler
	MarketHandler       *handlers.MarketHandler
	ReferralHandler     *handlers.ReferralHandler
	WalletHandler       *handlers.WalletHandler
	TelegramHandler     *handlers.TelegramHandler
	PromoHandler        *handlers.PromoHandler
	WheelHandler        *handlers.WheelHandler
	CasesHandler        *handlers.CasesHandler
	AdminHandler        *handlers.AdminHandler
	AnalyticsHandler    *handlers.AnalyticsHandler
	PresenceHandler     *handlers.PresenceHandler
	MaintenanceHandler  *handlers.MaintenanceHandler
	MaintenanceState    *middleware.MaintenanceState
	AdminTelegramIDs    []int64
	Hub                 *websocket.Hub
	BotsDataDir         string
	CasesUploadDir      string
	GiftImageHandler    *handlers.GiftImageHandler
	CORSOrigins         []string
}

func NewRouter(deps Deps) *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS(deps.CORSOrigins...))
	r.Use(middleware.RequestMeta())
	r.Use(middleware.AccessLog())
	if deps.MaintenanceState != nil {
		r.Use(middleware.MaintenanceGate(deps.MaintenanceState, deps.Auth))
	}

	// Curated bot roster (assets/bots) for the live-online overlay avatars.
	if deps.BotsDataDir != "" {
		if abs, err := filepath.Abs(deps.BotsDataDir); err == nil {
			r.Static("/static/bots", abs)
		}
	}
	if deps.CasesUploadDir != "" {
		if abs, err := filepath.Abs(deps.CasesUploadDir); err == nil {
			_ = os.MkdirAll(abs, 0o755)
			r.Static("/static/cases", abs)
		}
	}

	if deps.GiftImageHandler != nil {
		r.GET("/static/gifts/*file", deps.GiftImageHandler.Serve)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/ready", func(c *gin.Context) {
		sqlDB, err := deps.DB.DB()
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
			return
		}
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	v1 := r.Group("/api/v1")
	{
		if deps.MaintenanceHandler != nil {
			v1.GET("/maintenance", deps.MaintenanceHandler.Status)
		}
		v1.POST("/auth/telegram", deps.AuthHandler.TelegramAuth)
		v1.POST("/auth/debug", deps.AuthHandler.DebugAuth)
		v1.POST("/analytics/events", deps.AnalyticsHandler.Ingest)
		v1.POST("/telegram/webhook", deps.TelegramHandler.Webhook)

		v1.GET("/market/listings", deps.MarketHandler.List)
		v1.GET("/market/listings/:id", deps.MarketHandler.Get)
		v1.GET("/games/:game/rounds/:id/proof", deps.GameHandler.RoundProof)
		v1.GET("/presence", deps.PresenceHandler.Get)

		authed := v1.Group("")
		authed.Use(middleware.JWTAuth(deps.Auth), middleware.UserBanGate(deps.Auth))
		{
			authed.GET("/me", deps.AuthHandler.Me)
			authed.PATCH("/me/wallet", deps.AuthHandler.UpdateWallet)
			authed.DELETE("/me/wallet", deps.AuthHandler.ClearWallet)

			authed.GET("/inventory", deps.InventoryHandler.List)
			authed.POST("/inventory/deposit", deps.InventoryHandler.Deposit)
			authed.POST("/inventory/:id/liquidate", deps.InventoryHandler.Liquidate)
			authed.POST("/inventory/:id/withdraw", deps.InventoryHandler.Withdraw)

			authed.GET("/market/listings/mine", deps.MarketHandler.ListMine)
			authed.POST("/market/listings", deps.MarketHandler.Create)
			authed.DELETE("/market/listings/:id", deps.MarketHandler.Cancel)
			authed.POST("/market/listings/:id/buy", deps.MarketHandler.Buy)

			authed.GET("/staking/gifts", deps.StakingHandler.ListProfileGifts)
			authed.GET("/staking/positions", deps.StakingHandler.ListPositions)
			authed.GET("/staking/quests", deps.StakingHandler.ListQuests)
			authed.POST("/staking/stake", deps.StakingHandler.Stake)
			authed.POST("/staking/unstake/:id", deps.StakingHandler.Unstake)

			authed.GET("/referrals/stats", deps.ReferralHandler.Stats)
			authed.GET("/referrals/invitee", deps.ReferralHandler.InviteeStatus)
			authed.POST("/referrals/share-event", deps.ReferralHandler.ShareEvent)

			authed.POST("/promos/activate", deps.PromoHandler.Activate)
			authed.GET("/promos/status", deps.PromoHandler.Status)

			authed.GET("/wheel/status", deps.WheelHandler.Status)
			authed.POST("/wheel/spin", deps.WheelHandler.Spin)

			authed.GET("/cases/features", deps.CasesHandler.Features)
			authed.GET("/cases", deps.CasesHandler.Catalog)
			authed.GET("/cases/opens", deps.CasesHandler.Opens)
			authed.GET("/cases/live", deps.CasesHandler.Live)
			authed.GET("/cases/:id", deps.CasesHandler.Get)
			authed.POST("/cases/:id/open", deps.CasesHandler.Open)

			authed.POST("/wallet/deposit/intent", deps.WalletHandler.CreateDepositIntent)
			authed.POST("/wallet/deposit/:id/confirm", deps.WalletHandler.ConfirmDeposit)
			authed.POST("/wallet/withdraw", deps.WalletHandler.RequestWithdrawal)
			authed.GET("/wallet/transfers", deps.WalletHandler.ListTransfers)
			authed.GET("/wallet/transfers/:id", deps.WalletHandler.GetTransfer)

			authed.GET("/games/modes", deps.GameHandler.Modes)
			authed.GET("/games/roulette/current", deps.GameHandler.RouletteCurrent)
			authed.GET("/games/roulette/history", deps.GameHandler.RouletteHistory)
			authed.GET("/games/roulette/bets", deps.GameHandler.RouletteBets)
			authed.POST("/games/roulette/bet", deps.GameHandler.RouletteBet)
			authed.GET("/games/crash/current", deps.GameHandler.CrashCurrent)
			authed.GET("/games/crash/history", deps.GameHandler.CrashHistory)
			authed.GET("/games/crash/bets", deps.GameHandler.CrashBets)
			authed.GET("/games/crash/bet/active", deps.GameHandler.CrashActiveBet)
			authed.POST("/games/crash/bet", deps.GameHandler.CrashBet)
			authed.POST("/games/crash/bet/:id/cashout", deps.GameHandler.CrashCashout)
			authed.GET("/games/pvp/rooms", deps.GameHandler.PvPListRooms)
			authed.POST("/games/pvp/rooms", deps.GameHandler.PvPCreateRoom)
			authed.POST("/games/pvp/rooms/:id/join", deps.GameHandler.PvPJoinRoom)
		}

		admin := v1.Group("/admin")
		admin.POST("/auth/login", deps.AuthHandler.AdminPanelLogin)
		admin.GET("/auth/login/:id", deps.AuthHandler.AdminPanelLoginStatus)
		adminAuthed := admin.Group("")
		adminAuthed.Use(middleware.AdminAuth(deps.Auth, deps.AdminTelegramIDs))
		{
			adminAuthed.GET("/revenue/summary", deps.AdminHandler.RevenueSummary)
			adminAuthed.GET("/revenue/timeseries", deps.AdminHandler.RevenueTimeseries)
			adminAuthed.GET("/transfers", deps.AdminHandler.Transfers)
			adminAuthed.POST("/transfers/:id/review", deps.AdminHandler.ReviewTransfer)
			adminAuthed.GET("/ledger", deps.AdminHandler.Ledger)
			adminAuthed.GET("/analytics/overview", deps.AdminHandler.AnalyticsOverview)
			adminAuthed.GET("/analytics/users/:id", deps.AdminHandler.AnalyticsUserDrilldown)
			adminAuthed.GET("/games/stats", deps.AdminHandler.GameStats)
			adminAuthed.GET("/games/configs", deps.AdminHandler.ListGameConfigs)
			adminAuthed.PATCH("/games/configs", deps.AdminHandler.UpdateGameConfig)
			adminAuthed.GET("/social-sim", deps.AdminHandler.GetSocialSimSettings)
			adminAuthed.PATCH("/social-sim", deps.AdminHandler.UpdateSocialSimSettings)
			adminAuthed.POST("/games/:game/rotate-seed", deps.AdminHandler.RotateSeed)
			adminAuthed.GET("/games/:game/seeds", deps.AdminHandler.SeedHistory)
			adminAuthed.GET("/outcome/overrides", deps.AdminHandler.ListOutcomeOverrides)
			adminAuthed.POST("/outcome/overrides", deps.AdminHandler.CreateOutcomeOverride)
			adminAuthed.DELETE("/outcome/overrides/:id", deps.AdminHandler.DeleteOutcomeOverride)
			adminAuthed.GET("/risk/users", deps.AdminHandler.RiskUsers)
			adminAuthed.GET("/risk/settings", deps.AdminHandler.GetRiskSettings)
			adminAuthed.PATCH("/risk/settings", deps.AdminHandler.UpdateRiskSettings)
			adminAuthed.GET("/treasury/status", deps.AdminHandler.TreasuryStatus)
			adminAuthed.GET("/users", deps.AdminHandler.ListUsers)
			adminAuthed.GET("/users/stats", deps.AdminHandler.UserAudience)
			adminAuthed.PATCH("/users/:id/ban", deps.AdminHandler.SetUserBanned)
			adminAuthed.PATCH("/users/:id/withdrawals", deps.AdminHandler.SetUserWithdrawalsDisabled)
			adminAuthed.PATCH("/users/:id/balance", deps.AdminHandler.SetUserBalance)
			adminAuthed.GET("/users/:id/bets", deps.AdminHandler.UserBets)
			adminAuthed.GET("/users/:id/transfers", deps.AdminHandler.UserTransfers)
			adminAuthed.PATCH("/market/listings/:id", deps.AdminHandler.UpdateMarketListingPrice)
			adminAuthed.POST("/market/sync-bot-gifts", deps.AdminHandler.SyncBotMarketGifts)
			adminAuthed.POST("/market/reprice-bot-gifts", deps.AdminHandler.RepriceBotMarketGifts)
			adminAuthed.GET("/gift-price-settings", deps.AdminHandler.GetGiftPriceSettings)
			adminAuthed.PATCH("/gift-price-settings", deps.AdminHandler.UpdateGiftPriceSettings)
			adminAuthed.GET("/gift-trait-prices", deps.AdminHandler.ListGiftTraitPrices)
			adminAuthed.PATCH("/gift-trait-prices", deps.AdminHandler.UpdateGiftTraitPrice)
			adminAuthed.GET("/marketing/promos", deps.AdminHandler.ListPromoCodes)
			adminAuthed.GET("/marketing/settings", deps.AdminHandler.GetYieldSettings)
			adminAuthed.PATCH("/marketing/settings", deps.AdminHandler.UpdateYieldSettings)
			adminAuthed.PUT("/marketing/promos", deps.AdminHandler.UpsertPromoCode)
			adminAuthed.DELETE("/marketing/promos/:code", deps.AdminHandler.DeletePromoCode)
			adminAuthed.GET("/marketing/wheel", deps.AdminHandler.WheelStats)
			adminAuthed.GET("/marketing/wheel/segments", deps.AdminHandler.ListWheelSegments)
			adminAuthed.PUT("/marketing/wheel/segments/:id", deps.AdminHandler.UpdateWheelSegment)
			adminAuthed.GET("/marketing/wheel/overrides", deps.AdminHandler.ListWheelSpinOverrides)
			adminAuthed.POST("/marketing/wheel/overrides", deps.AdminHandler.CreateWheelSpinOverride)
			adminAuthed.DELETE("/marketing/wheel/overrides/:id", deps.AdminHandler.DeleteWheelSpinOverride)
			adminAuthed.POST("/marketing/wheel/grant-spins", deps.AdminHandler.GrantWheelBonusSpins)
			adminAuthed.GET("/telegram/settings", deps.AdminHandler.GetBotSettings)
			adminAuthed.PATCH("/telegram/settings", deps.AdminHandler.UpdateBotSettings)
			adminAuthed.GET("/maintenance", deps.AdminHandler.GetMaintenanceSettings)
			adminAuthed.PATCH("/maintenance", deps.AdminHandler.UpdateMaintenanceSettings)
			adminAuthed.GET("/withdrawals/settings", deps.AdminHandler.GetWithdrawalSettings)
			adminAuthed.PATCH("/withdrawals/settings", deps.AdminHandler.UpdateWithdrawalSettings)
			adminAuthed.GET("/withdrawals/gifts", deps.AdminHandler.ListPendingGiftWithdrawals)
			adminAuthed.POST("/withdrawals/gifts/:id/review", deps.AdminHandler.ReviewGiftWithdrawal)
			adminAuthed.POST("/withdrawals/gifts/:id/fulfill", deps.AdminHandler.FulfillGiftWithdrawal)
			adminAuthed.GET("/cases", deps.AdminHandler.ListCases)
			adminAuthed.PUT("/cases", deps.AdminHandler.UpsertCase)
			adminAuthed.POST("/cases/upload", deps.AdminHandler.UploadCaseImage)
			adminAuthed.GET("/cases/settings", deps.AdminHandler.GetCaseCatalogSettings)
			adminAuthed.PATCH("/cases/settings", deps.AdminHandler.UpdateCaseCatalogSettings)
			adminAuthed.GET("/cases/live-settings", deps.AdminHandler.GetCaseLiveFeedSettings)
			adminAuthed.PATCH("/cases/live-settings", deps.AdminHandler.UpdateCaseLiveFeedSettings)
			adminAuthed.GET("/cases/promos", deps.AdminHandler.ListCasePromoCodes)
			adminAuthed.PUT("/cases/promos", deps.AdminHandler.UpsertCasePromoCode)
			adminAuthed.DELETE("/cases/promos/:code", deps.AdminHandler.DeleteCasePromoCode)
			adminAuthed.PUT("/cases/:id/loot", deps.AdminHandler.ReplaceCaseLoot)
			adminAuthed.POST("/cases/:id/simulate", deps.AdminHandler.SimulateCase)
			adminAuthed.POST("/telegram/broadcast", deps.AdminHandler.CreateBroadcast)
			adminAuthed.GET("/telegram/broadcasts", deps.AdminHandler.ListBroadcasts)
			adminAuthed.GET("/treasury/sweeps", deps.AdminHandler.ListSweeps)
			adminAuthed.GET("/audit", deps.AdminHandler.AuditLogs)
			adminAuthed.GET("/online", deps.AdminHandler.OnlineNow)
			adminAuthed.GET("/notifications", deps.AdminHandler.ListNotifications)
			adminAuthed.GET("/notifications/unread-count", deps.AdminHandler.UnreadNotificationCount)
			adminAuthed.POST("/notifications/:id/read", deps.AdminHandler.MarkNotificationRead)
			adminAuthed.POST("/notifications/read-all", deps.AdminHandler.MarkAllNotificationsRead)
		}
	}

	r.GET("/ws/games/:game", func(c *gin.Context) {
		game := c.Param("game")
		switch game {
		case "roulette", "crash", "pvp", "cases":
			websocket.ServeWS(deps.Hub, game, c.Writer, c.Request)
		default:
			c.Status(http.StatusNotFound)
		}
	})

	r.GET("/ws/user", func(c *gin.Context) {
		websocket.ServeUserWS(deps.Hub, deps.Auth, c.Writer, c.Request)
	})

	r.GET("/ws/admin", func(c *gin.Context) {
		websocket.ServeAdminWS(deps.Hub, deps.Auth, c.Writer, c.Request)
	})

	return r
}
