package handlers

import (
	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/gin-gonic/gin"
)

type GiftImageHandler struct {
	proxy *giftimage.Proxy
}

func NewGiftImageHandler(proxy *giftimage.Proxy) *GiftImageHandler {
	return &GiftImageHandler{proxy: proxy}
}

func (h *GiftImageHandler) Serve(c *gin.Context) {
	_ = h.proxy.Serve(c.Param("file"), c.Writer)
}
