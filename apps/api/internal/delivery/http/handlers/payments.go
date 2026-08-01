package handlers

import (
	"errors"
	"io"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/payments"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PaymentsHandler struct {
	payments *payments.Service
}

func NewPaymentsHandler(svc *payments.Service) *PaymentsHandler {
	return &PaymentsHandler{payments: svc}
}

func (h *PaymentsHandler) Features(c *gin.Context) {
	c.JSON(http.StatusOK, h.payments.Features(c.Request.Context()))
}

func (h *PaymentsHandler) QuoteStars(c *gin.Context) {
	var req struct {
		AmountNanoton int64 `json:"amount_nanoton"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondBadRequest(c, err, "Укажите сумму", "invalid_amount")
		return
	}
	quote, err := h.payments.QuoteStars(c.Request.Context(), req.AmountNanoton)
	if err != nil {
		writePaymentError(c, err)
		return
	}
	c.JSON(http.StatusOK, quote)
}

func (h *PaymentsHandler) CreateCryptoBot(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		AmountNanoton int64 `json:"amount_nanoton"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondBadRequest(c, err, "Укажите сумму", "invalid_amount")
		return
	}
	intent, err := h.payments.CreateCryptoBotIntent(c.Request.Context(), userID, req.AmountNanoton)
	if err != nil {
		writePaymentError(c, err)
		return
	}
	c.JSON(http.StatusOK, intent)
}

func (h *PaymentsHandler) CreateStars(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		AmountNanoton int64 `json:"amount_nanoton"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondBadRequest(c, err, "Укажите сумму", "invalid_amount")
		return
	}
	intent, err := h.payments.CreateStarsIntent(c.Request.Context(), userID, req.AmountNanoton)
	if err != nil {
		writePaymentError(c, err)
		return
	}
	c.JSON(http.StatusOK, intent)
}

func (h *PaymentsHandler) GetIntent(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		respondBadRequest(c, err, "Некорректный id", "invalid_id")
		return
	}
	intent, err := h.payments.GetIntent(c.Request.Context(), userID, id)
	if err != nil {
		writePaymentError(c, err)
		return
	}
	c.JSON(http.StatusOK, intent)
}

func (h *PaymentsHandler) CryptoBotWebhook(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	sig := c.GetHeader("crypto-pay-api-signature")
	// Signature is optional (Crypto Pay also supports secret URL). Verify when present.
	if err := h.payments.HandleCryptoBotWebhook(c.Request.Context(), body, sig); err != nil {
		if errors.Is(err, domain.ErrForbidden) {
			c.Status(http.StatusForbidden)
			return
		}
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func writePaymentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidAmount):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "Некорректная сумма", "code": "invalid_amount"})
	case errors.Is(err, domain.ErrNotFound):
		httperr.Respond(c, http.StatusNotFound, err, gin.H{"error": "Счёт не найден", "code": "not_found"})
	case errors.Is(err, domain.ErrForbidden):
		httperr.Respond(c, http.StatusForbidden, err, gin.H{"error": "Доступ запрещён", "code": "forbidden"})
	default:
		msg := err.Error()
		if msg == "" {
			msg = "Не удалось создать платёж"
		}
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": msg, "code": "payment_failed"})
	}
}
