package telegram

import (
	"context"
	"errors"
	"fmt"
	"strings"

	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"gorm.io/gorm"
)

type Update struct {
	UpdateID      int64          `json:"update_id"`
	Message       *Message       `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

type CallbackQuery struct {
	ID      string       `json:"id"`
	From    *MessageFrom `json:"from"`
	Message *Message     `json:"message"`
	Data    string       `json:"data"`
}

type Message struct {
	MessageID int64        `json:"message_id"`
	Text      string       `json:"text"`
	Chat      Chat         `json:"chat"`
	From      *MessageFrom `json:"from"`
}

type MessageFrom struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type Chat struct {
	ID int64 `json:"id"`
}

type WebAppURLResolver func(ctx context.Context) string
type WebAppButtonTextResolver func(ctx context.Context) string
type TermsURLResolver func(ctx context.Context) (url, buttonText string)

// UserLookup finds whether a Telegram user is already registered.
type UserLookup interface {
	FindByTelegramID(ctx context.Context, telegramID int64) (exists bool, err error)
}

type BotUpdates struct {
	api                      *BotAPI
	webAppURL                string
	botUsername              string
	webAppShortName          string
	channelURL               string
	supportURL               string
	welcomeText              string
	webAppURLResolver        WebAppURLResolver
	webAppButtonTextResolver WebAppButtonTextResolver
	termsURLResolver         TermsURLResolver
	adminNotifier            *AdminNotifier
	adminLogin               AdminLoginApprover
	users                    UserLookup
	analytics                *analyticsuc.Service
}

// AdminLoginApprover resolves pending /admin password logins from Telegram buttons.
type AdminLoginApprover interface {
	ApproveAdminLogin(ctx context.Context, challengeID string, approverTelegramID int64) error
	DenyAdminLogin(ctx context.Context, challengeID string, approverTelegramID int64) error
}

func NewBotUpdates(api *BotAPI, webAppURL, botUsername, webAppShortName, channelURL, supportURL, welcomeText string) *BotUpdates {
	return &BotUpdates{
		api:             api,
		webAppURL:       strings.TrimRight(webAppURL, "/"),
		botUsername:     strings.TrimPrefix(botUsername, "@"),
		webAppShortName: strings.Trim(webAppShortName, "/"),
		channelURL:      strings.TrimSpace(channelURL),
		supportURL:      strings.TrimSpace(supportURL),
		welcomeText:     strings.TrimSpace(welcomeText),
	}
}

func (h *BotUpdates) SetWebAppURLResolver(resolver WebAppURLResolver) {
	h.webAppURLResolver = resolver
}

func (h *BotUpdates) SetWebAppButtonTextResolver(resolver WebAppButtonTextResolver) {
	h.webAppButtonTextResolver = resolver
}

func (h *BotUpdates) SetTermsURLResolver(resolver TermsURLResolver) {
	h.termsURLResolver = resolver
}

func (h *BotUpdates) SetAdminNotifier(notifier *AdminNotifier) {
	h.adminNotifier = notifier
}

func (h *BotUpdates) SetAdminLoginApprover(approver AdminLoginApprover) {
	h.adminLogin = approver
}

func (h *BotUpdates) SetUserLookup(users UserLookup) {
	h.users = users
}

func (h *BotUpdates) SetAnalytics(analytics *analyticsuc.Service) {
	h.analytics = analytics
}

func (h *BotUpdates) Enabled() bool {
	return h.api != nil && h.api.Enabled()
}

func (h *BotUpdates) HandleUpdate(ctx context.Context, update Update) error {
	if !h.Enabled() {
		return nil
	}
	if update.CallbackQuery != nil {
		return h.handleCallbackQuery(ctx, update.CallbackQuery)
	}
	if update.Message == nil {
		return nil
	}

	text := strings.TrimSpace(update.Message.Text)
	if !strings.HasPrefix(text, "/start") {
		return nil
	}

	payload := strings.TrimSpace(strings.TrimPrefix(text, "/start"))
	h.trackBotStart(ctx, update.Message, payload)
	h.maybeNotifyBotStart(ctx, update.Message)

	return h.sendStartWelcome(ctx, update.Message.Chat.ID, payload)
}

func (h *BotUpdates) handleCallbackQuery(ctx context.Context, cq *CallbackQuery) error {
	if cq == nil || cq.From == nil {
		return nil
	}
	data := strings.TrimSpace(cq.Data)
	parts := strings.Split(data, ":")
	if len(parts) != 3 || parts[0] != "adminlogin" {
		_ = h.api.AnswerCallbackQuery(ctx, cq.ID, "", false)
		return nil
	}
	action, challengeID := parts[1], parts[2]
	if challengeID == "" || h.adminLogin == nil {
		_ = h.api.AnswerCallbackQuery(ctx, cq.ID, "Недоступно", true)
		return nil
	}

	var (
		err    error
		okText string
		result string
	)
	switch action {
	case "ok":
		err = h.adminLogin.ApproveAdminLogin(ctx, challengeID, cq.From.ID)
		okText = "Вход разрешён"
		result = "✅ Вход разрешён"
	case "no":
		err = h.adminLogin.DenyAdminLogin(ctx, challengeID, cq.From.ID)
		okText = "Вход отклонён"
		result = "❌ Вход отклонён"
	default:
		_ = h.api.AnswerCallbackQuery(ctx, cq.ID, "Неизвестное действие", true)
		return nil
	}

	if err != nil {
		msg := err.Error()
		_ = h.api.AnswerCallbackQuery(ctx, cq.ID, msg, true)
		return nil
	}
	_ = h.api.AnswerCallbackQuery(ctx, cq.ID, okText, false)

	if cq.Message != nil {
		who := strings.TrimSpace(cq.From.FirstName)
		if cq.From.Username != "" {
			who = fmt.Sprintf("%s (@%s)", who, cq.From.Username)
		}
		base := strings.TrimSpace(cq.Message.Text)
		if base == "" {
			base = "Запрос входа в админку"
		}
		edited := fmt.Sprintf("%s\n\n%s\nКем: %s", base, result, who)
		_ = h.api.EditMessageText(ctx, cq.Message.Chat.ID, cq.Message.MessageID, edited, InlineKeyboardMarkup{})
	}
	return nil
}

func (h *BotUpdates) trackBotStart(ctx context.Context, msg *Message, payload string) {
	if h.analytics == nil || msg == nil || msg.From == nil || msg.From.ID == 0 {
		return
	}
	telegramID := msg.From.ID
	registered := false
	if h.users != nil {
		if exists, err := h.users.FindByTelegramID(ctx, telegramID); err == nil {
			registered = exists
		}
	}
	h.analytics.Track(ctx, analyticsuc.EventInput{
		TelegramID:    &telegramID,
		AnonymousID:   fmt.Sprintf("tg:%d", telegramID),
		Source:        "bot",
		EventName:     "bot_start",
		EventCategory: "acquisition",
		Status:        "success",
		StartParam:    payload,
		Properties: map[string]any{
			"is_registered": registered,
			"username":      msg.From.Username,
			"chat_id":       msg.Chat.ID,
		},
	})
}

func (h *BotUpdates) maybeNotifyBotStart(ctx context.Context, msg *Message) {
	if h.adminNotifier == nil || msg == nil || msg.From == nil || msg.From.ID == 0 {
		return
	}
	if h.users != nil {
		exists, err := h.users.FindByTelegramID(ctx, msg.From.ID)
		if err != nil {
			return
		}
		if exists {
			return
		}
	}
	h.adminNotifier.NotifyBotStart(ctx, AdminActor{
		TelegramID: msg.From.ID,
		Username:   msg.From.Username,
		FirstName:  msg.From.FirstName,
		LastName:   msg.From.LastName,
	})
}

// UserRepoLookup adapts a FindByTelegramID that returns (user, error).
type UserRepoLookup struct {
	Find func(ctx context.Context, telegramID int64) (any, error)
}

func (u UserRepoLookup) FindByTelegramID(ctx context.Context, telegramID int64) (bool, error) {
	if u.Find == nil {
		return false, nil
	}
	_, err := u.Find(ctx, telegramID)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

const startTermsNotice = "Заходя в проект, вы соглашаетесь с пользовательским соглашением."

func (h *BotUpdates) sendStartWelcome(ctx context.Context, chatID int64, startPayload string) error {
	text := strings.ReplaceAll(h.welcomeText, "\\n", "\n")
	if text == "" {
		text = "👋 Добро пожаловать в Flipo!\n\n" +
			"🎮 Игры: рулетка, crash, PvP\n" +
			"🎁 Стейкинг Telegram Gifts\n" +
			"💰 TON депозиты и вывод\n\n" +
			"Нажмите кнопку ниже, чтобы открыть приложение."
	}
	text = strings.TrimSpace(text)
	if !strings.Contains(text, startTermsNotice) {
		text = text + "\n\n" + startTermsNotice
	}
	text = "*" + text + "*"

	return h.api.sendMessage(ctx, chatID, text, h.startMenuMarkup(ctx, startPayload), "Markdown")
}

func (h *BotUpdates) startMenuMarkup(ctx context.Context, startPayload string) map[string]any {
	rows := make([][]map[string]any, 0, 4)

	rows = append(rows, []map[string]any{h.openAppButton(ctx, startPayload)})

	if termsURL, termsLabel := h.resolvedTerms(ctx); termsURL != "" {
		rows = append(rows, []map[string]any{
			{"text": termsLabel, "url": termsURL},
		})
	}

	if h.channelURL != "" {
		rows = append(rows, []map[string]any{
			{"text": "📢 Наш канал", "url": h.channelURL},
		})
	}

	if h.supportURL != "" {
		rows = append(rows, []map[string]any{
			{"text": "💬 Поддержка", "url": h.supportURL},
		})
	}

	if len(rows) == 0 {
		return nil
	}

	return map[string]any{
		"inline_keyboard": rows,
	}
}

func (h *BotUpdates) resolvedTerms(ctx context.Context) (url, buttonText string) {
	if h.termsURLResolver != nil {
		url, buttonText = h.termsURLResolver(ctx)
	}
	url = strings.TrimSpace(url)
	buttonText = strings.TrimSpace(buttonText)
	if buttonText == "" {
		buttonText = "📄 Пользовательское соглашение"
	}
	return url, buttonText
}

func (h *BotUpdates) resolvedWebAppURL(ctx context.Context) string {
	// Prefer a real HTTPS Mini App URL for web_app buttons. Deep links (t.me/…)
	// must use url buttons and can open the app twice on some Telegram clients.
	candidates := make([]string, 0, 2)
	if h.webAppURLResolver != nil {
		candidates = append(candidates, h.webAppURLResolver(ctx))
	}
	candidates = append(candidates, h.webAppURL)
	for _, raw := range candidates {
		url := strings.TrimRight(strings.TrimSpace(raw), "/")
		if url == "" || isTelegramDeepLink(url) {
			continue
		}
		return url
	}
	return ""
}

func (h *BotUpdates) resolvedButtonText(ctx context.Context) string {
	if h.webAppButtonTextResolver != nil {
		return strings.TrimSpace(h.webAppButtonTextResolver(ctx))
	}
	return ""
}

func (h *BotUpdates) openAppMarkup(ctx context.Context, startPayload string) map[string]any {
	return map[string]any{
		"inline_keyboard": [][]map[string]any{{h.openAppButton(ctx, startPayload)}},
	}
}

func (h *BotUpdates) openAppButton(ctx context.Context, startPayload string) map[string]any {
	if markup := OpenAppButtonMarkup(OpenAppButtonOptions{
		WebAppURL:       h.resolvedWebAppURL(ctx),
		BotUsername:     h.botUsername,
		WebAppShortName: h.webAppShortName,
		StartPayload:    startPayload,
		ButtonText:      h.resolvedButtonText(ctx),
	}); markup != nil {
		if kb, ok := markup["inline_keyboard"].([][]map[string]any); ok && len(kb) > 0 && len(kb[0]) > 0 {
			return kb[0][0]
		}
	}
	return map[string]any{"text": "🚀 Открыть приложение"}
}
