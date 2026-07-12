package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

func (r *StakingRepo) SumActivePrincipal(ctx context.Context) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("is_active = ?", true).
		Select("COALESCE(SUM(principal_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *StakingRepo) SumActivePrincipalByUser(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("user_id = ? AND is_active = ?", userID, true).
		Select("COALESCE(SUM(principal_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *StakingRepo) ListActiveQuests(ctx context.Context) ([]domain.StakingQuest, error) {
	var quests []domain.StakingQuest
	err := r.db.WithContext(ctx).
		Where("active = ?", true).
		Order("sort_order ASC, code ASC").
		Find(&quests).Error
	return quests, err
}

func (r *StakingRepo) ListQuestCompletions(ctx context.Context, userID uuid.UUID) ([]domain.StakingQuestCompletion, error) {
	var completions []domain.StakingQuestCompletion
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&completions).Error
	return completions, err
}

func (r *StakingRepo) CompleteQuest(ctx context.Context, userID uuid.UUID, questCode string) error {
	completion := domain.StakingQuestCompletion{
		UserID:      userID,
		QuestCode:   questCode,
		CompletedAt: time.Now().UTC(),
	}
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&completion).Error
}

func (r *StakingRepo) SumCompletedQuestRewards(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).
		Table("staking_quest_completions AS c").
		Joins("JOIN staking_quests AS q ON q.code = c.quest_code").
		Where("c.user_id = ? AND q.active = ?", userID, true).
		Select("COALESCE(SUM(q.reward_limit_nanoton), 0)").
		Scan(&total).Error
	return total, err
}

func (r *StakingRepo) HasAnyGameBet(ctx context.Context, userID uuid.UUID) (bool, error) {
	return r.HasQualifyingGameBet(ctx, userID, 0)
}

func (r *StakingRepo) HasQualifyingGameBet(ctx context.Context, userID uuid.UUID, minNanoton int64) (bool, error) {
	var betCount int64
	q := r.db.WithContext(ctx).Model(&domain.GameBet{}).Where("user_id = ?", userID)
	if minNanoton > 0 {
		q = q.Where("amount_nanoton >= ?", minNanoton)
	}
	if err := q.Limit(1).Count(&betCount).Error; err != nil {
		return false, err
	}
	if betCount > 0 {
		return true, nil
	}

	var pvpCount int64
	pvpQ := r.db.WithContext(ctx).Model(&domain.PvPRoomPlayer{}).Where("user_id = ?", userID)
	if minNanoton > 0 {
		pvpQ = pvpQ.Where("stake_nanoton >= ?", minNanoton)
	}
	if err := pvpQ.Limit(1).Count(&pvpCount).Error; err != nil {
		return false, err
	}
	return pvpCount > 0, nil
}

func (r *StakingRepo) SumWagerByGame(ctx context.Context, userID uuid.UUID, gameType domain.GameType) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND game_type = ?", userID, gameType).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *StakingRepo) HasPvPMatch(ctx context.Context, userID uuid.UUID) (bool, error) {
	count, err := r.CountPvPMatches(ctx, userID)
	return count > 0, err
}

func (r *StakingRepo) CountPvPMatches(ctx context.Context, userID uuid.UUID) (int64, error) {
	var roomCount int64
	err := r.db.WithContext(ctx).Model(&domain.PvPRoomPlayer{}).
		Where("user_id = ?", userID).
		Count(&roomCount).Error
	if err != nil {
		return 0, err
	}
	if roomCount > 0 {
		return roomCount, nil
	}
	var betCount int64
	err = r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND game_type = ?", userID, domain.GamePvP).
		Count(&betCount).Error
	return betCount, err
}

