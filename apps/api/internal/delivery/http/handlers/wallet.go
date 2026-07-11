package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/wallet"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WalletHandler struct {
	wallet    *wallet.Service
	analytics *analyticsuc.Service
}

func NewWalletHandler(walletSvc *wallet.Service, analyticsSvc *analyticsuc.Service) *WalletHandler {
	return &WalletHandler{wallet: walletSvc, analytics: analyticsSvc}
}

func (h *WalletHandler) CreateDepositIntent(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		AmountNanoton int64 `json:"amount_nanoton" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	intent, err := h.wallet.CreateDepositIntent(c.Request.Context(), userID, req.AmountNanoton)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "wallet", "deposit_intent_created", "error", "deposit_intent_failed", err.Error(), map[string]any{"amount_nanoton": req.AmountNanoton})
		writeWalletError(c, err)
		return
	}
	c.JSON(http.StatusOK, intent)
}

func (h *WalletHandler) ConfirmDeposit(c *gin.Context) {
	userID := middleware.GetUserID(c)
	transferID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID перевода"})
		return
	}
	var req struct {
		TxHash string `json:"tx_hash"`
	}
	_ = c.ShouldBindJSON(&req)

	transfer, balance, err := h.wallet.ConfirmDeposit(c.Request.Context(), userID, transferID, req.TxHash)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "wallet", "deposit_confirmed", "error", "deposit_confirm_failed", err.Error(), map[string]any{"transfer_id": transferID.String()})
		writeWalletError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"transfer": transfer,
		"balance":  balance,
	})
}

func (h *WalletHandler) RequestWithdrawal(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		AmountNanoton  int64  `json:"amount_nanoton" binding:"required"`
		IdempotencyKey string `json:"idempotency_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transfer, balance, err := h.wallet.RequestWithdrawal(
		c.Request.Context(),
		userID,
		req.AmountNanoton,
		req.IdempotencyKey,
	)
	if err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "wallet", "withdraw_requested", "error", "withdraw_failed", err.Error(), map[string]any{"amount_nanoton": req.AmountNanoton})
		writeWalletError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"transfer": transfer,
		"balance":  balance,
	})
}

func (h *WalletHandler) ListTransfers(c *gin.Context) {
	userID := middleware.GetUserID(c)
	items, err := h.wallet.ListTransfers(c.Request.Context(), userID, 30)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *WalletHandler) GetTransfer(c *gin.Context) {
	userID := middleware.GetUserID(c)
	transferID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID перевода"})
		return
	}
	transfer, err := h.wallet.GetTransfer(c.Request.Context(), userID, transferID)
	if err != nil {
		writeWalletError(c, err)
		return
	}
	c.JSON(http.StatusOK, transfer)
}

func writeWalletError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidAmount):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Укажи корректную сумму. Проверь минимальный лимит операции.",
			"code":  "invalid_amount",
		})
	case errors.Is(err, domain.ErrInsufficientFunds):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Недостаточно средств на балансе.",
			"code":  "insufficient_funds",
		})
	case errors.Is(err, domain.ErrWalletNotLinked):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Сначала подключи TON-кошелёк.",
			"code":  "wallet_not_linked",
		})
	case errors.Is(err, domain.ErrTransferPending):
		httperr.Respond(c, http.StatusConflict, err, gin.H{
			"error": "У тебя уже есть активная операция. Дождись её завершения.",
			"code":  "transfer_pending",
		})
	case errors.Is(err, domain.ErrTransferExpired):
		httperr.Respond(c, http.StatusGone, err, gin.H{
			"error": "Время на оплату истекло. Создай новое пополнение.",
			"code":  "transfer_expired",
		})
	case errors.Is(err, domain.ErrTransferNotFound):
		httperr.Respond(c, http.StatusNotFound, err, gin.H{
			"error": "Операция не найдена.",
			"code":  "transfer_not_found",
		})
	case errors.Is(err, domain.ErrDuplicateRequest):
		httperr.Respond(c, http.StatusConflict, err, gin.H{
			"error": "Такой запрос уже обрабатывается.",
			"code":  "duplicate_request",
		})
	case errors.Is(err, domain.ErrChainUnavailable):
		httperr.Respond(c, http.StatusServiceUnavailable, err, gin.H{
			"error": "Сервис TON временно недоступен. Попробуй через пару минут.",
			"code":  "chain_unavailable",
		})
	default:
		httperr.Respond(c, http.StatusInternalServerError, err, gin.H{
			"error": "Не удалось выполнить операцию. Попробуй ещё раз.",
			"code":  "internal_error",
		})
	}
}
