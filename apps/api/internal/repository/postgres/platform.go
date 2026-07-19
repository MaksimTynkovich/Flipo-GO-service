package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PlatformRepo struct {
	db *gorm.DB
}

func NewPlatformRepo(db *gorm.DB) *PlatformRepo {
	return &PlatformRepo{db: db}
}

func (r *PlatformRepo) GetGameConfig(ctx context.Context, gameType domain.GameType) (*domain.GameConfig, error) {
	var cfg domain.GameConfig
	err := r.db.WithContext(ctx).First(&cfg, "game_type = ?", gameType).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &cfg, err
}

func (r *PlatformRepo) ListGameConfigs(ctx context.Context) ([]domain.GameConfig, error) {
	var items []domain.GameConfig
	return items, r.db.WithContext(ctx).Order("game_type ASC").Find(&items).Error
}

func (r *PlatformRepo) UpsertGameConfig(ctx context.Context, cfg *domain.GameConfig) error {
	cfg.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(cfg).Error
}

func (r *PlatformRepo) GetRiskSettings(ctx context.Context) (*domain.PlatformRiskSettings, error) {
	var settings domain.PlatformRiskSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &settings, err
}

func (r *PlatformRepo) UpdateRiskSettings(ctx context.Context, settings *domain.PlatformRiskSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) GetActiveSeed(ctx context.Context, gameType domain.GameType) (*domain.ProvablyFairSeedSession, error) {
	var session domain.ProvablyFairSeedSession
	err := r.db.WithContext(ctx).
		Where("game_type = ? AND active = ?", gameType, true).
		Order("created_at DESC").
		First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &session, err
}

func (r *PlatformRepo) CreateSeedSession(ctx context.Context, session *domain.ProvablyFairSeedSession) error {
	if session.ID.String() == "00000000-0000-0000-0000-000000000000" {
		session.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *PlatformRepo) DeactivateSeeds(ctx context.Context, gameType domain.GameType) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.ProvablyFairSeedSession{}).
		Where("game_type = ? AND active = ?", gameType, true).
		Updates(map[string]interface{}{"active": false, "rotated_at": now}).Error
}

func (r *PlatformRepo) ListSeedHistory(ctx context.Context, gameType domain.GameType, limit int) ([]domain.ProvablyFairSeedSession, error) {
	var items []domain.ProvablyFairSeedSession
	q := r.db.WithContext(ctx).Where("game_type = ?", gameType).Order("created_at DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	return items, q.Find(&items).Error
}

func (r *PlatformRepo) ListPromoCodes(ctx context.Context) ([]domain.PromoCode, error) {
	var items []domain.PromoCode
	return items, r.db.WithContext(ctx).Order("created_at DESC").Find(&items).Error
}

func (r *PlatformRepo) UpsertPromoCode(ctx context.Context, promo *domain.PromoCode) error {
	if promo.CreatedAt.IsZero() {
		promo.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Save(promo).Error
}

func (r *PlatformRepo) DeletePromoCode(ctx context.Context, code string) error {
	var count int64
	if err := r.db.WithContext(ctx).Model(&domain.PromoRedemption{}).
		Where("promo_code = ?", code).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return domain.ErrPromoInUse
	}
	res := r.db.WithContext(ctx).Delete(&domain.PromoCode{}, "code = ?", code)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *PlatformRepo) GetBotSettings(ctx context.Context) (*domain.TelegramBotSettings, error) {
	var settings domain.TelegramBotSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &settings, err
}

func (r *PlatformRepo) UpdateBotSettings(ctx context.Context, settings *domain.TelegramBotSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) GetMaintenanceSettings(ctx context.Context) (*domain.PlatformMaintenanceSettings, error) {
	var settings domain.PlatformMaintenanceSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		defaults := domain.PlatformMaintenanceSettings{ID: 1, Enabled: false, Message: "", UpdatedAt: time.Now().UTC()}
		if createErr := r.db.WithContext(ctx).Create(&defaults).Error; createErr != nil {
			return nil, createErr
		}
		return &defaults, nil
	}
	return &settings, err
}

