package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/crash"
	"github.com/flipo/flipo/apps/api/internal/usecase/fairness"
	"github.com/flipo/flipo/apps/api/internal/usecase/pvp"
	"github.com/flipo/flipo/apps/api/internal/usecase/risk"
	"github.com/flipo/flipo/apps/api/internal/usecase/roulette"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type GameHandler struct {
	roulette  *roulette.Service
	crash     *crash.Service
	pvp       *pvp.Service
	risk      *risk.Service
	fairness  *fairness.Service
	analytics *analyticsuc.Service
}

func NewGameHandler(r *roulette.Service, c *crash.Service, p *pvp.Service, riskSvc *risk.Service, fairnessSvc *fairness.Service, analyticsSvc *analyticsuc.Service) *GameHandler {
	return &GameHandler{roulette: r, crash: c, pvp: p, risk: riskSvc, fairness: fairnessSvc, analytics: analyticsSvc}
}

func (h *GameHandler) RouletteCurrent(c *gin.Context) {
	state, err := h.roulette.CurrentState(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *GameHandler) RouletteHistory(c *gin.Context) {
	history, err := h.roulette.GetHistory(c.Request.Context(), 10)
	if err != nil {
		respondInternal(c, err)
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
		respondInternal(c, err)
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
	state, _ := h.roulette.CurrentState(c.Request.Context())
	roundID := uuid.Nil
	if state != nil {
		roundID = state.RoundID
	}
	maxPayout := req.AmountNanoton * 14
	if req.Color == "red" || req.Color == "black" {
		maxPayout = req.AmountNanoton * 2
	}
	if err := h.risk.ValidateBet(c.Request.Context(), risk.BetCheckInput{
		UserID: userID, GameType: domain.GameRoulette, RoundID: roundID,
		Amount: req.AmountNanoton, MaxPayout: maxPayout,
	}); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "roulette_bet_placed", "error", "risk_blocked", err.Error(), map[string]any{"mode": "roulette", "amount_nanoton": req.AmountNanoton, "color": req.Color})
		writeGameBetError(c, err)
		return
	}
	bet, err := h.roulette.PlaceBet(c.Request.Context(), userID, req.Color, req.AmountNanoton, req.IdempotencyKey)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "roulette_bet_placed", "error", "bet_failed", err.Error(), map[string]any{"mode": "roulette", "amount_nanoton": req.AmountNanoton, "color": req.Color})
		writeGameBetError(c, err)
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "roulette_bet_placed", "success", "", "", map[string]any{"mode": "roulette", "amount_nanoton": req.AmountNanoton, "color": req.Color, "bet_id": bet.ID.String()})
	c.JSON(http.StatusCreated, bet)
}

func (h *GameHandler) CrashCurrent(c *gin.Context) {
	state, err := h.crash.CurrentState(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *GameHandler) CrashHistory(c *gin.Context) {
	history, err := h.crash.GetHistory(c.Request.Context(), 12)
	if err != nil {
		respondInternal(c, err)
		return
	}
	if history == nil {
		history = []crash.HistoryEntry{}
	}
	c.JSON(http.StatusOK, history)
}

func (h *GameHandler) CrashBets(c *gin.Context) {
	bets, err := h.crash.GetCurrentRoundBets(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
		return
	}
	if bets.Bets == nil {
		bets.Bets = []crash.BetView{}
	}
	c.JSON(http.StatusOK, bets)
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
	state, _ := h.crash.CurrentState(c.Request.Context())
	roundID := uuid.Nil
	if state != nil {
		roundID = state.RoundID
	}
	if err := h.risk.ValidateBet(c.Request.Context(), risk.BetCheckInput{
		UserID: userID, GameType: domain.GameCrash, RoundID: roundID,
		Amount: req.AmountNanoton, MaxPayout: req.AmountNanoton * 100,
	}); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "crash_bet_placed", "error", "risk_blocked", err.Error(), map[string]any{"mode": "crash", "amount_nanoton": req.AmountNanoton})
		writeGameBetError(c, err)
		return
	}
	bet, err := h.crash.PlaceBet(c.Request.Context(), userID, req.AmountNanoton, req.IdempotencyKey)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "crash_bet_placed", "error", "bet_failed", err.Error(), map[string]any{"mode": "crash", "amount_nanoton": req.AmountNanoton})
		writeGameBetError(c, err)
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "crash_bet_placed", "success", "", "", map[string]any{"mode": "crash", "amount_nanoton": req.AmountNanoton, "bet_id": bet.ID.String()})
	c.JSON(http.StatusCreated, bet)
}

