package postgres

import (
	"context"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func (r *AdminRepo) StakingOverview(ctx context.Context) (*domain.AdminStakingOverview, error) {
	out := &domain.AdminStakingOverview{}
	now := time.Now().UTC()

	var epoch domain.StakingEpoch
	err := r.db.WithContext(ctx).
		Where("status = ? AND starts_at <= ? AND ends_at > ?", domain.EpochActive, now, now).
		Order("starts_at DESC").
		First(&epoch).Error
	if err == nil {
		out.EpochID = epoch.ID.String()
		out.EpochStartsAt = epoch.StartsAt
		out.EpochEndsAt = epoch.EndsAt
		out.EpochStatus = string(epoch.Status)
	}

	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Count(&out.ActivePositions).Error
	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Distinct("user_id").
		Count(&out.ActiveStakers).Error
	_ = r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Select("COALESCE(SUM(principal_nanoton), 0)").
		Scan(&out.TVLNanoton).Error

	basePct, boostPct := 3.0, 4.0
	cap := domain.DefaultStakingTVLCapNanoton
	personalBase := domain.DefaultStakingPersonalLimitNano
	var yieldSettings domain.PlatformYieldSettings
	if err := r.db.WithContext(ctx).First(&yieldSettings, 1).Error; err == nil {
		if yieldSettings.StakingBaseMonthlyPercent >= 0 {
			basePct = yieldSettings.StakingBaseMonthlyPercent
		}
		if yieldSettings.StakingBoostMonthlyPercent >= 0 {
			boostPct = yieldSettings.StakingBoostMonthlyPercent
		}
		if yieldSettings.StakingTVLCapNanoton > 0 {
			cap = yieldSettings.StakingTVLCapNanoton
		}
		if yieldSettings.StakingPersonalLimitNanoton > 0 {
			personalBase = yieldSettings.StakingPersonalLimitNanoton
		}
		out.BaseMonthlyPercent = basePct
		out.BoostMonthlyPercent = boostPct
	} else {
		out.BaseMonthlyPercent = basePct
		out.BoostMonthlyPercent = boostPct
	}
	out.TVLCapNanoton = cap
	out.PersonalLimitNanoton = personalBase
	out.TVLRemainingNanoton = cap - out.TVLNanoton
	if out.TVLRemainingNanoton < 0 {
		out.TVLRemainingNanoton = 0
	}

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
	for _, row := range byTier {
		out.ProjectedPayoutNanoton += projectedDailyYield(row.Principal, row.Tier, basePct, boostPct)
	}

	dayAgo := now.Add(-24 * time.Hour)
	_ = r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("type = ? AND created_at >= ?", domain.LedgerStakeYield, dayAgo).
		Select("COALESCE(SUM(amount_nanoton), 0)").
		Scan(&out.PaidLast24hNanoton).Error

	return out, nil
}

func (r *AdminRepo) ListStakingEpochs(ctx context.Context, limit, offset int) ([]domain.AdminStakingEpochRow, int64, error) {
	if limit <= 0 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	_ = r.db.WithContext(ctx).Model(&domain.StakingEpoch{}).Count(&total).Error

	type row struct {
		ID           uuid.UUID `gorm:"column:id"`
		StartsAt     time.Time `gorm:"column:starts_at"`
		EndsAt       time.Time `gorm:"column:ends_at"`
		Status       string    `gorm:"column:status"`
		Positions    int64     `gorm:"column:positions"`
		Principal    int64     `gorm:"column:principal"`
		AccruedYield int64     `gorm:"column:accrued_yield"`
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
		SELECT e.id, e.starts_at, e.ends_at, e.status,
			COUNT(sp.id) AS positions,
			COALESCE(SUM(sp.principal_nanoton), 0) AS principal,
			COALESCE(SUM(sp.accrued_yield_nanoton), 0) AS accrued_yield
		FROM staking_epochs e
		LEFT JOIN staking_positions sp ON sp.epoch_id = e.id
		GROUP BY e.id, e.starts_at, e.ends_at, e.status
		ORDER BY e.starts_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset).Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	out := make([]domain.AdminStakingEpochRow, 0, len(rows))
	for _, item := range rows {
		out = append(out, domain.AdminStakingEpochRow{
			ID:                     item.ID.String(),
			StartsAt:               item.StartsAt,
			EndsAt:                 item.EndsAt,
			Status:                 item.Status,
			Positions:              item.Positions,
			PrincipalNanoton:       item.Principal,
			AccruedYieldNanoton:    item.AccruedYield,
		})
	}
	return out, total, nil
}

func (r *AdminRepo) ListStakingPositions(ctx context.Context, filter domain.AdminStakingPositionFilter) ([]domain.AdminStakingPositionRow, int64, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	q := r.db.WithContext(ctx).Table("staking_positions AS sp").
		Joins("JOIN users u ON u.id = sp.user_id AND u.deleted_at IS NULL")
	if filter.ActiveOnly {
		q = q.Where("sp.is_active = ?", true)
	}
	if filter.EpochID != "" {
		if id, err := uuid.Parse(filter.EpochID); err == nil {
			q = q.Where("sp.epoch_id = ?", id)
		}
	}
	if reason := strings.TrimSpace(filter.RevokedReason); reason != "" {
		q = q.Where("sp.revoked_reason = ?", reason)
	}
	if search := strings.TrimSpace(filter.Query); search != "" {
		like := "%" + search + "%"
		q = q.Where(`(
			u.username ILIKE ? OR
			u.first_name ILIKE ? OR
			sp.gift_slug ILIKE ? OR
			CAST(u.telegram_id AS TEXT) ILIKE ?
		)`, like, like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	type row struct {
		ID               uuid.UUID  `gorm:"column:id"`
		UserID           uuid.UUID  `gorm:"column:user_id"`
		TelegramID       int64      `gorm:"column:telegram_id"`
		Username         string     `gorm:"column:username"`
		FirstName        string     `gorm:"column:first_name"`
		GiftSlug         string     `gorm:"column:gift_slug"`
		Source           string     `gorm:"column:source"`
		Principal        int64      `gorm:"column:principal_nanoton"`
		Accrued          int64      `gorm:"column:accrued_yield_nanoton"`
		IsActive         bool       `gorm:"column:is_active"`
		RevokedReason    *string    `gorm:"column:revoked_reason"`
		StakedAt         time.Time  `gorm:"column:staked_at"`
		LastAccrualAt    time.Time  `gorm:"column:last_accrual_at"`
		UnstakedAt       *time.Time `gorm:"column:unstaked_at"`
		EpochID          uuid.UUID  `gorm:"column:epoch_id"`
	}
	var rows []row
	err := q.Select(`
		sp.id, sp.user_id, u.telegram_id, u.username, u.first_name,
		sp.gift_slug, sp.source, sp.principal_nanoton, sp.accrued_yield_nanoton,
		sp.is_active, sp.revoked_reason, sp.staked_at, sp.last_accrual_at, sp.unstaked_at, sp.epoch_id
	`).
		Order("sp.staked_at DESC").
		Limit(limit).
		Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	out := make([]domain.AdminStakingPositionRow, 0, len(rows))
	for _, item := range rows {
		reason := ""
		if item.RevokedReason != nil {
			reason = *item.RevokedReason
		}
		out = append(out, domain.AdminStakingPositionRow{
			ID:                  item.ID.String(),
			UserID:              item.UserID.String(),
			TelegramID:          item.TelegramID,
			Username:            item.Username,
			FirstName:           item.FirstName,
			GiftSlug:            item.GiftSlug,
			Source:              item.Source,
			PrincipalNanoton:    item.Principal,
			AccruedYieldNanoton: item.Accrued,
			IsActive:            item.IsActive,
			RevokedReason:       reason,
			StakedAt:            item.StakedAt,
			LastAccrualAt:       item.LastAccrualAt,
			UnstakedAt:          item.UnstakedAt,
			EpochID:             item.EpochID.String(),
		})
	}
	return out, total, nil
}

func (r *AdminRepo) ListStakingStakers(ctx context.Context, filter domain.AdminStakingStakerFilter) ([]domain.AdminStakingStakerRow, int64, int64, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

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

	where := `sp.is_active = TRUE AND u.deleted_at IS NULL`
	args := make([]any, 0, 4)
	if search := strings.TrimSpace(filter.Query); search != "" {
		like := "%" + search + "%"
		where += ` AND (
			u.username ILIKE ? OR
			u.first_name ILIKE ? OR
			CAST(u.telegram_id AS TEXT) ILIKE ?
		)`
		args = append(args, like, like, like)
	}

	var total int64
	countSQL := `
		SELECT COUNT(*) FROM (
			SELECT sp.user_id
			FROM staking_positions sp
			JOIN users u ON u.id = sp.user_id
			WHERE ` + where + `
			GROUP BY sp.user_id
		) t`
	if err := r.db.WithContext(ctx).Raw(countSQL, args...).Scan(&total).Error; err != nil {
		return nil, 0, 0, err
	}

	// Total projected payout for all matching stakers (not limited by pagination).
	var totalProjectedPayout int64
	type payoutAggRow struct {
		StakingTier           domain.StakingTier `gorm:"column:staking_tier"`
		Principal             int64              `gorm:"column:principal"`
		BonusPayoutsRemaining int                `gorm:"column:bonus_payouts_remaining"`
	}
	var payoutAgg []payoutAggRow
	aggSQL := `
		SELECT
			u.staking_tier AS staking_tier,
			COALESCE(SUM(sp.principal_nanoton), 0) AS principal,
			COALESCE(MAX(uss.bonus_payouts_remaining), 0) AS bonus_payouts_remaining
		FROM staking_positions sp
		JOIN users u ON u.id = sp.user_id
		LEFT JOIN user_staking_streaks uss ON uss.user_id = u.id
		WHERE ` + where + `
		GROUP BY u.id, u.staking_tier
	`
	if err := r.db.WithContext(ctx).Raw(aggSQL, args...).Scan(&payoutAgg).Error; err != nil {
		return nil, 0, 0, err
	}
	for _, a := range payoutAgg {
		payout := projectedDailyYield(a.Principal, a.StakingTier, basePct, boostPct)
		if a.BonusPayoutsRemaining > 0 {
			payout = int64(float64(payout) * domain.StakingStreakBonusMultiplier)
		}
		totalProjectedPayout += payout
	}

	type row struct {
		UserID                uuid.UUID         `gorm:"column:user_id"`
		TelegramID            int64             `gorm:"column:telegram_id"`
		Username              string            `gorm:"column:username"`
		FirstName             string            `gorm:"column:first_name"`
		StakingTier           domain.StakingTier `gorm:"column:staking_tier"`
		Positions             int64             `gorm:"column:positions"`
		Principal             int64             `gorm:"column:principal"`
		BonusPayoutsRemaining int               `gorm:"column:bonus_payouts_remaining"`
	}
	listArgs := append(append([]any{}, args...), limit, offset)
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			u.id AS user_id,
			u.telegram_id,
			COALESCE(u.username, '') AS username,
			COALESCE(u.first_name, '') AS first_name,
			u.staking_tier,
			COUNT(sp.id) AS positions,
			COALESCE(SUM(sp.principal_nanoton), 0) AS principal,
			COALESCE(MAX(uss.bonus_payouts_remaining), 0) AS bonus_payouts_remaining
		FROM staking_positions sp
		JOIN users u ON u.id = sp.user_id
		LEFT JOIN user_staking_streaks uss ON uss.user_id = u.id
		WHERE `+where+`
		GROUP BY u.id, u.telegram_id, u.username, u.first_name, u.staking_tier
		ORDER BY principal DESC, u.telegram_id ASC
		LIMIT ? OFFSET ?
	`, listArgs...).Scan(&rows).Error
	if err != nil {
		return nil, 0, 0, err
	}

	out := make([]domain.AdminStakingStakerRow, 0, len(rows))
	for _, item := range rows {
		payout := projectedDailyYield(item.Principal, item.StakingTier, basePct, boostPct)
		bonusActive := item.BonusPayoutsRemaining > 0
		if bonusActive {
			payout = int64(float64(payout) * domain.StakingStreakBonusMultiplier)
		}
		out = append(out, domain.AdminStakingStakerRow{
			UserID:                 item.UserID.String(),
			TelegramID:             item.TelegramID,
			Username:               item.Username,
			FirstName:              item.FirstName,
			StakingTier:            item.StakingTier,
			Positions:              item.Positions,
			PrincipalNanoton:       item.Principal,
			ProjectedPayoutNanoton: payout,
			StreakBonusActive:      bonusActive,
		})
	}
	return out, total, totalProjectedPayout, nil
}

func (r *AdminRepo) ListStakingActivity(ctx context.Context, filter domain.AdminStakingActivityFilter) ([]domain.AdminStakingActivityRow, int64, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	q := r.db.WithContext(ctx).Table("analytics_events AS e").
		Joins("LEFT JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL").
		Where("e.event_category = ?", "staking").
		Where("e.event_name IN ?", []string{
			"staking_started",
			"staking_yield_paid",
			"staking_unstake_requested",
			"referral_bonus_paid",
		})

	switch strings.ToLower(strings.TrimSpace(filter.Status)) {
	case "success", "error":
		q = q.Where("e.status = ?", strings.ToLower(strings.TrimSpace(filter.Status)))
	}
	if search := strings.TrimSpace(filter.Query); search != "" {
		like := "%" + search + "%"
		q = q.Where(`(
			u.username ILIKE ? OR
			u.first_name ILIKE ? OR
			CAST(u.telegram_id AS TEXT) ILIKE ? OR
			e.error_code ILIKE ? OR
			e.error_message ILIKE ? OR
			COALESCE(e.properties->>'slug', '') ILIKE ? OR
			e.event_name ILIKE ?
		)`, like, like, like, like, like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	type row struct {
		ID           uuid.UUID  `gorm:"column:id"`
		OccurredAt   time.Time  `gorm:"column:occurred_at"`
		EventName    string     `gorm:"column:event_name"`
		Status       string     `gorm:"column:status"`
		ErrorCode    string     `gorm:"column:error_code"`
		ErrorMessage string     `gorm:"column:error_message"`
		UserID       *uuid.UUID `gorm:"column:user_id"`
		TelegramID   *int64     `gorm:"column:telegram_id"`
		Username     string     `gorm:"column:username"`
		FirstName    string     `gorm:"column:first_name"`
		RequestID    string     `gorm:"column:request_id"`
		Source       string     `gorm:"column:source"`
		GiftSlug     string     `gorm:"column:gift_slug"`
		ItemID       string     `gorm:"column:item_id"`
	}
	var rows []row
	err := q.Select(`
		e.id, e.occurred_at, e.event_name, e.status, e.error_code, e.error_message,
		e.user_id, COALESCE(e.telegram_id, u.telegram_id) AS telegram_id,
		COALESCE(u.username, '') AS username, COALESCE(u.first_name, '') AS first_name,
		e.request_id, e.source,
		COALESCE(e.properties->>'slug', '') AS gift_slug,
		COALESCE(e.properties->>'item_id', '') AS item_id
	`).
		Order("e.occurred_at DESC").
		Limit(limit).
		Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	out := make([]domain.AdminStakingActivityRow, 0, len(rows))
	for _, item := range rows {
		rowOut := domain.AdminStakingActivityRow{
			ID:           item.ID.String(),
			OccurredAt:   item.OccurredAt,
			EventName:    item.EventName,
			Status:       item.Status,
			ErrorCode:    item.ErrorCode,
			ErrorMessage: item.ErrorMessage,
			Username:     item.Username,
			FirstName:    item.FirstName,
			GiftSlug:     item.GiftSlug,
			ItemID:       item.ItemID,
			Source:       item.Source,
			RequestID:    item.RequestID,
		}
		if item.UserID != nil {
			rowOut.UserID = item.UserID.String()
		}
		if item.TelegramID != nil {
			rowOut.TelegramID = *item.TelegramID
		}
		out = append(out, rowOut)
	}
	return out, total, nil
}