func (r *StakingRepo) SumDeposits(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.BalanceLedger{}).
		Where("user_id = ? AND type = ? AND amount_nanoton > 0", userID, domain.LedgerDeposit).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *StakingRepo) CountActiveReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Raw(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		WHERE u.referrer_id = ?
		  AND EXISTS (
		    SELECT 1 FROM game_bets b WHERE b.user_id = u.id LIMIT 1
		  )
	`, referrerID).Scan(&count).Error
	return count, err
}

func (r *StakingRepo) CountReferrals(ctx context.Context, referrerID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Raw(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		WHERE u.referrer_id = ?
	`, referrerID).Scan(&count).Error
	return count, err
}

func (r *StakingRepo) HasCompletedEpochStake(ctx context.Context, userID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.StakingPosition{}).
		Where("user_id = ? AND revoked_reason = ?", userID, domain.StakingRevokedEpochEnd).
		Limit(1).
		Count(&count).Error
	return count > 0, err
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

func (r *GameRepo) ListPendingBetsByRoundWithUser(ctx context.Context, roundID uuid.UUID) ([]domain.GameBet, error) {
	var bets []domain.GameBet
	err := r.db.WithContext(ctx).
		Preload("User").
		Where("round_id = ? AND status = ?", roundID, domain.BetPending).
		Order("created_at ASC").
		Find(&bets).Error
	return bets, err
}

func (r *GameRepo) ListBetsByRoundWithUser(ctx context.Context, roundID uuid.UUID) ([]domain.GameBet, error) {
	var bets []domain.GameBet
	err := r.db.WithContext(ctx).
		Preload("User").
		Where("round_id = ?", roundID).
		Order("created_at ASC").
		Find(&bets).Error
	return bets, err
}

func (r *GameRepo) FindPendingBetByUserAndRound(ctx context.Context, userID, roundID uuid.UUID) (*domain.GameBet, error) {
	bets, err := r.ListPendingBetsByUserAndRound(ctx, userID, roundID)
	if err != nil {
		return nil, err
	}
	if len(bets) == 0 {
		return nil, nil
	}
	return &bets[0], nil
}

func (r *GameRepo) ListPendingBetsByUserAndRound(ctx context.Context, userID, roundID uuid.UUID) ([]domain.GameBet, error) {
	var bets []domain.GameBet
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND round_id = ? AND status = ?", userID, roundID, domain.BetPending).
		Order("created_at ASC").
		Find(&bets).Error
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
	result := r.db.WithContext(ctx).Where("idempotency_key = ?", key).Limit(1).Find(&bet)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &bet, nil
}

func (r *GameRepo) ListRecentFinishedRounds(ctx context.Context, gameType domain.GameType, limit int) ([]domain.GameRound, error) {
	var rounds []domain.GameRound
	err := r.db.WithContext(ctx).
		Where("game_type = ? AND status = ?", gameType, "finished").
		Order("round_number DESC").
		Limit(limit).
		Find(&rounds).Error
	return rounds, err
}

func (r *GameRepo) SumUserWinsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND status IN ? AND settled_at >= ?",
			userID, []domain.BetStatus{domain.BetWon, domain.BetCashedOut}, since).
		Select("COALESCE(SUM(payout_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *GameRepo) SumUserBetsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND created_at >= ?", userID, since).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *GameRepo) SumUserSettledBetsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND settled_at >= ? AND status IN ?",
			userID, since, []domain.BetStatus{domain.BetWon, domain.BetLost, domain.BetCashedOut, domain.BetRefunded}).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *GameRepo) SumUserRefundsSince(ctx context.Context, userID uuid.UUID, since time.Time) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("user_id = ? AND settled_at >= ? AND status = ?", userID, since, domain.BetRefunded).
		Select("COALESCE(SUM(payout_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *GameRepo) SumRoundBets(ctx context.Context, roundID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&domain.GameBet{}).
		Where("round_id = ?", roundID).
		Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&total).Error
	return total, err
}

