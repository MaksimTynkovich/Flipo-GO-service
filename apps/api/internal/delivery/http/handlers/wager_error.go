package handlers

import (
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/gin-gonic/gin"
)

func respondWagerIncomplete(c *gin.Context, err error) {
	body := gin.H{
		"error": "Сначала отыграйте депозит",
		"code":  "wager_incomplete",
	}
	var w *domain.WagerIncompleteError
	if errors.As(err, &w) && w != nil {
		body["error"] = domain.FormatWagerIncompleteMessage(w)
		body["wager_required_nanoton"] = w.RequiredNanoton
		body["wager_progress_nanoton"] = w.ProgressNanoton
		body["wager_remaining_nanoton"] = w.RemainingNanoton
		body["withdrawable_nanoton"] = w.WithdrawableNanoton
		if w.GiftValueNanoton > 0 {
			body["gift_value_nanoton"] = w.GiftValueNanoton
		}
	}
	httperr.Respond(c, http.StatusUnprocessableEntity, err, body)
}