func (h *GameHandler) CrashActiveBet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	bet, err := h.crash.ActiveBet(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
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
		trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "crash_cashout_completed", "error", "cashout_failed", err.Error(), map[string]any{"mode": "crash", "bet_id": betID.String(), "multiplier": req.Multiplier})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "gameplay", "crash_cashout_completed", "success", "", "", map[string]any{"mode": "crash", "bet_id": betID.String(), "multiplier": req.Multiplier, "payout_nanoton": payout})
	c.JSON(http.StatusOK, gin.H{"payout_nanoton": payout})
}

func (h *GameHandler) PvPListRooms(c *gin.Context) {
	state, err := h.pvp.CurrentState(c.Request.Context())
	if err != nil {
		respondInternal(c, err)
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
	if err := h.risk.ValidateBet(c.Request.Context(), risk.BetCheckInput{
		UserID: userID, GameType: domain.GamePvP,
		Amount: req.BetAmountNanoton, MaxPayout: req.BetAmountNanoton * 2,
	}); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "pvp", "pvp_room_created", "error", "risk_blocked", err.Error(), map[string]any{"mode": "pvp", "amount_nanoton": req.BetAmountNanoton})
		writeGameBetError(c, err)
		return
	}
	room, err := h.pvp.CreateRoom(c.Request.Context(), userID, req.BetAmountNanoton, req.MaxPlayers)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "pvp", "pvp_room_created", "error", "create_failed", err.Error(), map[string]any{"mode": "pvp", "amount_nanoton": req.BetAmountNanoton})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "pvp", "pvp_room_created", "success", "", "", map[string]any{"mode": "pvp", "room_id": room.ID, "amount_nanoton": req.BetAmountNanoton})
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
		trackUserEvent(h.analytics, c.Request.Context(), userID, "pvp", "pvp_room_joined", "error", "join_failed", err.Error(), map[string]any{"mode": "pvp", "room_id": roomID.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "pvp", "pvp_room_joined", "success", "", "", map[string]any{"mode": "pvp", "room_id": roomID.String()})
	c.JSON(http.StatusOK, room)
}

func (h *GameHandler) RoundProof(c *gin.Context) {
	roundID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid round id"})
		return
	}
	proof, err := h.fairness.RoundProof(c.Request.Context(), roundID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, proof)
}

func writeGameBetError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidAmount):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Укажите корректную сумму ставки.",
			"code":  "invalid_amount",
		})
	case errors.Is(err, domain.ErrInsufficientFunds),
		strings.Contains(strings.ToLower(err.Error()), "insufficient balance"):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Недостаточно средств на балансе.",
			"code":  "insufficient_funds",
		})
	case errors.Is(err, domain.ErrRoundNotOpen):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Ставки больше не принимаются.",
			"code":  "round_not_open",
		})
	case errors.Is(err, domain.ErrBetLimitExceeded):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Ставка превышает лимит.",
			"code":  "bet_limit_exceeded",
		})
	case errors.Is(err, domain.ErrDailyWinCap):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Достигнут дневной лимит выигрыша.",
			"code":  "daily_win_cap",
		})
	case errors.Is(err, domain.ErrUserBanned):
		httperr.Respond(c, http.StatusForbidden, err, gin.H{
			"error": "Аккаунт заблокирован.",
			"code":  "user_banned",
		})
	case errors.Is(err, domain.ErrGameDisabled):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Игра временно недоступна.",
			"code":  "game_disabled",
		})
	default:
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error()})
	}
}
