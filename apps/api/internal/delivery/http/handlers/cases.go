package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	casesuc "github.com/flipo/flipo/apps/api/internal/usecase/cases"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CasesHandler struct {
	cases *casesuc.Service
}

func NewCasesHandler(svc *casesuc.Service) *CasesHandler {
	return &CasesHandler{cases: svc}
}

func (h *CasesHandler) Catalog(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out, err := h.cases.Catalog(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *CasesHandler) Get(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out, err := h.cases.Get(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		writeCasesError(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *CasesHandler) Open(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		IdempotencyKey string `json:"idempotency_key"`
	}
	_ = c.ShouldBindJSON(&req)
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		req.IdempotencyKey = c.GetHeader("Idempotency-Key")
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		req.IdempotencyKey = uuid.NewString()
	}
	result, err := h.cases.Open(c.Request.Context(), userID, c.Param("id"), req.IdempotencyKey)
	if err != nil {
		writeCasesError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *CasesHandler) Opens(c *gin.Context) {
	userID := middleware.GetUserID(c)
	out, err := h.cases.ListOpens(c.Request.Context(), userID, 50)
	if err != nil {
		respondInternal(c, err)
		return
	}
	if out == nil {
		out = []casesuc.OpenResult{}
	}
	c.JSON(http.StatusOK, out)
}

func writeCasesError(c *gin.Context, err error) {
	var channelErr *casesuc.ChannelNotSubscribedError
	if errors.As(err, &channelErr) {
		httperr.Respond(c, http.StatusForbidden, err, gin.H{
			"error":   "Подпишитесь на канал, чтобы открыть кейс",
			"code":    "channel_not_subscribed",
			"channel": channelErr.Channel,
		})
		return
	}
	switch {
	case errors.Is(err, domain.ErrNotFound):
		httperr.Respond(c, http.StatusNotFound, err, gin.H{"error": "Кейс не найден", "code": "not_found"})
	case errors.Is(err, domain.ErrCaseUnavailable):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "Кейс недоступен", "code": "case_unavailable"})
	case errors.Is(err, domain.ErrCaseDailyUsed):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "Ежедневный кейс уже открыт сегодня", "code": "case_daily_used"})
	case errors.Is(err, domain.ErrCaseNoLoot):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "У кейса нет призов", "code": "case_no_loot"})
	case errors.Is(err, domain.ErrInsufficientFunds):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "Недостаточно средств", "code": "insufficient_funds"})
	case errors.Is(err, domain.ErrChannelNotSubscribed):
		httperr.Respond(c, http.StatusForbidden, err, gin.H{
			"error": "Подпишитесь на канал, чтобы открыть кейс",
			"code":  "channel_not_subscribed",
		})
	case errors.Is(err, domain.ErrInvalidAmount):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": "Некорректный запрос", "code": "invalid_amount"})
	default:
		respondInternal(c, err)
	}
}
