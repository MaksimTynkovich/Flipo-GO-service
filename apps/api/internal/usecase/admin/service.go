package admin

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Service struct {
	admin      domain.AdminRepository
	platform   domain.PlatformRepository
	games      domain.GameRepository
	market     domain.MarketRepository
	users      domain.UserRepository
	transfers  domain.TonTransferRepository
	giftPrices domain.GiftTraitPriceRepository
	notifier   balance.BalanceNotifier
}

func NewService(
	admin domain.AdminRepository,
	platform domain.PlatformRepository,
	games domain.GameRepository,
	market domain.MarketRepository,
	users domain.UserRepository,
	transfers domain.TonTransferRepository,
	giftPrices domain.GiftTraitPriceRepository,
) *Service {
	return &Service{
		admin:      admin,
		platform:   platform,
		games:      games,
		market:     market,
		users:      users,
		transfers:  transfers,
		giftPrices: giftPrices,
	}
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
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

func (s *Service) ListUsers(ctx context.Context, query, sort string) ([]domain.AdminUserRow, error) {
	rows, err := s.admin.ListUsers(ctx, query, sort, 50)
	if err != nil {
		return nil, err
	}
	basePct, boostPct := s.stakingMonthlyPercents(ctx)
	for i := range rows {
		daily := projectedDailyYield(rows[i].StakingPrincipalNanoton, rows[i].StakingTier, basePct, boostPct)
		rows[i].StakingDailyYieldNanoton = daily
		rows[i].StakingWeeklyYieldNanoton = daily * 7
	}
	return rows, nil
}

func (s *Service) UserAudience(ctx context.Context) (*domain.AdminUserAudience, error) {
	return s.admin.UserAudience(ctx)
}

func (s *Service) stakingMonthlyPercents(ctx context.Context) (base, boost float64) {
	base, boost = 3.0, 4.0
	settings, err := s.platform.GetYieldSettings(ctx)
	if err != nil || settings == nil {
		return base, boost
	}
	if settings.StakingBaseMonthlyPercent >= 0 {
		base = settings.StakingBaseMonthlyPercent
	}
	if settings.StakingBoostMonthlyPercent >= 0 {
		boost = settings.StakingBoostMonthlyPercent
	}
	return base, boost
}

func projectedDailyYield(principal int64, tier domain.StakingTier, basePct, boostPct float64) int64 {
	if principal <= 0 {
		return 0
	}
	rate := basePct / 100
	if tier == domain.TierBoost {
		rate = boostPct / 100
	}
	return int64(float64(principal) * rate / 30)
}

func adminPeriodSince(period string) (normalized string, since *time.Time) {
	normalized = period
	switch period {
	case "today":
		msk := time.FixedZone("MSK", 3*60*60)
		nowMSK := time.Now().In(msk)
		t := time.Date(nowMSK.Year(), nowMSK.Month(), nowMSK.Day(), 0, 0, 0, 0, msk).UTC()
		return "today", &t
	case "all":
		return "all", nil
	default:
		t := time.Now().UTC().Add(-7 * 24 * time.Hour)
		return "7d", &t
	}
}

func betSelectionLabel(bet domain.GameBet) string {
	var sel map[string]any
	_ = json.Unmarshal(bet.Selection, &sel)
	switch bet.GameType {
	case domain.GameRoulette:
		if color, ok := sel["color"].(string); ok && color != "" {
			return color
		}
		return "roulette"
	case domain.GameCrash:
		if bet.CashoutMultiplier != nil {
			return "cashout ×" + formatMult(*bet.CashoutMultiplier)
		}
		if auto, ok := sel["auto_cashout_multiplier"].(float64); ok && auto > 0 {
			return "auto ×" + formatMult(auto)
		}
		return "crash"
	case domain.GamePvP:
		return "pvp"
	default:
		return string(bet.GameType)
	}
}

func formatMult(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func (s *Service) UserBets(ctx context.Context, userID uuid.UUID, period string) (*domain.AdminUserBetsResponse, error) {
	normalized, since := adminPeriodSince(period)
	summary, err := s.admin.UserBetsSummary(ctx, userID, since)
	if err != nil {
		return nil, err
	}
	bets, err := s.admin.ListUserBets(ctx, userID, since, 50)
	if err != nil {
		return nil, err
	}
	items := make([]domain.AdminUserBetItem, 0, len(bets))
	for _, bet := range bets {
		items = append(items, domain.AdminUserBetItem{
			ID:             bet.ID,
			GameType:       bet.GameType,
			Status:         bet.Status,
			AmountNanoton:  bet.AmountNanoton,
			PayoutNanoton:  bet.PayoutNanoton,
			FundingType:    string(bet.FundingType),
			SelectionLabel: betSelectionLabel(bet),
			CashoutMult:    bet.CashoutMultiplier,
			CreatedAt:      bet.CreatedAt,
		})
	}
	return &domain.AdminUserBetsResponse{
		Period:  normalized,
		Summary: summary,
		Items:   items,
	}, nil
}

func (s *Service) UserTransfers(ctx context.Context, userID uuid.UUID, period string) (*domain.AdminUserTransfersResponse, error) {
	normalized, since := adminPeriodSince(period)
	summary, err := s.admin.UserTransfersSummary(ctx, userID, since)
	if err != nil {
		return nil, err
	}
	items, err := s.admin.ListUserTransfers(ctx, userID, since, 50)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.TonTransfer{}
	}
	return &domain.AdminUserTransfersResponse{
		Period:  normalized,
		Summary: summary,
		Items:   items,
	}, nil
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
	if transfer, findErr := s.transfers.FindByID(ctx, transferID); findErr == nil {
		balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerRefund)
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

func (s *Service) GetSocialSimSettings(ctx context.Context) (*domain.SocialSimSettings, error) {
	return s.platform.GetSocialSimSettings(ctx)
}

func (s *Service) UpdateSocialSimSettings(ctx context.Context, adminID uuid.UUID, settings domain.SocialSimSettings) error {
	// Keep knobs in safe ranges before persist.
	if settings.OnlineBaseMin < 0 {
		settings.OnlineBaseMin = 0
	}
	if settings.OnlineBaseMax < settings.OnlineBaseMin {
		settings.OnlineBaseMax = settings.OnlineBaseMin
	}
	if err := s.platform.UpdateSocialSimSettings(ctx, &settings); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "social_sim_settings_updated", "social_sim_settings", "1", map[string]any{
		"enabled":         settings.Enabled,
		"online_base_min": settings.OnlineBaseMin,
		"online_base_max": settings.OnlineBaseMax,
		"bet_intensity":   settings.BetIntensity,
		"bet_spread":      settings.BetSpread,
		"chaos":           settings.Chaos,
	})
}

func (s *Service) UpdateYieldSettings(ctx context.Context, adminID uuid.UUID, settings domain.PlatformYieldSettings) error {
	existing, err := s.platform.GetYieldSettings(ctx)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return err
	}
	if existing == nil {
		existing = &domain.PlatformYieldSettings{
			ID:                          1,
			ReferralSharePercent:        5,
			ReferralGGRSharePercent:       domain.DefaultReferralGGRSharePercent,
			ReferralMilestoneNanoton:      domain.DefaultReferralMilestoneNanoton,
			ReferralMilestoneMonthlyCap:   domain.DefaultReferralMilestoneMonthlyCap,
			StakingBaseMonthlyPercent:     3,
			StakingBoostMonthlyPercent:    4,
			StakingTVLCapNanoton:          domain.DefaultStakingTVLCapNanoton,
		}
	}
	existing.ReferralSharePercent = settings.ReferralSharePercent
	existing.ReferralGGRSharePercent = settings.ReferralGGRSharePercent
	existing.ReferralMilestoneNanoton = settings.ReferralMilestoneNanoton
	existing.ReferralMilestoneMonthlyCap = settings.ReferralMilestoneMonthlyCap
	existing.ReferralMonthlyPayoutCapNanoton = settings.ReferralMonthlyPayoutCapNanoton
	existing.StakingBaseMonthlyPercent = settings.StakingBaseMonthlyPercent
	existing.StakingBoostMonthlyPercent = settings.StakingBoostMonthlyPercent
	if settings.StakingTVLCapNanoton > 0 {
		existing.StakingTVLCapNanoton = settings.StakingTVLCapNanoton
	}
	if err := s.platform.UpdateYieldSettings(ctx, existing); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "yield_settings_updated", "platform_yield_settings", "1", map[string]any{
		"referral_share_percent":             existing.ReferralSharePercent,
		"referral_ggr_share_percent":         existing.ReferralGGRSharePercent,
		"referral_milestone_nanoton":         existing.ReferralMilestoneNanoton,
		"referral_milestone_monthly_cap":     existing.ReferralMilestoneMonthlyCap,
		"referral_monthly_payout_cap_nanoton": existing.ReferralMonthlyPayoutCapNanoton,
		"staking_base_monthly_percent":       existing.StakingBaseMonthlyPercent,
		"staking_boost_monthly_percent":      existing.StakingBoostMonthlyPercent,
		"staking_tvl_cap_nanoton":            existing.StakingTVLCapNanoton,
	})
}

