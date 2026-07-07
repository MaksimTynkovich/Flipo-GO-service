package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/pvp"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type GameHandler struct {
	roulette *roulette.Service
	crash    *crash.Service
	pvp      *pvp.Service
}

func NewGameHandler(r *roulette.Service, c *crash.Service, p *pvp.Service) *GameHandler {
	return &GameHandler{roulette: r, crash: c, pvp: p}
}

func (h *GameHandler) RouletteCurrent(c *gin.Context) {
	state, err := h.roulette.CurrentState(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *GameHandler) RouletteHistory(c *gin.Context) {
	history, err := h.roulette.GetHistory(c.Request.Context(), 10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if history == nil {
		history = []roulette.HistoryEntry{}
	}
	c.JSON(http.StatusOK, history)
}

func (h *GameHandler) RouletteBets(c *gin.Context) {
	bets, err := h.roulette.GetCurrentRoundBets(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if bets.Bets == nil {
		bets.Bets = []roulette.BetView{}
	}
	c.JSON(http.StatusOK, bets)
}

func (h *GameHandler) RouletteBet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Color          string `json:"color" binding:"required"`
		AmountNanoton  int64  `json:"amount_nanoton" binding:"required"`
		IdempotencyKey string `json:"idempotency_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bet, err := h.roulette.PlaceBet(c.Request.Context(), userID, req.Color, req.AmountNanoton, req.IdempotencyKey)
	if err != nil {
		writeGameBetError(c, err)
		return
	}
	c.JSON(http.StatusCreated, bet)
}

func (h *GameHandler) CrashCurrent(c *gin.Context) {
	state, err := h.crash.CurrentState(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *GameHandler) CrashHistory(c *gin.Context) {
	history, err := h.crash.GetHistory(c.Request.Context(), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if history == nil {
		history = []crash.HistoryEntry{}
	}
	c.JSON(http.StatusOK, history)
}

func (h *GameHandler) CrashBet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		AmountNanoton  int64  `json:"amount_nanoton" binding:"required"`
		IdempotencyKey string `json:"idempotency_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bet, err := h.crash.PlaceBet(c.Request.Context(), userID, req.AmountNanoton, req.IdempotencyKey)
	if err != nil {
		writeGameBetError(c, err)
		return
	}
	c.JSON(http.StatusCreated, bet)
}

func (h *GameHandler) CrashActiveBet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	bet, err := h.crash.ActiveBet(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, bet)
}

func (h *GameHandler) CrashCashout(c *gin.Context) {
	userID := middleware.GetUserID(c)
	betID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bet id"})
		return
	}
	var req struct {
		Multiplier float64 `json:"multiplier" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payout, err := h.crash.Cashout(c.Request.Context(), userID, betID, req.Multiplier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payout_nanoton": payout})
}

func (h *GameHandler) PvPListRooms(c *gin.Context) {
	state, err := h.pvp.CurrentState(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if state.Active == nil {
		state.Active = []pvp.RoomView{}
	}
	if state.History == nil {
		state.History = []pvp.RoomView{}
	}
	c.JSON(http.StatusOK, state)
}

func (h *GameHandler) PvPCreateRoom(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		BetAmountNanoton int64 `json:"bet_amount_nanoton" binding:"required"`
		MaxPlayers       int   `json:"max_players"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
  if req.MaxPlayers == 0 {
		req.MaxPlayers = 2
	}
	if req.MaxPlayers != 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pvp rooms support exactly 2 players"})
		return
	}
	room, err := h.pvp.CreateRoom(c.Request.Context(), userID, req.BetAmountNanoton, req.MaxPlayers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, room)
}

func (h *GameHandler) PvPJoinRoom(c *gin.Context) {
	userID := middleware.GetUserID(c)
	roomID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room id"})
		return
	}
	room, err := h.pvp.JoinRoom(c.Request.Context(), userID, roomID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, room)
}

func writeGameBetError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidAmount):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Укажите корректную сумму ставки.",
			"code":  "invalid_amount",
		})
	case errors.Is(err, domain.ErrInsufficientFunds),
		strings.Contains(strings.ToLower(err.Error()), "insufficient balance"):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Недостаточно средств на балансе.",
			"code":  "insufficient_funds",
		})
	case errors.Is(err, domain.ErrRoundNotOpen):
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Ставки больше не принимаются.",
			"code":  "round_not_open",
		})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
