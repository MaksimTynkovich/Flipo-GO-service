package telegram

import (
	"context"
	"net/url"
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

type BotUpdates struct {
	api             *BotAPI
	webAppURL       string
	botUsername     string
	webAppShortName string
}

func NewBotUpdates(api *BotAPI, webAppURL, botUsername, webAppShortName string) *BotUpdates {
	return &BotUpdates{
		api:             api,
		webAppURL:       strings.TrimRight(webAppURL, "/"),
		botUsername:     strings.TrimPrefix(botUsername, "@"),
		webAppShortName: strings.Trim(webAppShortName, "/"),
	}
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

	return h.api.sendMessage(ctx, chatID, text, h.openAppMarkup(startPayload))
}

func (h *BotUpdates) openAppMarkup(startPayload string) map[string]any {
	button := map[string]any{
		"text": "🚀 Открыть Flipo",
	}

	if h.botUsername != "" && h.webAppShortName != "" {
		appURL := "https://t.me/" + h.botUsername + "/" + h.webAppShortName
		if startPayload != "" {
			appURL += "?startapp=" + urlQueryEscape(startPayload)
		}
		button["url"] = appURL
	} else if h.webAppURL != "" {
		appURL := h.webAppURL
		if startPayload != "" {
			sep := "?"
			if strings.Contains(appURL, "?") {
				sep = "&"
			}
			appURL += sep + "tgWebAppStartParam=" + urlQueryEscape(startPayload)
		}
		button["web_app"] = map[string]string{"url": appURL}
	}

	return map[string]any{
		"inline_keyboard": [][]map[string]any{{button}},
	}
}

func urlQueryEscape(value string) string {
	return url.QueryEscape(value)
}
