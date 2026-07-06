package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/wallet"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WalletHandler struct {
	wallet *wallet.Service
}

func NewWalletHandler(walletSvc *wallet.Service) *WalletHandler {
	return &WalletHandler{wallet: walletSvc}
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
		writeWalletError(c, err)
		return
	}
	c.JSON(http.StatusOK, intent)
}

func (h *WalletHandler) ConfirmDeposit(c *gin.Context) {
	userID := middleware.GetUserID(c)
	transferID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid transfer id"})
		return
	}
	var req struct {
		TxHash string `json:"tx_hash"`
	}
	_ = c.ShouldBindJSON(&req)

	transfer, balance, err := h.wallet.ConfirmDeposit(c.Request.Context(), userID, transferID, req.TxHash)
	if err != nil {
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *WalletHandler) GetTransfer(c *gin.Context) {
	userID := middleware.GetUserID(c)
	transferID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid transfer id"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrInsufficientFunds):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrWalletNotLinked):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrTransferPending):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrTransferExpired):
		c.JSON(http.StatusGone, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrTransferNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrDuplicateRequest):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, domain.ErrChainUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
