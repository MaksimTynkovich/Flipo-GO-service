package handlers

import (
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/httperr"
	"github.com/gin-gonic/gin"
)

func respondError(c *gin.Context, status int, err error, body gin.H) {
	httperr.Respond(c, status, err, body)
}

func respondInternal(c *gin.Context, err error) {
	httperr.Respond(c, http.StatusInternalServerError, err, gin.H{
		"error": "Внутренняя ошибка сервера",
		"code":  "internal_error",
	})
}

func respondBadRequest(c *gin.Context, err error, message string, code string) {
	body := gin.H{"error": message}
	if code != "" {
		body["code"] = code
	}
	httperr.Respond(c, http.StatusBadRequest, err, body)
}
