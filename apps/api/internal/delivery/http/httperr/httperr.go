package httperr

import (
	"errors"
	"log/slog"
	"net/http"

	applog "github.com/flipo/flipo/apps/api/internal/infrastructure/log"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/gin-gonic/gin"
)

func Respond(c *gin.Context, status int, err error, body gin.H) {
	logResponse(c, status, err, body)
	if err != nil {
		_ = c.Error(err)
	}
	c.JSON(status, body)
}

func Fail(c *gin.Context, status int, err error) {
	if err == nil {
		err = errors.New(http.StatusText(status))
	}
	Respond(c, status, err, gin.H{"error": err.Error()})
}

func Abort(c *gin.Context, status int, err error, body gin.H) {
	logResponse(c, status, err, body)
	if err != nil {
		_ = c.Error(err)
	}
	c.AbortWithStatusJSON(status, body)
}

func logResponse(c *gin.Context, status int, err error, body gin.H) {
	attrs := append(applog.RequestAttrs(c),
		"status", status,
	)
	if code, ok := body["code"].(string); ok && code != "" {
		attrs = append(attrs, "error_code", code)
	}
	if message, ok := body["error"].(string); ok && message != "" {
		attrs = append(attrs, "client_message", message)
	}
	if err != nil {
		attrs = append(attrs, "error", err.Error())
	}

	ctx := c.Request.Context()
	switch {
	case status >= http.StatusInternalServerError:
		slog.ErrorContext(ctx, "handler_error", attrs...)
	case isExpectedClientError(err, status):
		slog.InfoContext(ctx, "client_error", attrs...)
	default:
		slog.WarnContext(ctx, "client_error", attrs...)
	}
}

func isExpectedClientError(err error, status int) bool {
	if status < http.StatusBadRequest || status >= http.StatusInternalServerError {
		return false
	}
	if err == nil {
		return true
	}
	expected := []error{
		domain.ErrInvalidAmount,
		domain.ErrInsufficientFunds,
		domain.ErrRoundNotOpen,
		domain.ErrRoomFull,
		domain.ErrNotFound,
		domain.ErrForbidden,
		domain.ErrAlreadyListed,
		domain.ErrWalletNotLinked,
		domain.ErrInvalidWallet,
		domain.ErrTransferPending,
		domain.ErrTransferExpired,
		domain.ErrTransferNotFound,
		domain.ErrDuplicateRequest,
		domain.ErrAlreadyJoined,
		domain.ErrBetBelowMinimum,
		domain.ErrBetLimitExceeded,
		domain.ErrDailyWinCap,
		domain.ErrUserBanned,
		domain.ErrGameDisabled,
		domain.ErrBetsPaused,
		domain.ErrPromoInvalid,
		domain.ErrPromoExpired,
		domain.ErrPromoExhausted,
		domain.ErrPromoAlreadyRedeemed,
		domain.ErrPromoFundsRestricted,
		domain.ErrPromoInUse,
		domain.ErrStakingPoolFull,
		domain.ErrStakingPersonalLimit,
		domain.ErrGiftAlreadyStakedEpoch,
	}
	for _, target := range expected {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}
