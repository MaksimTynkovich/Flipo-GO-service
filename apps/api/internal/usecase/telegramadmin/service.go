package telegramadmin

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type Service struct {
	platform domain.PlatformRepository
	users    domain.UserRepository
	bot      *telegram.BotAPI
}

func NewService(platform domain.PlatformRepository, users domain.UserRepository, bot *telegram.BotAPI) *Service {
	return &Service{platform: platform, users: users, bot: bot}
}

func (s *Service) CreateBroadcast(ctx context.Context, adminID uuid.UUID, message string) (*domain.TelegramBroadcast, error) {
	settings, err := s.platform.GetBotSettings(ctx)
	if err != nil {
		return nil, err
	}
	if !settings.BroadcastEnabled {
		return nil, domain.ErrForbidden
	}

	total, err := s.users.CountUsers(ctx)
	if err != nil {
		return nil, err
	}

	broadcast := &domain.TelegramBroadcast{
		ID:         uuid.New(),
		Message:    message,
		Status:     "queued",
		TotalUsers: int(total),
		CreatedBy:  adminID,
	}
	if err := s.platform.CreateBroadcast(ctx, broadcast); err != nil {
		return nil, err
	}
	return broadcast, nil
}

func (s *Service) ListBroadcasts(ctx context.Context) ([]domain.TelegramBroadcast, error) {
	return s.platform.ListBroadcasts(ctx, 20)
}

func (s *Service) ProcessQueued(ctx context.Context) error {
	if s.bot == nil || !s.bot.Enabled() {
		return nil
	}

	items, err := s.platform.ListQueuedBroadcasts(ctx, 1)
	if err != nil {
		return err
	}
	for i := range items {
		if err := s.runBroadcast(ctx, &items[i]); err != nil {
			slog.Warn("broadcast failed", "id", items[i].ID, "error", err)
		}
	}
	return nil
}

func (s *Service) runBroadcast(ctx context.Context, broadcast *domain.TelegramBroadcast) error {
	broadcast.Status = "running"
	if err := s.platform.UpdateBroadcast(ctx, broadcast); err != nil {
		return err
	}

	settings, _ := s.platform.GetBotSettings(ctx)
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
			if err := s.bot.SendMessage(ctx, chatID, broadcast.Message); err != nil {
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
