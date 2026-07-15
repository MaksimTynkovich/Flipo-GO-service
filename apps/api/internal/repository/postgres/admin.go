package postgres

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AdminRepo struct {
	db *gorm.DB
}

func NewAdminRepo(db *gorm.DB) *AdminRepo {
	return &AdminRepo{db: db}
}

func (r *AdminRepo) RevenueSummary(ctx context.Context) (*domain.RevenueSummary, error) {
	summary := &domain.RevenueSummary{}

	r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("direction = ? AND status = ?", domain.TonDirectionDeposit, domain.TonStatusCompleted).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&summary.DepositsNanoton)

	r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("direction = ? AND status = ?", domain.TonDirectionWithdraw, domain.TonStatusCompleted).
		Select("COALESCE(SUM(amount_nanoton - fee_nanoton), 0)").Scan(&summary.WithdrawalsNanoton)

	r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("direction = ? AND status = ?", domain.TonDirectionWithdraw, domain.TonStatusCompleted).
		Select("COALESCE(SUM(fee_nanoton), 0)").Scan(&summary.WithdrawalFeesNanoton)

	r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("direction = ? AND status IN ?", domain.TonDirectionWithdraw,
			[]domain.TonTransferStatus{domain.TonStatusQueued, domain.TonStatusPendingReview, domain.TonStatusApproved, domain.TonStatusBroadcasting}).
		Select("COALESCE(SUM(amount_nanoton - fee_nanoton), 0)").Scan(&summary.PendingLiabilityNanoton)

	r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&summary.GameBetsNanoton)

	r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("status IN ?", []domain.BetStatus{domain.BetWon, domain.BetCashedOut}).
		Select("COALESCE(SUM(payout_nanoton), 0)").Scan(&summary.GameWinsNanoton)

	r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("type = ?", domain.LedgerReferralBonus).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&summary.ReferralExpenseNanoton)

	r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("type = ?", domain.LedgerStakeYield).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&summary.StakingExpenseNanoton)

	var pvpFees int64
	r.db.WithContext(ctx).Model(&domain.PvPRoom{}).
		Where("status = ? AND payout_nanoton IS NOT NULL", "finished").
		Select("COALESCE(SUM(bet_amount_nanoton * max_players * platform_fee_bps / 10000), 0)").Scan(&pvpFees)
	summary.PvPFeesNanoton = pvpFees

	summary.GGRNanoton = summary.GameBetsNanoton - summary.GameWinsNanoton
	summary.NGRNanoton = summary.GGRNanoton + summary.WithdrawalFeesNanoton + summary.PvPFeesNanoton +
		summary.MarketFeesNanoton - summary.ReferralExpenseNanoton - summary.StakingExpenseNanoton
	summary.NetRevenueNanoton = summary.NGRNanoton
	summary.HotWalletExposureNanoton = summary.PendingLiabilityNanoton

	since := time.Now().UTC().Add(-24 * time.Hour)
	r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("created_at >= ?", since).
		Distinct("user_id").
		Count(&summary.ActiveUsers24h)

	return summary, nil
}

func (r *AdminRepo) RevenueTimeseries(ctx context.Context, days int) ([]domain.RevenueTimeseriesPoint, error) {
	if days <= 0 {
		days = 7
	}
	points := make([]domain.RevenueTimeseriesPoint, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
		end := start.Add(24 * time.Hour)
		period := start.Format("2006-01-02")

		var deposits, bets int64
		r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
			Where("direction = ? AND status = ? AND confirmed_at >= ? AND confirmed_at < ?",
				domain.TonDirectionDeposit, domain.TonStatusCompleted, start, end).
			Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&deposits)
		r.db.WithContext(ctx).Model(&domain.GameBet{}).
			Where("created_at >= ? AND created_at < ?", start, end).
			Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&bets)

		points = append(points, domain.RevenueTimeseriesPoint{
			Period:          period,
			RevenueNanoton:  deposits,
			DepositsNanoton: deposits,
			GameBetsNanoton: bets,
		})
	}
	return points, nil
}

