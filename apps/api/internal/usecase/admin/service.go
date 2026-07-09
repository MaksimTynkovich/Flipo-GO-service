package admin

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Service struct {
	admin    domain.AdminRepository
	platform domain.PlatformRepository
	games    domain.GameRepository
	transfers domain.TonTransferRepository
}

func NewService(
	admin domain.AdminRepository,
	platform domain.PlatformRepository,
	games domain.GameRepository,
	transfers domain.TonTransferRepository,
) *Service {
	return &Service{
		admin:     admin,
		platform:  platform,
		games:     games,
		transfers: transfers,
	}
}

func (s *Service) Summary(ctx context.Context) (*domain.RevenueSummary, error) {
	return s.admin.RevenueSummary(ctx)
}

func (s *Service) Timeseries(ctx context.Context, days int) ([]domain.RevenueTimeseriesPoint, error) {
	return s.admin.RevenueTimeseries(ctx, days)
}

func (s *Service) ListTransfers(ctx context.Context, limit int) ([]domain.TonTransfer, error) {
	return s.transfers.ListAll(ctx, limit)
}

func (s *Service) ListLedger(ctx context.Context, limit int) ([]domain.BalanceLedger, error) {
	return s.admin.ListLedger(ctx, limit)
}

func (s *Service) GameStats(ctx context.Context) ([]domain.AdminGameStat, error) {
	return s.games.GameStats(ctx)
}

func (s *Service) RiskUsers(ctx context.Context) ([]domain.AdminRiskUser, error) {
	return s.admin.ListRiskUsers(ctx, 30)
}

func (s *Service) AuditLogs(ctx context.Context) ([]domain.AdminAuditLog, error) {
	return s.admin.ListAuditLogs(ctx, 30)
}

func (s *Service) ListUsers(ctx context.Context, query string) ([]domain.User, error) {
	return s.admin.ListUsers(ctx, query, 50)
}

func (s *Service) UserBets(ctx context.Context, userID uuid.UUID) ([]domain.GameBet, error) {
	return s.admin.CountUserBets(ctx, userID, 30)
}

func (s *Service) ReviewWithdrawal(ctx context.Context, adminID, transferID uuid.UUID, approve bool, note string) error {
	if approve {
		if err := s.transfers.ApproveWithdrawal(ctx, transferID, adminID); err != nil {
			return err
		}
		return s.audit(ctx, adminID, "withdrawal_approved", "ton_transfer", transferID.String(), map[string]string{"note": note})
	}
	_, err := s.transfers.RejectWithdrawalAtomic(ctx, transferID, adminID, note)
	if err != nil {
		return err
	}
	return s.audit(ctx, adminID, "withdrawal_rejected", "ton_transfer", transferID.String(), map[string]string{"note": note})
}

func (s *Service) ListGameConfigs(ctx context.Context) ([]domain.GameConfig, error) {
	return s.platform.ListGameConfigs(ctx)
}

func (s *Service) UpdateGameConfig(ctx context.Context, adminID uuid.UUID, cfg domain.GameConfig) error {
	if err := s.platform.UpsertGameConfig(ctx, &cfg); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "game_config_updated", "game_config", string(cfg.GameType), map[string]any{
		"rtp_bps":       cfg.RTPBps,
		"max_bet":       cfg.MaxBetNanoton,
		"house_edge_bps": cfg.HouseEdgeBps,
	})
}

func (s *Service) GetRiskSettings(ctx context.Context) (*domain.PlatformRiskSettings, error) {
	return s.platform.GetRiskSettings(ctx)
}

func (s *Service) UpdateRiskSettings(ctx context.Context, adminID uuid.UUID, settings domain.PlatformRiskSettings) error {
	if err := s.platform.UpdateRiskSettings(ctx, &settings); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "risk_settings_updated", "platform_risk_settings", "1", nil)
}

func (s *Service) ListPromoCodes(ctx context.Context) ([]domain.PromoCode, error) {
	return s.platform.ListPromoCodes(ctx)
}

func (s *Service) UpsertPromoCode(ctx context.Context, adminID uuid.UUID, promo domain.PromoCode) error {
	promo.Code = strings.ToUpper(strings.TrimSpace(promo.Code))
	if promo.Code == "" {
		return domain.ErrPromoInvalid
	}
	if err := s.platform.UpsertPromoCode(ctx, &promo); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "promo_code_upserted", "promo_code", promo.Code, nil)
}

func (s *Service) DeletePromoCode(ctx context.Context, adminID uuid.UUID, code string) error {
	if err := s.platform.DeletePromoCode(ctx, code); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "promo_code_deleted", "promo_code", code, nil)
}

func (s *Service) GetBotSettings(ctx context.Context) (*domain.TelegramBotSettings, error) {
	return s.platform.GetBotSettings(ctx)
}

func (s *Service) UpdateBotSettings(ctx context.Context, adminID uuid.UUID, settings domain.TelegramBotSettings) error {
	if err := s.platform.UpdateBotSettings(ctx, &settings); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "bot_settings_updated", "telegram_bot_settings", "1", nil)
}

func (s *Service) GetYieldSettings(ctx context.Context) (*domain.PlatformYieldSettings, error) {
	return s.platform.GetYieldSettings(ctx)
}

func (s *Service) UpdateYieldSettings(ctx context.Context, adminID uuid.UUID, settings domain.PlatformYieldSettings) error {
	if err := s.platform.UpdateYieldSettings(ctx, &settings); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "yield_settings_updated", "platform_yield_settings", "1", map[string]any{
		"referral_share_percent":        settings.ReferralSharePercent,
		"staking_base_monthly_percent":  settings.StakingBaseMonthlyPercent,
		"staking_boost_monthly_percent": settings.StakingBoostMonthlyPercent,
	})
}

func (s *Service) audit(ctx context.Context, adminID uuid.UUID, action, targetType, targetID string, meta any) error {
	var raw datatypes.JSON
	if meta != nil {
		b, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		raw = datatypes.JSON(b)
	}
	return s.admin.CreateAuditLog(ctx, &domain.AdminAuditLog{
		AdminUserID: adminID,
		Action:      action,
		TargetType:  targetType,
		TargetID:    targetID,
		Meta:        raw,
	})
}
