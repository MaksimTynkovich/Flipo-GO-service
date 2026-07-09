package telegram

import (
	"context"
	"strings"
)

type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	MessageID int64  `json:"message_id"`
	Text      string `json:"text"`
	Chat      Chat   `json:"chat"`
}

type Chat struct {
	ID int64 `json:"id"`
}

type WebAppURLResolver func(ctx context.Context) string
type WebAppButtonTextResolver func(ctx context.Context) string

type BotUpdates struct {
	api                    *BotAPI
	webAppURL              string
	botUsername            string
	webAppShortName        string
	webAppURLResolver      WebAppURLResolver
	webAppButtonTextResolver WebAppButtonTextResolver
}

func NewBotUpdates(api *BotAPI, webAppURL, botUsername, webAppShortName string) *BotUpdates {
	return &BotUpdates{
		api:             api,
		webAppURL:       strings.TrimRight(webAppURL, "/"),
		botUsername:     strings.TrimPrefix(botUsername, "@"),
		webAppShortName: strings.Trim(webAppShortName, "/"),
	}
}

func (h *BotUpdates) SetWebAppURLResolver(resolver WebAppURLResolver) {
	h.webAppURLResolver = resolver
}

func (h *BotUpdates) SetWebAppButtonTextResolver(resolver WebAppButtonTextResolver) {
	h.webAppButtonTextResolver = resolver
}

func (h *BotUpdates) Enabled() bool {
	return h.api != nil && h.api.Enabled()
}

func (h *BotUpdates) HandleUpdate(ctx context.Context, update Update) error {
	if !h.Enabled() || update.Message == nil {
		return nil
	}

	text := strings.TrimSpace(update.Message.Text)
	if !strings.HasPrefix(text, "/start") {
		return nil
	}

	payload := strings.TrimSpace(strings.TrimPrefix(text, "/start"))
	return h.sendStartWelcome(ctx, update.Message.Chat.ID, payload)
}

func (h *BotUpdates) sendStartWelcome(ctx context.Context, chatID int64, startPayload string) error {
	text := "👋 Добро пожаловать в Flipo!\n\n" +
		"🎮 Игры: рулетка, crash, PvP\n" +
		"🎁 Стейкинг Telegram Gifts\n" +
		"💰 TON депозиты и вывод\n\n" +
		"Нажмите кнопку ниже, чтобы открыть приложение."

	return h.api.sendMessage(ctx, chatID, text, h.openAppMarkup(ctx, startPayload))
}

func (h *BotUpdates) resolvedWebAppURL(ctx context.Context) string {
	if h.webAppURLResolver != nil {
		if url := strings.TrimSpace(h.webAppURLResolver(ctx)); url != "" {
			return strings.TrimRight(url, "/")
		}
	}
	return h.webAppURL
}

func (h *BotUpdates) resolvedButtonText(ctx context.Context) string {
	if h.webAppButtonTextResolver != nil {
		return strings.TrimSpace(h.webAppButtonTextResolver(ctx))
	}
	return ""
}

func (h *BotUpdates) openAppMarkup(ctx context.Context, startPayload string) map[string]any {
	return OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:       h.resolvedWebAppURL(ctx),
		BotUsername:     h.botUsername,
		WebAppShortName: h.webAppShortName,
		StartPayload:    startPayload,
		ButtonText:      h.resolvedButtonText(ctx),
	})
}