func (r *AdminRepo) ListLedger(ctx context.Context, limit int) ([]domain.BalanceLedger, error) {
	if limit <= 0 {
		limit = 50
	}
	var items []domain.BalanceLedger
	return items, r.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Find(&items).Error
}

func (r *AdminRepo) ListRiskUsers(ctx context.Context, limit int) ([]domain.AdminRiskUser, error) {
	if limit <= 0 {
		limit = 20
	}
	type row struct {
		ID             uuid.UUID
		Username       string
		FirstName      string
		RiskFlags      []byte
		WithdrawVolume int64
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
		SELECT u.id, u.username, u.first_name, u.risk_flags,
			COALESCE((
				SELECT SUM(amount_nanoton - fee_nanoton)
				FROM ton_transfers t
				WHERE t.user_id = u.id AND t.direction = 'withdraw' AND t.status = 'completed'
			), 0) AS withdraw_volume
		FROM users u
		WHERE u.deleted_at IS NULL
		  AND (u.is_banned = TRUE OR u.risk_flags != '[]'::jsonb)
		ORDER BY withdraw_volume DESC
		LIMIT ?
	`, limit).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	since := time.Now().UTC().Truncate(24 * time.Hour)
	out := make([]domain.AdminRiskUser, 0, len(rows))
	for _, row := range rows {
		flags := domain.ParseRiskFlags(row.RiskFlags)
		var dailyWin int64
		r.db.WithContext(ctx).Model(&domain.GameBet{}).
			Where("user_id = ? AND status IN ? AND settled_at >= ?",
				row.ID, []domain.BetStatus{domain.BetWon, domain.BetCashedOut}, since).
			Select("COALESCE(SUM(payout_nanoton), 0)").Scan(&dailyWin)
		out = append(out, domain.AdminRiskUser{
			UserID:                  row.ID,
			Username:                row.Username,
			FirstName:               row.FirstName,
			WithdrawalVolumeNanoton: row.WithdrawVolume,
			DailyWinNanoton:         dailyWin,
			RiskFlags:               flags,
		})
	}
	return out, nil
}

func (r *AdminRepo) ListAuditLogs(ctx context.Context, limit int) ([]domain.AdminAuditLog, error) {
	if limit <= 0 {
		limit = 30
	}
	var items []domain.AdminAuditLog
	return items, r.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Find(&items).Error
}

func (r *AdminRepo) CreateAuditLog(ctx context.Context, log *domain.AdminAuditLog) error {
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now().UTC()
	}
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *AdminRepo) ListUsers(ctx context.Context, query string, limit int) ([]domain.AdminUserRow, error) {
	if limit <= 0 {
		limit = 50
	}
	q := r.db.WithContext(ctx).Model(&domain.User{}).Order("created_at DESC").Limit(limit)
	if query != "" {
		like := "%" + query + "%"
		q = q.Where("username ILIKE ? OR first_name ILIKE ? OR CAST(telegram_id AS TEXT) LIKE ?",
			like, like, like)
	}
	var users []domain.User
	if err := q.Find(&users).Error; err != nil {
		return nil, err
	}
	rows := make([]domain.AdminUserRow, 0, len(users))
	if len(users) == 0 {
		return rows, nil
	}

	ids := make([]uuid.UUID, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.ID)
	}

	type stakeAgg struct {
		UserID    uuid.UUID `gorm:"column:user_id"`
		Principal int64     `gorm:"column:principal"`
		Count     int64     `gorm:"column:cnt"`
		Accrued   int64     `gorm:"column:accrued"`
	}
	var aggs []stakeAgg
	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Select("user_id, COALESCE(SUM(principal_nanoton), 0) AS principal, COUNT(*) AS cnt, COALESCE(SUM(accrued_yield_nanoton), 0) AS accrued").
		Where("is_active = ? AND user_id IN ?", true, ids).
		Group("user_id").
		Scan(&aggs)

	byUser := make(map[uuid.UUID]stakeAgg, len(aggs))
	for _, a := range aggs {
		byUser[a.UserID] = a
	}

	referrerIDs := make([]uuid.UUID, 0)
	seenReferrer := make(map[uuid.UUID]struct{})
	for _, u := range users {
		if u.ReferrerID == nil {
			continue
		}
		if _, ok := seenReferrer[*u.ReferrerID]; ok {
			continue
		}
		seenReferrer[*u.ReferrerID] = struct{}{}
		referrerIDs = append(referrerIDs, *u.ReferrerID)
	}
	referrers := make(map[uuid.UUID]domain.User, len(referrerIDs))
	if len(referrerIDs) > 0 {
		var refs []domain.User
		if err := r.db.WithContext(ctx).Where("id IN ?", referrerIDs).Find(&refs).Error; err == nil {
			for _, ref := range refs {
				referrers[ref.ID] = ref
			}
		}
	}

	for _, u := range users {
		row := domain.AdminUserRow{User: u}
		if a, ok := byUser[u.ID]; ok {
			row.StakingPrincipalNanoton = a.Principal
			row.ActiveStakes = a.Count
			row.StakingAccruedYieldNanoton = a.Accrued
		}
		if u.ReferrerID != nil {
			if ref, ok := referrers[*u.ReferrerID]; ok {
				row.CameViaReferral = true
				row.ReferrerTelegramID = ref.TelegramID
				row.ReferrerUsername = ref.Username
				row.ReferrerFirstName = ref.FirstName
				row.ReferrerCode = referralCodeFromTelegramID(ref.TelegramID)
			} else {
				row.CameViaReferral = true
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func referralCodeFromTelegramID(telegramID int64) string {
	if telegramID <= 0 {
		return ""
	}
	return "ref_" + strconv.FormatInt(telegramID, 36)
}

func (r *AdminRepo) UserAudience(ctx context.Context) (*domain.AdminUserAudience, error) {
	out := &domain.AdminUserAudience{
		TopReferrers: []domain.AdminReferrerStat{},
	}
	nowUTC := time.Now().UTC()
	dayAgo := nowUTC.Add(-24 * time.Hour)
	weekAgo := nowUTC.Add(-7 * 24 * time.Hour)
	msk := time.FixedZone("MSK", 3*60*60)
	nowMSK := time.Now().In(msk)
	todayStart := time.Date(nowMSK.Year(), nowMSK.Month(), nowMSK.Day(), 0, 0, 0, 0, msk).UTC()

	_ = r.db.WithContext(ctx).Model(&domain.User{}).Where("telegram_id > 0").Count(&out.TotalUsers).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).Where("telegram_id > 0 AND is_banned = ?", true).Count(&out.BannedUsers).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND last_login_at >= ?", dayAgo).
		Count(&out.ActiveUsers24h).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND last_login_at >= ?", weekAgo).
		Count(&out.ActiveUsers7d).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND created_at >= ?", todayStart).
		Count(&out.NewUsersToday).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND created_at >= ?", dayAgo).
		Count(&out.NewUsers24h).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND created_at >= ?", weekAgo).
		Count(&out.NewUsers7d).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND referrer_id IS NOT NULL").
		Count(&out.ReferredUsers).Error
	out.OrganicUsers = out.TotalUsers - out.ReferredUsers
	if out.OrganicUsers < 0 {
		out.OrganicUsers = 0
	}
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND referrer_id IS NOT NULL AND created_at >= ?", todayStart).
		Count(&out.ReferredToday).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND referrer_id IS NOT NULL AND created_at >= ?", weekAgo).
		Count(&out.Referred7d).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND (betting_balance > 0 OR promo_balance > 0)").
		Count(&out.WithBalance).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND ton_wallet <> ''").
		Count(&out.WithWallet).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0 AND staking_tier = ?", domain.TierBoost).
		Count(&out.BoostTierUsers).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0").
		Select("COALESCE(SUM(betting_balance), 0)").
		Scan(&out.BalancesNanoton).Error
	_ = r.db.WithContext(ctx).Model(&domain.User{}).
		Where("telegram_id > 0").
		Select("COALESCE(SUM(promo_balance), 0)").
		Scan(&out.PromoBalancesNanoton).Error

	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Distinct("user_id").
		Count(&out.WithStaking).Error
	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Select("COALESCE(SUM(principal_nanoton), 0)").
		Scan(&out.StakingTVLNanoton).Error
	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Select("COALESCE(SUM(accrued_yield_nanoton), 0)").
		Scan(&out.StakingAccruedYieldNanoton).Error

	type tierPrincipal struct {
		Tier      domain.StakingTier `gorm:"column:staking_tier"`
		Principal int64              `gorm:"column:principal"`
	}
	var byTier []tierPrincipal
	_ = r.db.WithContext(ctx).Table("staking_positions AS sp").
		Select("u.staking_tier, COALESCE(SUM(sp.principal_nanoton), 0) AS principal").
		Joins("JOIN users u ON u.id = sp.user_id AND u.deleted_at IS NULL").
		Where("sp.is_active = ?", true).
		Group("u.staking_tier").
		Scan(&byTier)

	basePct, boostPct := 3.0, 4.0
	var yieldSettings domain.PlatformYieldSettings
	if err := r.db.WithContext(ctx).First(&yieldSettings, 1).Error; err == nil {
		if yieldSettings.StakingBaseMonthlyPercent >= 0 {
			basePct = yieldSettings.StakingBaseMonthlyPercent
		}
		if yieldSettings.StakingBoostMonthlyPercent >= 0 {
			boostPct = yieldSettings.StakingBoostMonthlyPercent
		}
	}
	for _, row := range byTier {
		out.StakingDailyYieldNanoton += projectedDailyYield(row.Principal, row.Tier, basePct, boostPct)
	}
	out.StakingWeeklyYieldNanoton = out.StakingDailyYieldNanoton * 7

	type topRefRow struct {
		UserID     uuid.UUID `gorm:"column:id"`
		TelegramID int64     `gorm:"column:telegram_id"`
		Username   string    `gorm:"column:username"`
		FirstName  string    `gorm:"column:first_name"`
		Total      int64     `gorm:"column:total"`
		Today      int64     `gorm:"column:today"`
		Week       int64     `gorm:"column:week"`
	}
	var top []topRefRow
	_ = r.db.WithContext(ctx).Raw(`
		SELECT
			r.id,
			r.telegram_id,
			r.username,
			r.first_name,
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE u.created_at >= ?) AS today,
			COUNT(*) FILTER (WHERE u.created_at >= ?) AS week
		FROM users u
		JOIN users r ON r.id = u.referrer_id AND r.deleted_at IS NULL
		WHERE u.deleted_at IS NULL AND u.telegram_id > 0 AND u.referrer_id IS NOT NULL
		GROUP BY r.id, r.telegram_id, r.username, r.first_name
		ORDER BY total DESC
		LIMIT 12
	`, todayStart, weekAgo).Scan(&top)
	out.TopReferrers = make([]domain.AdminReferrerStat, 0, len(top))
	for _, row := range top {
		out.TopReferrers = append(out.TopReferrers, domain.AdminReferrerStat{
			UserID:             row.UserID,
			TelegramID:         row.TelegramID,
			Username:           row.Username,
			FirstName:          row.FirstName,
			ReferralCode:       referralCodeFromTelegramID(row.TelegramID),
			ReferralCount:      row.Total,
			ReferralCountToday: row.Today,
			ReferralCount7d:    row.Week,
		})
	}

	return out, nil
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

func (r *AdminRepo) CountUserBets(ctx context.Context, userID uuid.UUID, limit int) ([]domain.GameBet, error) {
	if limit <= 0 {
		limit = 30
	}
	var bets []domain.GameBet
	return bets, r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&bets).Error
}

func (r *AdminRepo) appendRiskFlag(ctx context.Context, userID uuid.UUID, flag string) error {
	var user domain.User
	if err := r.db.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		return err
	}
	flags := user.RiskFlags
	for _, f := range flags {
		if f == flag {
			return nil
		}
	}
	flags = append(flags, flag)
	raw, _ := json.Marshal(flags)
	return r.db.WithContext(ctx).Model(&domain.User{}).Where("id = ?", userID).
		Update("risk_flags", raw).Error
}

var _ domain.AdminRepository = (*AdminRepo)(nil)
