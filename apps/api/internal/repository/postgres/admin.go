package postgres

import (
	"context"
	"encoding/json"
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

func (r *AdminRepo) ListUsers(ctx context.Context, query string, limit int) ([]domain.User, error) {
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
	return users, q.Find(&users).Error
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