type GiftPriceSettings struct {
	BuyAdjustPercent       float64 `json:"buy_adjust_percent"`
	ValuationAdjustPercent float64 `json:"valuation_adjust_percent"`
}

func (s *Service) GetGiftPriceSettings(ctx context.Context) (*GiftPriceSettings, error) {
	settings, err := s.platform.GetYieldSettings(ctx)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return &GiftPriceSettings{}, nil
		}
		return nil, err
	}
	return &GiftPriceSettings{
		BuyAdjustPercent:       settings.GiftBuyAdjustPercent,
		ValuationAdjustPercent: settings.GiftValuationAdjustPercent,
	}, nil
}

func (s *Service) UpdateGiftPriceSettings(ctx context.Context, adminID uuid.UUID, buyAdjust, valuationAdjust float64) error {
	if buyAdjust < -90 || buyAdjust > 100 || valuationAdjust < -90 || valuationAdjust > 100 {
		return domain.ErrInvalidAmount
	}
	settings, err := s.platform.GetYieldSettings(ctx)
	if err != nil {
		if !errors.Is(err, domain.ErrNotFound) {
			return err
		}
		settings = &domain.PlatformYieldSettings{
			ID:                         1,
			ReferralSharePercent:       3,
			StakingBaseMonthlyPercent:  3,
			StakingBoostMonthlyPercent: 4,
			StakingTVLCapNanoton:       domain.DefaultStakingTVLCapNanoton,
		}
	}
	settings.GiftBuyAdjustPercent = buyAdjust
	settings.GiftValuationAdjustPercent = valuationAdjust
	if err := s.platform.UpdateYieldSettings(ctx, settings); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "gift_price_settings_updated", "platform_yield_settings", "1", map[string]any{
		"buy_adjust_percent":       buyAdjust,
		"valuation_adjust_percent": valuationAdjust,
	})
}

