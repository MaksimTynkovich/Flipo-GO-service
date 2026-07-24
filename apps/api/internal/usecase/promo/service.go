package promo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type AdminPromoNotifier interface {
	NotifyPromoActivated(ctx context.Context, actor telegram.AdminActor, code string, bonusNanoton int64)
	NotifyPromoActivationFailed(ctx context.Context, actor telegram.AdminActor, code, reason string)
}

type ChannelNotSubscribedError struct {
	Channel string
}

func (e *ChannelNotSubscribedError) Error() string {
	return domain.ErrChannelNotSubscribed.Error()
}

func (e *ChannelNotSubscribedError) Is(target error) bool {
	return target == domain.ErrChannelNotSubscribed
}

type Service struct {
	platform        domain.PlatformRepository
	users           domain.UserRepository
	balance         *balance.Service
	notifier        balance.BalanceNotifier
	requiredChannel string
	channelChecker  ChannelChecker
	admin           AdminPromoNotifier
}

func NewService(platform domain.PlatformRepository, users domain.UserRepository, balance *balance.Service) *Service {
	return &Service{platform: platform, users: users, balance: balance}
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) SetChannelRequirement(channel string, checker ChannelChecker) {
	s.requiredChannel = strings.TrimSpace(channel)
	s.channelChecker = checker
}

func (s *Service) SetAdminNotifier(notifier AdminPromoNotifier) {
	s.admin = notifier
}

func (s *Service) RequiredChannel() string {
	return s.requiredChannel
}

type StatusView struct {
	Active       bool   `json:"active"`
	PromoCode    string `json:"promo_code,omitempty"`
	BonusNanoton int64  `json:"bonus_nanoton,omitempty"`
}

func (s *Service) Activate(ctx context.Context, userID uuid.UUID, code string) (*StatusView, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	status, err := s.activate(ctx, userID, code)
	if err != nil {
		s.notifyActivationFailed(ctx, userID, code, promoFailureReason(err))
		return nil, err
	}
	return status, nil
}

func (s *Service) NotifyActivationFailed(ctx context.Context, userID uuid.UUID, code, reason string) {
	s.notifyActivationFailed(ctx, userID, strings.ToUpper(strings.TrimSpace(code)), reason)
}

func (s *Service) activate(ctx context.Context, userID uuid.UUID, code string) (*StatusView, error) {
	if code == "" {
		return nil, domain.ErrPromoInvalid
	}

	redeemed, err := s.platform.HasRedeemedPromoCode(ctx, userID, code)
	if err != nil {
		return nil, err
	}
	if redeemed {
		return nil, domain.ErrPromoAlreadyRedeemed
	}

	promo, err := s.platform.GetPromoCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if !promo.Active {
		return nil, domain.ErrPromoInvalid
	}
	if promo.ExpiresAt != nil && time.Now().UTC().After(*promo.ExpiresAt) {
		return nil, domain.ErrPromoExpired
	}
	if promo.MaxUses > 0 && promo.UsedCount >= promo.MaxUses {
		return nil, domain.ErrPromoExhausted
	}

	if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	redemptionID := uuid.New()
	if _, err := s.balance.Credit(ctx, userID, promo.BonusNanoton, domain.LedgerPromoBonus, "promo_code", redemptionID); err != nil {
		return nil, err
	}

	redemption := &domain.PromoRedemption{
		ID:           redemptionID,
		UserID:       userID,
		PromoCode:    promo.Code,
		BonusNanoton: promo.BonusNanoton,
		Status:       "completed",
		CompletedAt:  &now,
	}
	if err := s.platform.CreateRedemption(ctx, redemption); err != nil {
		return nil, err
	}
	_ = s.platform.IncrementPromoUsed(ctx, promo.Code)

	if s.admin != nil {
		if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
			s.admin.NotifyPromoActivated(ctx, telegram.AdminActor{
				TelegramID: user.TelegramID,
				Username:   user.Username,
				FirstName:  user.FirstName,
				LastName:   user.LastName,
			}, promo.Code, promo.BonusNanoton)
		}
	}

	return &StatusView{
		Active:       false,
		PromoCode:    promo.Code,
		BonusNanoton: promo.BonusNanoton,
	}, nil
}

func (s *Service) notifyActivationFailed(ctx context.Context, userID uuid.UUID, code, reason string) {
	if s.admin == nil {
		return
	}
	actor := telegram.AdminActor{}
	if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
		actor = telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}
	}
	s.admin.NotifyPromoActivationFailed(ctx, actor, code, reason)
}

func promoFailureReason(err error) string {
	if err == nil {
		return "неизвестная ошибка"
	}
	var channelErr *ChannelNotSubscribedError
	if errors.As(err, &channelErr) {
		channel := ""
		if channelErr != nil {
			channel = strings.TrimSpace(channelErr.Channel)
		}
		if channel != "" {
			return fmt.Sprintf("не подписан на канал %s", channel)
		}
		return "не подписан на обязательный канал"
	}
	switch {
	case errors.Is(err, domain.ErrPromoInvalid):
		return "промокод недействителен"
	case errors.Is(err, domain.ErrPromoExpired):
		return "промокод истёк"
	case errors.Is(err, domain.ErrPromoExhausted):
		return "промокод исчерпан"
	case errors.Is(err, domain.ErrPromoAlreadyRedeemed):
		return "промокод уже использован"
	default:
		msg := strings.TrimSpace(err.Error())
		if msg == "" {
			return "не удалось активировать промокод"
		}
		return msg
	}
}

func (s *Service) ensureChannelSubscribed(ctx context.Context, userID uuid.UUID) error {
	if s.requiredChannel == "" || s.channelChecker == nil {
		return nil
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.TelegramID <= 0 {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}

	member, err := s.channelChecker.IsChannelMember(ctx, s.requiredChannel, user.TelegramID)
	if err != nil {
		return fmt.Errorf("channel subscription check failed: %w", err)
	}
	if !member {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	return nil
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID) (*StatusView, error) {
	_ = ctx
	_ = userID
	return &StatusView{Active: false}, nil
}