func (r *PlatformRepo) UpdateMaintenanceSettings(ctx context.Context, settings *domain.PlatformMaintenanceSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) GetWithdrawalSettings(ctx context.Context) (*domain.PlatformWithdrawalSettings, error) {
	var settings domain.PlatformWithdrawalSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		defaults := domain.PlatformWithdrawalSettings{ID: 1, Enabled: false, UpdatedAt: time.Now().UTC()}
		if createErr := r.db.WithContext(ctx).Create(&defaults).Error; createErr != nil {
			return nil, createErr
		}
		return &defaults, nil
	}
	return &settings, err
}

func (r *PlatformRepo) UpdateWithdrawalSettings(ctx context.Context, settings *domain.PlatformWithdrawalSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) GetYieldSettings(ctx context.Context) (*domain.PlatformYieldSettings, error) {
	var settings domain.PlatformYieldSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &settings, err
}

func (r *PlatformRepo) GiftAdjustPercents(ctx context.Context) (buyAdjustPercent, valuationAdjustPercent float64, err error) {
	settings, err := r.GetYieldSettings(ctx)
	if errors.Is(err, domain.ErrNotFound) {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, err
	}
	return settings.GiftBuyAdjustPercent, settings.GiftValuationAdjustPercent, nil
}

func (r *PlatformRepo) UpdateYieldSettings(ctx context.Context, settings *domain.PlatformYieldSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) EnsureDefaults(ctx context.Context) error {
	defaults := []domain.GameConfig{
		{GameType: domain.GameRoulette, Enabled: true, MinBetNanoton: 100_000_000, MaxBetNanoton: 50_000_000_000, MaxPayoutNanoton: 700_000_000_000, HouseEdgeBps: 667, RTPBps: 9333},
		{GameType: domain.GameCrash, Enabled: true, MinBetNanoton: 100_000_000, MaxBetNanoton: 30_000_000_000, MaxPayoutNanoton: 500_000_000_000, HouseEdgeBps: 100, RTPBps: 9900},
		{GameType: domain.GamePvP, Enabled: true, MinBetNanoton: 100_000_000, MaxBetNanoton: 20_000_000_000, MaxPayoutNanoton: 400_000_000_000, HouseEdgeBps: 0, RTPBps: 9500, PlatformFeeBps: 500},
		// Wheel has no bets; limits are placeholders so the row fits game_configs.
		{GameType: domain.GameWheel, Enabled: true, MinBetNanoton: 0, MaxBetNanoton: 0, MaxPayoutNanoton: 0, HouseEdgeBps: 0, RTPBps: 10000},
	}
	for i := range defaults {
		var existing domain.GameConfig
		err := r.db.WithContext(ctx).First(&existing, "game_type = ?", defaults[i].GameType).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			defaults[i].UpdatedAt = time.Now().UTC()
			if err := r.db.WithContext(ctx).Create(&defaults[i]).Error; err != nil {
				return err
			}
		}
	}

	var risk domain.PlatformRiskSettings
	if err := r.db.WithContext(ctx).First(&risk, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		now := time.Now().UTC()
		if err := r.db.WithContext(ctx).Create(&domain.PlatformRiskSettings{
			ID:                         1,
			MaxDailyWinNanoton:         100_000_000_000,
			MaxRoundExposureNanoton:    500_000_000_000,
			WhaleBetThresholdNanoton:   10_000_000_000,
			AutoReviewWithdrawNanoton:  50_000_000_000,
			HotWalletMaxBalanceNanoton: 2_000_000_000_000,
			HotWalletSweepThreshold:    1_500_000_000_000,
			UpdatedAt:                  now,
		}).Error; err != nil {
			return err
		}
	}

	var bot domain.TelegramBotSettings
	if err := r.db.WithContext(ctx).First(&bot, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		if err := r.db.WithContext(ctx).Create(&domain.TelegramBotSettings{ID: 1, SpamProtectionLevel: 1, UpdatedAt: time.Now().UTC()}).Error; err != nil {
			return err
		}
	}

	var maintenance domain.PlatformMaintenanceSettings
	if err := r.db.WithContext(ctx).First(&maintenance, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		if err := r.db.WithContext(ctx).Create(&domain.PlatformMaintenanceSettings{
			ID:        1,
			Enabled:   false,
			Message:   "",
			UpdatedAt: time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
	}

	var withdrawalHold domain.PlatformWithdrawalSettings
	if err := r.db.WithContext(ctx).First(&withdrawalHold, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		if err := r.db.WithContext(ctx).Create(&domain.PlatformWithdrawalSettings{
			ID:        1,
			Enabled:   false,
			UpdatedAt: time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
	}

	var yield domain.PlatformYieldSettings
	if err := r.db.WithContext(ctx).First(&yield, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		if err := r.db.WithContext(ctx).Create(&domain.PlatformYieldSettings{
			ID:                          1,
			ReferralSharePercent:        5,
			ReferralGGRSharePercent:       domain.DefaultReferralGGRSharePercent,
			ReferralMilestoneNanoton:      domain.DefaultReferralMilestoneNanoton,
			ReferralMilestoneMonthlyCap:   domain.DefaultReferralMilestoneMonthlyCap,
			StakingBaseMonthlyPercent:     3,
			StakingBoostMonthlyPercent:    4,
			StakingTVLCapNanoton:          domain.DefaultStakingTVLCapNanoton,
			UpdatedAt:                   time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
	}

	var sim domain.SocialSimSettings
	if err := r.db.WithContext(ctx).First(&sim, "id = ?", 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		defaults := defaultSocialSimSettings()
		defaults.UpdatedAt = time.Now().UTC()
		if err := r.db.WithContext(ctx).Create(&defaults).Error; err != nil {
			return err
		}
	}
	return nil
}

func defaultSocialSimSettings() domain.SocialSimSettings {
	tod := []byte(`[0.45,0.4,0.35,0.35,0.4,0.5,0.65,0.8,0.9,0.95,1.0,1.0,1.05,1.05,1.0,1.0,1.1,1.25,1.4,1.45,1.35,1.15,0.85,0.6]`)
	return domain.SocialSimSettings{
		ID:                    1,
		Enabled:               false,
		CrashEnabled:          true,
		RouletteEnabled:       true,
		PvPEnabled:            true,
		LobbyEnabled:          true,
		OnlineBaseMin:         18,
		OnlineBaseMax:         42,
		OnlineJitter:          0.12,
		TODMultipliers:        tod,
		BetIntensity:          8,
		BetBurstChance:        0.35,
		IdleGapMsMin:          400,
		IdleGapMsMax:          2200,
		StakeP50:              0.15,
		StakeP90:              0.55,
		CrashAutoCashoutShare: 0.55,
		CrashCashoutMin:       1.2,
		CrashCashoutMax:       4.5,
		RouletteRedWeight:     0.46,
		RouletteBlackWeight:   0.46,
		RouletteGreenWeight:   0.08,
		PvPMaxGhostRooms:      4,
		PvPRoomTTLSecMin:      25,
		PvPRoomTTLSecMax:      90,
		PvPStakeMinFrac:       0.12,
		PvPStakeMaxFrac:       0.7,
		Chaos:                 0.35,
	}
}

func (r *PlatformRepo) GetSocialSimSettings(ctx context.Context) (*domain.SocialSimSettings, error) {
	var settings domain.SocialSimSettings
	err := r.db.WithContext(ctx).First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		defaults := defaultSocialSimSettings()
		defaults.UpdatedAt = time.Now().UTC()
		if err := r.db.WithContext(ctx).Create(&defaults).Error; err != nil {
			return nil, err
		}
		return &defaults, nil
	}
	return &settings, err
}

func (r *PlatformRepo) UpdateSocialSimSettings(ctx context.Context, settings *domain.SocialSimSettings) error {
	settings.ID = 1
	settings.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *PlatformRepo) GetPromoCode(ctx context.Context, code string) (*domain.PromoCode, error) {
	var promo domain.PromoCode
	err := r.db.WithContext(ctx).First(&promo, "code = ?", code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrPromoInvalid
	}
	return &promo, err
}

func (r *PlatformRepo) GetActiveRedemption(ctx context.Context, userID uuid.UUID) (*domain.PromoRedemption, error) {
	var redemption domain.PromoRedemption
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND status = ?", userID, "active").
		First(&redemption).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &redemption, err
}

func (r *PlatformRepo) HasRedeemedPromoCode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.PromoRedemption{}).
		Where("user_id = ? AND promo_code = ?", userID, code).
		Count(&count).Error
	return count > 0, err
}

func (r *PlatformRepo) CreateRedemption(ctx context.Context, redemption *domain.PromoRedemption) error {
	if redemption.CreatedAt.IsZero() {
		redemption.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(redemption).Error
}

func (r *PlatformRepo) IncrementPromoUsed(ctx context.Context, code string) error {
	return r.db.WithContext(ctx).Model(&domain.PromoCode{}).
		Where("code = ?", code).
		UpdateColumn("used_count", gorm.Expr("used_count + 1")).Error
}

func (r *PlatformRepo) UpdateRedemptionProgress(ctx context.Context, redemptionID uuid.UUID, progress int64, status string) error {
	updates := map[string]interface{}{
		"wager_progress_nanoton": progress,
		"status":                   status,
	}
	if status == "completed" || status == "forfeited" {
		now := time.Now().UTC()
		updates["completed_at"] = now
	}
	return r.db.WithContext(ctx).Model(&domain.PromoRedemption{}).
		Where("id = ?", redemptionID).
		Updates(updates).Error
}

func (r *PlatformRepo) CreateBroadcast(ctx context.Context, broadcast *domain.TelegramBroadcast) error {
	if broadcast.CreatedAt.IsZero() {
		broadcast.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(broadcast).Error
}

func (r *PlatformRepo) GetBroadcast(ctx context.Context, id uuid.UUID) (*domain.TelegramBroadcast, error) {
	var broadcast domain.TelegramBroadcast
	err := r.db.WithContext(ctx).First(&broadcast, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &broadcast, err
}

func (r *PlatformRepo) UpdateBroadcast(ctx context.Context, broadcast *domain.TelegramBroadcast) error {
	return r.db.WithContext(ctx).Save(broadcast).Error
}

func (r *PlatformRepo) ListBroadcasts(ctx context.Context, limit int) ([]domain.TelegramBroadcast, error) {
	if limit <= 0 {
		limit = 20
	}
	var items []domain.TelegramBroadcast
	return items, r.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Find(&items).Error
}

func (r *PlatformRepo) ListQueuedBroadcasts(ctx context.Context, limit int) ([]domain.TelegramBroadcast, error) {
	if limit <= 0 {
		limit = 5
	}
	var items []domain.TelegramBroadcast
	return items, r.db.WithContext(ctx).
		Where("status = ?", "queued").
		Order("created_at ASC").
		Limit(limit).
		Find(&items).Error
}

func (r *PlatformRepo) CreateSweep(ctx context.Context, sweep *domain.TreasurySweep) error {
	if sweep.CreatedAt.IsZero() {
		sweep.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(sweep).Error
}

func (r *PlatformRepo) ListSweeps(ctx context.Context, limit int) ([]domain.TreasurySweep, error) {
	if limit <= 0 {
		limit = 20
	}
	var items []domain.TreasurySweep
	return items, r.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Find(&items).Error
}

var _ domain.PlatformRepository = (*PlatformRepo)(nil)