func (s *Service) UpdateMarketListingPrice(ctx context.Context, adminID, listingID uuid.UUID, priceNanoton int64) error {
	if priceNanoton <= 0 {
		return domain.ErrInvalidAmount
	}
	listing, err := s.market.FindByID(ctx, listingID)
	if err != nil {
		return err
	}
	if listing.Status != domain.ListingActive {
		return domain.ErrNotFound
	}
	oldPrice := listing.PriceNanoton
	if err := s.market.UpdateListingPrice(ctx, listingID, priceNanoton); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "market_listing_price_updated", "market_listing", listingID.String(), map[string]any{
		"old_price_nanoton": oldPrice,
		"new_price_nanoton": priceNanoton,
	})
}

type GiftTraitPriceListResult struct {
	Items   []domain.GiftTraitPrice             `json:"items"`
	Total   int64                               `json:"total"`
	Filters domain.GiftTraitPriceFilterOptions  `json:"filters"`
}

func (s *Service) ListGiftTraitPrices(ctx context.Context, filter domain.GiftTraitPriceFilter) (*GiftTraitPriceListResult, error) {
	if s.giftPrices == nil {
		return &GiftTraitPriceListResult{Items: []domain.GiftTraitPrice{}, Filters: domain.GiftTraitPriceFilterOptions{}}, nil
	}
	items, total, err := s.giftPrices.ListFiltered(ctx, filter)
	if err != nil {
		return nil, err
	}
	opts, err := s.giftPrices.ListFilterOptions(ctx, filter.CollectionSlug, filter.Model)
	if err != nil {
		return nil, err
	}
	return &GiftTraitPriceListResult{Items: items, Total: total, Filters: opts}, nil
}

func (s *Service) UpdateGiftTraitPrice(ctx context.Context, adminID uuid.UUID, collectionSlug, model, backdrop string, priceNanoton int64) error {
	if s.giftPrices == nil {
		return domain.ErrNotFound
	}
	collectionSlug = strings.TrimSpace(collectionSlug)
	model = strings.TrimSpace(model)
	backdrop = strings.TrimSpace(backdrop)
	if collectionSlug == "" || model == "" || priceNanoton <= 0 {
		return domain.ErrInvalidAmount
	}
	// Normalize non-black backdrops to empty storage key (same as valuator).
	if !isBlackBackdrop(backdrop) {
		backdrop = ""
	}

	var oldPrice int64
	var oldSource string
	if existing, err := s.giftPrices.Get(ctx, collectionSlug, model, backdrop); err == nil && existing != nil {
		oldPrice = existing.PriceNanoton
		oldSource = existing.Source
	}

	if err := s.giftPrices.Upsert(ctx, &domain.GiftTraitPrice{
		CollectionSlug: collectionSlug,
		Model:          model,
		Backdrop:       backdrop,
		PriceNanoton:   priceNanoton,
		Source:         "admin",
		FetchedAt:      timeNowUTC(),
	}); err != nil {
		return err
	}

	targetID := collectionSlug + "/" + model
	if backdrop != "" {
		targetID += "/" + backdrop
	}
	return s.audit(ctx, adminID, "gift_trait_price_updated", "gift_trait_price", targetID, map[string]any{
		"collection_slug":   collectionSlug,
		"model":             model,
		"backdrop":          backdrop,
		"old_price_nanoton": oldPrice,
		"old_source":        oldSource,
		"new_price_nanoton": priceNanoton,
	})
}

func isBlackBackdrop(backdrop string) bool {
	switch strings.ToLower(strings.TrimSpace(backdrop)) {
	case "black", "onyx black":
		return true
	default:
		return false
	}
}

// timeNowUTC isolated for tests if needed.
var timeNowUTC = func() time.Time { return time.Now().UTC() }

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
