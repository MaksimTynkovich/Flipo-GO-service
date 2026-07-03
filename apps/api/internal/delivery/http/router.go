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
	DB             *gorm.DB
	Auth           *auth.Service
	AuthHandler    *handlers.AuthHandler
	InventoryHandler *handlers.InventoryHandler
	GameHandler    *handlers.GameHandler
	Hub            *websocket.Hub
}

func NewRouter(deps Deps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CORS())

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

		authed := v1.Group("")
		authed.Use(middleware.JWTAuth(deps.Auth))
		{
			authed.GET("/me", deps.AuthHandler.Me)
			authed.PATCH("/me/wallet", deps.AuthHandler.UpdateWallet)

			authed.GET("/inventory", deps.InventoryHandler.List)
			authed.POST("/inventory/deposit", deps.InventoryHandler.Deposit)
			authed.POST("/inventory/:id/liquidate", deps.InventoryHandler.Liquidate)
			authed.POST("/admin/floor-price", deps.InventoryHandler.SetFloorPrice)

			authed.GET("/staking/positions", deps.InventoryHandler.ListStaking)
			authed.POST("/staking/stake", deps.InventoryHandler.Stake)
			authed.POST("/staking/unstake/:id", deps.InventoryHandler.Unstake)

			authed.GET("/games/roulette/current", deps.GameHandler.RouletteCurrent)
			authed.GET("/games/roulette/history", deps.GameHandler.RouletteHistory)
			authed.POST("/games/roulette/bet", deps.GameHandler.RouletteBet)
			authed.GET("/games/crash/current", deps.GameHandler.CrashCurrent)
			authed.POST("/games/crash/bet", deps.GameHandler.CrashBet)
			authed.POST("/games/crash/bet/:id/cashout", deps.GameHandler.CrashCashout)
			authed.GET("/games/pvp/rooms", deps.GameHandler.PvPListRooms)
			authed.POST("/games/pvp/rooms", deps.GameHandler.PvPCreateRoom)
			authed.POST("/games/pvp/rooms/:id/join", deps.GameHandler.PvPJoinRoom)
		}
	}

	r.GET("/ws/games/:game", func(c *gin.Context) {
		game := c.Param("game")
		websocket.ServeWS(deps.Hub, game, c.Writer, c.Request)
	})

	return r
}
