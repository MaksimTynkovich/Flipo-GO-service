package postgres

import (
	"context"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ReferralRepo struct {
	db *gorm.DB
}

func NewReferralRepo(db *gorm.DB) *ReferralRepo {
	return &ReferralRepo{db: db}
}

func (r *ReferralRepo) GetActivePerk(ctx context.Context, userID uuid.UUID, now time.Time) (*domain.ReferralPerk, error) {
	var perk domain.ReferralPerk
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND activated_at <= ? AND expires_at > ?", userID, now, now).
		First(&perk).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &perk, nil
}

func (r *ReferralRepo) ActivatePerk(ctx context.Context, perk *domain.ReferralPerk) error {
	return r.db.WithContext(ctx).Create(perk).Error
}

func (r *ReferralRepo) HasMilestone(ctx context.Context, referrerID, referralID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.ReferralMilestone{}).
		Where("referrer_id = ? AND referral_id = ?", referrerID, referralID).
		Count(&count).Error
	return count > 0, err
}

func (r *ReferralRepo) CountMilestonesSince(ctx context.Context, referrerID uuid.UUID, since time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.ReferralMilestone{}).
		Where("referrer_id = ? AND created_at >= ?", referrerID, since).
		Count(&count).Error
	return count, err
}

func (r *ReferralRepo) CreateMilestone(ctx context.Context, milestone *domain.ReferralMilestone) error {
	return r.db.WithContext(ctx).Create(milestone).Error
}

func (r *ReferralRepo) SumUserPvPNetLossSince(
	ctx context.Context,
	userID uuid.UUID,
	since time.Time,
	excludeReferrerInRoom bool,
) (int64, error) {
	query := `
		SELECT COALESCE(SUM(
			CASE
				WHEN r.winner_id = p.user_id THEN GREATEST(p.stake_nanoton - COALESCE(r.payout_nanoton, 0), 0)
				ELSE p.stake_nanoton
			END
		), 0)
		FROM pvp_room_players p
		JOIN pvp_rooms r ON r.id = p.room_id
		WHERE p.user_id = ?
		  AND r.status = 'finished'
		  AND r.finished_at IS NOT NULL
		  AND r.finished_at >= ?
	`
	args := []any{userID, since}
	if excludeReferrerInRoom {
		query += `
		  AND NOT EXISTS (
		    SELECT 1
		    FROM pvp_room_players rp_ref
		    JOIN users u_ref ON u_ref.id = rp_ref.user_id
		    JOIN users u_bet ON u_bet.id = p.user_id
		    WHERE rp_ref.room_id = p.room_id
		      AND u_bet.referrer_id IS NOT NULL
		      AND rp_ref.user_id = u_bet.referrer_id
		  )
		`
	}
	var total int64
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&total).Error
	return total, err
}

func (r *ReferralRepo) CountQualifiedReferrals(
	ctx context.Context,
	referrerID uuid.UUID,
	minAge time.Duration,
	minDeposit, minStake int64,
) (int64, error) {
	cutoff := time.Now().UTC().Add(-minAge)
	var count int64
	err := r.db.WithContext(ctx).Raw(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		WHERE u.referrer_id = ?
		  AND u.is_banned = FALSE
		  AND (u.risk_flags IS NULL OR u.risk_flags = '[]'::jsonb)
		  AND u.created_at <= ?
		  AND (
		    COALESCE((
		      SELECT SUM(l.amount_nanoton)
		      FROM balance_ledgers l
		      WHERE l.user_id = u.id AND l.type = 'deposit' AND l.amount_nanoton > 0
		    ), 0) >= ?
		    OR COALESCE((
		      SELECT SUM(sp.principal_nanoton)
		      FROM staking_positions sp
		      WHERE sp.user_id = u.id AND sp.is_active = TRUE
		    ), 0) >= ?
		  )
	`, referrerID, cutoff, minDeposit, minStake).Scan(&count).Error
	return count, err
}

var _ domain.ReferralRepository = (*ReferralRepo)(nil)
