package http

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/handlers"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/delivery/websocket"
	"github.com/flipo/flipo/apps/api/internal/usecase/auth"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Deps struct {
	DB               *gorm.DB
	Auth             *auth.Service
	AuthHandler      *handlers.AuthHandler
	InventoryHandler *handlers.InventoryHandler
	StakingHandler   *handlers.StakingHandler
	GameHandler      *handlers.GameHandler
	MarketHandler    *handlers.MarketHandler
	ReferralHandler  *handlers.ReferralHandler
	WalletHandler    *handlers.WalletHandler
	TelegramHandler  *handlers.TelegramHandler
	PromoHandler     *handlers.PromoHandler
	AdminHandler     *handlers.AdminHandler
	AnalyticsHandler *handlers.AnalyticsHandler
	PresenceHandler  *handlers.PresenceHandler
	AdminTelegramIDs []int64
	Hub              *websocket.Hub
}

func NewRouter(deps Deps) *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS())
	r.Use(middleware.RequestMeta())
	r.Use(middleware.AccessLog())

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
		v1.POST("/auth/telegram", deps.AuthHandler.TelegramAuth)
		v1.POST("/auth/debug", deps.AuthHandler.DebugAuth)
		v1.POST("/analytics/events", deps.AnalyticsHandler.Ingest)
		v1.POST("/telegram/webhook", deps.TelegramHandler.Webhook)

		v1.GET("/market/listings", deps.MarketHandler.List)
		v1.GET("/market/listings/:id", deps.MarketHandler.Get)
		v1.GET("/games/:game/rounds/:id/proof", deps.GameHandler.RoundProof)
		v1.GET("/presence", deps.PresenceHandler.Get)

		authed := v1.Group("")
		authed.Use(middleware.JWTAuth(deps.Auth))
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
			authed.POST("/staking/stake", deps.StakingHandler.Stake)
			authed.POST("/staking/unstake/:id", deps.StakingHandler.Unstake)

			authed.GET("/referrals/stats", deps.ReferralHandler.Stats)

			authed.POST("/promos/activate", deps.PromoHandler.Activate)
			authed.GET("/promos/status", deps.PromoHandler.Status)

			authed.POST("/wallet/deposit/intent", deps.WalletHandler.CreateDepositIntent)
			authed.POST("/wallet/deposit/:id/confirm", deps.WalletHandler.ConfirmDeposit)
			authed.POST("/wallet/withdraw", deps.WalletHandler.RequestWithdrawal)
			authed.GET("/wallet/transfers", deps.WalletHandler.ListTransfers)
			authed.GET("/wallet/transfers/:id", deps.WalletHandler.GetTransfer)

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
		admin.Use(middleware.AdminAuth(deps.Auth, deps.AdminTelegramIDs))
		{
			admin.GET("/revenue/summary", deps.AdminHandler.RevenueSummary)
			admin.GET("/revenue/timeseries", deps.AdminHandler.RevenueTimeseries)
			admin.GET("/transfers", deps.AdminHandler.Transfers)
			admin.POST("/transfers/:id/review", deps.AdminHandler.ReviewTransfer)
			admin.GET("/ledger", deps.AdminHandler.Ledger)
			admin.GET("/analytics/overview", deps.AdminHandler.AnalyticsOverview)
			admin.GET("/analytics/users/:id", deps.AdminHandler.AnalyticsUserDrilldown)
			admin.GET("/games/stats", deps.AdminHandler.GameStats)
			admin.GET("/games/configs", deps.AdminHandler.ListGameConfigs)
			admin.PATCH("/games/configs", deps.AdminHandler.UpdateGameConfig)
			admin.GET("/social-sim", deps.AdminHandler.GetSocialSimSettings)
			admin.PATCH("/social-sim", deps.AdminHandler.UpdateSocialSimSettings)
			admin.POST("/games/:game/rotate-seed", deps.AdminHandler.RotateSeed)
			admin.GET("/games/:game/seeds", deps.AdminHandler.SeedHistory)
			admin.GET("/risk/users", deps.AdminHandler.RiskUsers)
			admin.GET("/risk/settings", deps.AdminHandler.GetRiskSettings)
			admin.PATCH("/risk/settings", deps.AdminHandler.UpdateRiskSettings)
			admin.GET("/treasury/status", deps.AdminHandler.TreasuryStatus)
			admin.GET("/users", deps.AdminHandler.ListUsers)
			admin.GET("/users/:id/bets", deps.AdminHandler.UserBets)
			admin.PATCH("/market/listings/:id", deps.AdminHandler.UpdateMarketListingPrice)
			admin.GET("/gift-price-settings", deps.AdminHandler.GetGiftPriceSettings)
			admin.PATCH("/gift-price-settings", deps.AdminHandler.UpdateGiftPriceSettings)
			admin.GET("/marketing/promos", deps.AdminHandler.ListPromoCodes)
			admin.GET("/marketing/settings", deps.AdminHandler.GetYieldSettings)
			admin.PATCH("/marketing/settings", deps.AdminHandler.UpdateYieldSettings)
			admin.PUT("/marketing/promos", deps.AdminHandler.UpsertPromoCode)
			admin.DELETE("/marketing/promos/:code", deps.AdminHandler.DeletePromoCode)
			admin.GET("/telegram/settings", deps.AdminHandler.GetBotSettings)
			admin.PATCH("/telegram/settings", deps.AdminHandler.UpdateBotSettings)
			admin.POST("/telegram/broadcast", deps.AdminHandler.CreateBroadcast)
			admin.GET("/telegram/broadcasts", deps.AdminHandler.ListBroadcasts)
			admin.GET("/treasury/sweeps", deps.AdminHandler.ListSweeps)
			admin.GET("/audit", deps.AdminHandler.AuditLogs)
		}
	}

	r.GET("/ws/games/:game", func(c *gin.Context) {
		game := c.Param("game")
		websocket.ServeWS(deps.Hub, game, c.Writer, c.Request)
	})

	r.GET("/ws/user", func(c *gin.Context) {
		websocket.ServeUserWS(deps.Hub, deps.Auth, c.Writer, c.Request)
	})

	return r
}
