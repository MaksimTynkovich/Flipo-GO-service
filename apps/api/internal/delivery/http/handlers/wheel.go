package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/wheel"
	"github.com/gin-gonic/gin"
)

type WheelHandler struct {
	wheel *wheel.Service
}

func NewWheelHandler(wheelSvc *wheel.Service) *WheelHandler {
	return &WheelHandler{wheel: wheelSvc}
}

func (h *WheelHandler) Status(c *gin.Context) {
	userID := middleware.GetUserID(c)
	status, err := h.wheel.Status(c.Request.Context(), userID, middleware.GetTelegramID(c))
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *WheelHandler) Spin(c *gin.Context) {
	userID := middleware.GetUserID(c)
	result, err := h.wheel.Spin(c.Request.Context(), userID, middleware.GetTelegramID(c))
	if err != nil {
		writeWheelError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeWheelError(c *gin.Context, err error) {
	var channelErr *wheel.ChannelNotSubscribedError
	if errors.As(err, &channelErr) {
		channel := ""
		if channelErr != nil {
			channel = channelErr.Channel
		}
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error":   "Подпишитесь на канал, чтобы крутить колесо",
			"code":    "channel_not_subscribed",
			"channel": channel,
		})
		return
	}

	switch {
	case errors.Is(err, domain.ErrWheelNoSpins):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Нет доступных прокрутов",
			"code":  "wheel_no_spins",
		})
	case errors.Is(err, domain.ErrWheelUnavailable):
		httperr.Respond(c, http.StatusServiceUnavailable, err, gin.H{
			"error": "Колесо временно недоступно",
			"code":  "wheel_unavailable",
		})
	case errors.Is(err, domain.ErrChannelNotSubscribed):
		httperr.Respond(c, http.StatusBadRequest, err, gin.H{
			"error": "Подпишитесь на канал, чтобы крутить колесо",
			"code":  "channel_not_subscribed",
		})
	default:
		respondInternal(c, err)
	}
}
