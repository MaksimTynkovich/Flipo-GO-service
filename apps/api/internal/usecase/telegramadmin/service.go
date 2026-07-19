package telegramadmin

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

const channelButtonText = "📢 Наш канал"

type Service struct {
	platform        domain.PlatformRepository
	users           domain.UserRepository
	bot             *telegram.BotAPI
	botUsername     string
	webAppShortName string
	envWebAppURL    string
	channelURL      string
	processMu       sync.Mutex
}

func NewService(
	platform domain.PlatformRepository,
	users domain.UserRepository,
	bot *telegram.BotAPI,
	botUsername string,
	webAppShortName string,
	envWebAppURL string,
	channelURL string,
) *Service {
	return &Service{
		platform:        platform,
		users:           users,
		bot:             bot,
		botUsername:     botUsername,
		webAppShortName: webAppShortName,
		envWebAppURL:    strings.TrimRight(strings.TrimSpace(envWebAppURL), "/"),
		channelURL:      strings.TrimSpace(channelURL),
	}
}

func (s *Service) CreateBroadcast(ctx context.Context, adminID uuid.UUID, message string, includeChannelButton bool) (*domain.TelegramBroadcast, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return nil, fmt.Errorf("message is required")
	}
	if includeChannelButton && s.channelURL == "" {
		return nil, fmt.Errorf("TELEGRAM_CHANNEL_URL не задан в .env")
	}

	settings, err := s.platform.GetBotSettings(ctx)
	if err != nil {
		return nil, err
	}
	if !settings.BroadcastEnabled {
		return nil, fmt.Errorf("массовые рассылки выключены в настройках бота")
	}
	if s.bot == nil || !s.bot.Enabled() {
		return nil, fmt.Errorf("BOT_TOKEN не настроен")
	}

	total, err := s.users.CountUsers(ctx)
	if err != nil {
		return nil, err
	}

	broadcast := &domain.TelegramBroadcast{
		ID:                   uuid.New(),
		Message:              message,
		IncludeChannelButton: includeChannelButton,
		Status:               "queued",
		TotalUsers:           int(total),
		CreatedBy:            adminID,
	}
	if err := s.platform.CreateBroadcast(ctx, broadcast); err != nil {
		return nil, err
	}

	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
		defer cancel()
		if err := s.ProcessQueued(bgCtx); err != nil {
			slog.Warn("broadcast process after create failed", "error", err)
		}
	}()

	return broadcast, nil
}

func (s *Service) ListBroadcasts(ctx context.Context) ([]domain.TelegramBroadcast, error) {
	return s.platform.ListBroadcasts(ctx, 20)
}

func (s *Service) ProcessQueued(ctx context.Context) error {
	s.processMu.Lock()
	defer s.processMu.Unlock()

	if s.bot == nil || !s.bot.Enabled() {
		return fmt.Errorf("BOT_TOKEN is not configured")
	}

	items, err := s.platform.ListQueuedBroadcasts(ctx, 1)
	if err != nil {
		return err
	}
	for i := range items {
		if err := s.runBroadcast(ctx, &items[i]); err != nil {
			slog.Warn("broadcast failed", "id", items[i].ID, "error", err)
			items[i].Status = "failed"
			now := time.Now().UTC()
			items[i].FinishedAt = &now
			_ = s.platform.UpdateBroadcast(ctx, &items[i])
		}
	}
	return nil
}

func (s *Service) runBroadcast(ctx context.Context, broadcast *domain.TelegramBroadcast) error {
	broadcast.Status = "running"
	if err := s.platform.UpdateBroadcast(ctx, broadcast); err != nil {
		return err
	}

	settings, err := s.platform.GetBotSettings(ctx)
	if err != nil {
		return err
	}
	markup := s.broadcastMarkup(*settings, broadcast.IncludeChannelButton)
	if markup == nil {
		slog.Warn("broadcast without open-app button", "broadcast_id", broadcast.ID, "hint", "set webapp_url in admin or BOT_USERNAME/WEBAPP_SHORT_NAME in env")
	}
	delay := time.Duration(50-settings.SpamProtectionLevel*10) * time.Millisecond
	if delay < 35*time.Millisecond {
		delay = 35 * time.Millisecond
	}

	const pageSize = 100
	for offset := 0; ; offset += pageSize {
		ids, err := s.users.ListTelegramIDs(ctx, pageSize, offset)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			break
		}
		for _, chatID := range ids {
			if err := s.bot.SendMessageWithMarkup(ctx, chatID, broadcast.Message, markup); err != nil {
				broadcast.FailedCount++
			} else {
				broadcast.SentCount++
			}
			time.Sleep(delay)
		}
		_ = s.platform.UpdateBroadcast(ctx, broadcast)
	}

	now := time.Now().UTC()
	broadcast.Status = "completed"
	broadcast.FinishedAt = &now
	return s.platform.UpdateBroadcast(ctx, broadcast)
}

func (s *Service) broadcastMarkup(settings domain.TelegramBotSettings, includeChannelButton bool) map[string]any {
	webAppURL := strings.TrimSpace(settings.WebAppURL)
	// Deep links must not be used as web_app.url; prefer HTTPS from env.
	if webAppURL == "" || strings.HasPrefix(webAppURL, "https://t.me/") ||
		strings.HasPrefix(webAppURL, "http://t.me/") ||
		strings.HasPrefix(webAppURL, "https://telegram.me/") ||
		strings.HasPrefix(webAppURL, "http://telegram.me/") ||
		strings.HasPrefix(webAppURL, "tg://") {
		webAppURL = s.envWebAppURL
	}

	rows := make([][]map[string]any, 0, 2)
	if openApp := telegram.OpenAppButtonMarkup(telegram.OpenAppButtonOptions{
		WebAppURL:       webAppURL,
		BotUsername:     s.botUsername,
		WebAppShortName: s.webAppShortName,
		ButtonText:      settings.WebAppButtonText,
	}); openApp != nil {
		if kb, ok := openApp["inline_keyboard"].([][]map[string]any); ok {
			rows = append(rows, kb...)
		}
	}

	if includeChannelButton && s.channelURL != "" {
		rows = append(rows, []map[string]any{
			{"text": channelButtonText, "url": s.channelURL},
		})
	}

	if len(rows) == 0 {
		return nil
	}
	return map[string]any{"inline_keyboard": rows}
}
