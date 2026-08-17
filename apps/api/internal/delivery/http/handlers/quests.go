package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/quests"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type QuestsHandler struct {
	quests *quests.Service
}

func NewQuestsHandler(svc *quests.Service) *QuestsHandler {
	return &QuestsHandler{quests: svc}
}

func (h *QuestsHandler) ListDaily(c *gin.Context) {
	userID := middleware.GetUserID(c)
	board, err := h.quests.ListDaily(c.Request.Context(), userID)
	if err != nil {
		httperr.Respond(c, http.StatusInternalServerError, err, gin.H{"error": "не удалось загрузить задания"})
		return
	}
	c.JSON(http.StatusOK, board)
}

func (h *QuestsHandler) ListPromo(c *gin.Context) {
	userID := middleware.GetUserID(c)
	slides, err := h.quests.ListPromoSlides(c.Request.Context(), userID)
	if err != nil {
		httperr.Respond(c, http.StatusInternalServerError, err, gin.H{"error": "не удалось загрузить баннер"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": slides})
}

func (h *QuestsHandler) ClaimTask(c *gin.Context) {
	userID := middleware.GetUserID(c)
	questID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный id"})
		return
	}
	result, err := h.quests.ClaimTask(c.Request.Context(), userID, questID)
	if err != nil {
		respondQuestClaimError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *QuestsHandler) ClaimBonus(c *gin.Context) {
	userID := middleware.GetUserID(c)
	result, err := h.quests.ClaimBonus(c.Request.Context(), userID)
	if err != nil {
		respondQuestClaimError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func respondQuestClaimError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrQuestNotReady):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error(), "code": "quest_not_ready"})
	case errors.Is(err, domain.ErrQuestAlreadyClaimed):
		httperr.Respond(c, http.StatusConflict, err, gin.H{"error": err.Error(), "code": "quest_already_claimed"})
	case errors.Is(err, domain.ErrQuestBonusLocked):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error(), "code": "quest_bonus_locked"})
	case errors.Is(err, domain.ErrQuestUnavailable):
		httperr.Respond(c, http.StatusNotFound, err, gin.H{"error": err.Error(), "code": "quest_unavailable"})
	case errors.Is(err, domain.ErrCaseUnavailable):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error(), "code": "case_unavailable"})
	case errors.Is(err, domain.ErrInvalidAmount):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{"error": err.Error()})
	default:
		httperr.Respond(c, http.StatusInternalServerError, err, gin.H{"error": "не удалось получить награду"})
	}
}
