package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StakingRepo struct {
	db *gorm.DB
}

func NewStakingRepo(db *gorm.DB) *StakingRepo {
	return &StakingRepo{db: db}
}

func (r *StakingRepo) CreatePosition(ctx context.Context, pos *domain.StakingPosition) error {
	return r.db.WithContext(ctx).Create(pos).Error
}

func (r *StakingRepo) ListActiveByUser(ctx context.Context, userID uuid.UUID) ([]domain.StakingPosition, error) {
	var positions []domain.StakingPosition
	err := r.db.WithContext(ctx).Where("user_id = ? AND is_active = ?", userID, true).Find(&positions).Error
	return positions, err
}

func (r *StakingRepo) ListAllActive(ctx context.Context) ([]domain.StakingPosition, error) {
	var positions []domain.StakingPosition
	err := r.db.WithContext(ctx).Where("is_active = ?", true).Find(&positions).Error
	return positions, err
}

func (r *StakingRepo) Deactivate(ctx context.Context, positionID uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("id = ?", positionID).
		Updates(map[string]interface{}{"is_active": false, "unstaked_at": now, "updated_at": now}).Error
}

func (r *StakingRepo) UpdateAccrual(ctx context.Context, positionID uuid.UUID, yieldDelta int64) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("id = ?", positionID).
		Updates(map[string]interface{}{
			"accrued_yield_nanoton": gorm.Expr("accrued_yield_nanoton + ?", yieldDelta),
			"last_accrual_at":       now,
			"updated_at":            now,
		}).Error
}

func (r *StakingRepo) GetSnapshot(ctx context.Context, userID uuid.UUID) (*domain.UserStakingSnapshot, error) {
	var snap domain.UserStakingSnapshot
	err := r.db.WithContext(ctx).First(&snap, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &snap, err
}

func (r *StakingRepo) UpsertSnapshot(ctx context.Context, snap *domain.UserStakingSnapshot) error {
	snap.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(snap).Error
}

func (r *StakingRepo) SumRouletteWagerLast7Days(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	since := time.Now().UTC().Add(-7 * 24 * time.Hour)
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND game_type = ? AND created_at >= ?", userID, domain.GameRoulette, since).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

var _ domain.StakingRepository = (*StakingRepo)(nil)

type GameRepo struct {
	db *gorm.DB
}

func NewGameRepo(db *gorm.DB) *GameRepo {
	return &GameRepo{db: db}
}

func (r *GameRepo) CreateRound(ctx context.Context, round *domain.GameRound) error {
	return r.db.WithContext(ctx).Create(round).Error
}

func (r *GameRepo) UpdateRound(ctx context.Context, round *domain.GameRound) error {
	return r.db.WithContext(ctx).Save(round).Error
}

func (r *GameRepo) GetCurrentRound(ctx context.Context, gameType domain.GameType) (*domain.GameRound, error) {
	var round domain.GameRound
	err := r.db.WithContext(ctx).
		Where("game_type = ? AND status != ?", gameType, "finished").
		Order("created_at DESC").First(&round).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &round, err
}

func (r *GameRepo) GetRoundByID(ctx context.Context, id uuid.UUID) (*domain.GameRound, error) {
	var round domain.GameRound
	if err := r.db.WithContext(ctx).First(&round, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &round, nil
}

func (r *GameRepo) GetNextRoundNumber(ctx context.Context, gameType domain.GameType) (int64, error) {
	var maxNum int64
	err := r.db.WithContext(ctx).Model(&domain.GameRound{}).
		Where("game_type = ?", gameType).
		Select("COALESCE(MAX(round_number), 0)").Scan(&maxNum).Error
	return maxNum + 1, err
}

func (r *GameRepo) CreateBet(ctx context.Context, bet *domain.GameBet) error {
	return r.db.WithContext(ctx).Create(bet).Error
}

func (r *GameRepo) ListBetsByRound(ctx context.Context, roundID uuid.UUID) ([]domain.GameBet, error) {
	var bets []domain.GameBet
	err := r.db.WithContext(ctx).Where("round_id = ?", roundID).Find(&bets).Error
	return bets, err
}

func (r *GameRepo) ListPendingBetsByRound(ctx context.Context, roundID uuid.UUID) ([]domain.GameBet, error) {
	var bets []domain.GameBet
	err := r.db.WithContext(ctx).Where("round_id = ? AND status = ?", roundID, domain.BetPending).Find(&bets).Error
	return bets, err
}

func (r *GameRepo) SettleBet(ctx context.Context, betID uuid.UUID, status domain.BetStatus, payout int64, multiplier *float64) (bool, error) {
	now := time.Now().UTC()
	updates := map[string]interface{}{
		"status":           status,
		"payout_nanoton":   payout,
		"settled_at":       now,
		"cashout_multiplier": multiplier,
	}
	res := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("id = ? AND status = ?", betID, domain.BetPending).
		Updates(updates)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (r *GameRepo) FindBetByIdempotency(ctx context.Context, key string) (*domain.GameBet, error) {
	var bet domain.GameBet
	err := r.db.WithContext(ctx).Where("idempotency_key = ?", key).First(&bet).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &bet, err
}

var _ domain.GameRepository = (*GameRepo)(nil)

type PvPRepo struct {
	db *gorm.DB
}

func NewPvPRepo(db *gorm.DB) *PvPRepo {
	return &PvPRepo{db: db}
}

func (r *PvPRepo) CreateRoom(ctx context.Context, room *domain.PvPRoom) error {
	return r.db.WithContext(ctx).Create(room).Error
}

func (r *PvPRepo) GetRoom(ctx context.Context, id uuid.UUID) (*domain.PvPRoom, error) {
	var room domain.PvPRoom
	if err := r.db.WithContext(ctx).First(&room, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &room, nil
}

func (r *PvPRepo) UpdateRoom(ctx context.Context, room *domain.PvPRoom) error {
	return r.db.WithContext(ctx).Save(room).Error
}

func (r *PvPRepo) ListOpenRooms(ctx context.Context) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).Where("status = ?", "open").Order("created_at DESC").Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) AddPlayer(ctx context.Context, player *domain.PvPRoomPlayer) error {
	return r.db.WithContext(ctx).Create(player).Error
}

func (r *PvPRepo) ListPlayers(ctx context.Context, roomID uuid.UUID) ([]domain.PvPRoomPlayer, error) {
	var players []domain.PvPRoomPlayer
	err := r.db.WithContext(ctx).Where("room_id = ?", roomID).Find(&players).Error
	return players, err
}

func (r *PvPRepo) CountPlayers(ctx context.Context, roomID uuid.UUID) (int, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.PvPRoomPlayer{}).Where("room_id = ?", roomID).Count(&count).Error
	return int(count), err
}

var _ domain.PvPRepository = (*PvPRepo)(nil)