func (r *GameRepo) GameStats(ctx context.Context) ([]domain.AdminGameStat, error) {
	gameTypes := []domain.GameType{domain.GameRoulette, domain.GameCrash, domain.GamePvP}
	out := make([]domain.AdminGameStat, 0, len(gameTypes))
	for _, gt := range gameTypes {
		var stat domain.AdminGameStat
		stat.GameType = gt

		r.db.WithContext(ctx).Model(&domain.GameRound{}).
			Where("game_type = ? AND status = ?", gt, "finished").
			Count(&stat.Rounds)

		r.db.WithContext(ctx).Model(&domain.GameBet{}).
			Where("game_type = ?", gt).
			Select("COALESCE(SUM(amount_nanoton), 0)").Scan(&stat.BetVolumeNanoton)

		r.db.WithContext(ctx).Model(&domain.GameBet{}).
			Where("game_type = ? AND status IN ?", gt, []domain.BetStatus{domain.BetWon, domain.BetCashedOut}).
			Select("COALESCE(SUM(payout_nanoton), 0)").Scan(&stat.PayoutNanoton)

		stat.GGRNanoton = stat.BetVolumeNanoton - stat.PayoutNanoton
		if stat.BetVolumeNanoton > 0 {
			stat.ActualRTPBps = int(stat.PayoutNanoton * 10000 / stat.BetVolumeNanoton)
		}

		var cfg domain.GameConfig
		if err := r.db.WithContext(ctx).First(&cfg, "game_type = ?", gt).Error; err == nil {
			stat.TheoreticalRTPBps = cfg.RTPBps
		}
		out = append(out, stat)
	}
	return out, nil
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

func (r *PvPRepo) ListOpenExpired(ctx context.Context, olderThan time.Time) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).
		Where("status = ? AND created_at <= ?", "open", olderThan).
		Order("created_at ASC").
		Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) ListActiveRooms(ctx context.Context) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).
		Where("status IN ?", []string{"open", "countdown", "spinning"}).
		Order("created_at DESC").
		Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) ListRecentFinishedRooms(ctx context.Context, since time.Time, limit int) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).
		Where("status = ? AND finished_at IS NOT NULL AND finished_at >= ?", "finished", since).
		Order("finished_at DESC").
		Limit(limit).
		Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) ListCountdownDue(ctx context.Context, now time.Time) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).
		Where("status = ? AND spin_at IS NOT NULL AND spin_at <= ?", "countdown", now).
		Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) ListSpinningDue(ctx context.Context, now time.Time) ([]domain.PvPRoom, error) {
	var rooms []domain.PvPRoom
	err := r.db.WithContext(ctx).
		Where("status = ? AND spin_ends_at IS NOT NULL AND spin_ends_at <= ?", "spinning", now).
		Find(&rooms).Error
	return rooms, err
}

func (r *PvPRepo) HasPlayer(ctx context.Context, roomID, userID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.PvPRoomPlayer{}).
		Where("room_id = ? AND user_id = ?", roomID, userID).
		Count(&count).Error
	return count > 0, err
}

func (r *PvPRepo) AddPlayer(ctx context.Context, player *domain.PvPRoomPlayer) error {
	return r.db.WithContext(ctx).Create(player).Error
}

func (r *PvPRepo) ReplacePlayerGifts(ctx context.Context, roomID, userID uuid.UUID, gifts []domain.PvPRoomPlayerGift) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("room_id = ? AND user_id = ?", roomID, userID).
			Delete(&domain.PvPRoomPlayerGift{}).Error; err != nil {
			return err
		}
		if len(gifts) == 0 {
			return nil
		}
		return tx.Create(&gifts).Error
	})
}

func (r *PvPRepo) ListRoomPlayerGifts(ctx context.Context, roomID uuid.UUID) ([]domain.PvPRoomPlayerGift, error) {
	var gifts []domain.PvPRoomPlayerGift
	err := r.db.WithContext(ctx).Where("room_id = ?", roomID).Find(&gifts).Error
	return gifts, err
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
