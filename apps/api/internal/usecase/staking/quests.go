package staking

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

const (
	QuestFirstGameBet      = "first_game_bet"
	QuestRouletteWager5    = "roulette_wager_5"
	QuestRouletteWager25   = "roulette_wager_25"
	QuestCrashWager5       = "crash_wager_5"
	QuestCrashWager25      = "crash_wager_25"
	QuestPvPOneMatch       = "pvp_one_match"
	QuestPvPFiveMatches    = "pvp_five_matches"
	QuestDeposit5          = "deposit_5"
	QuestDeposit30         = "deposit_30"
	QuestReferralActive1   = "referral_active_1"
	QuestReferralActive3   = "referral_active_3"
	QuestFullEpochStake    = "full_epoch_stake"

	questTarget5TON  = 5_000_000_000
	questTarget25TON = 25_000_000_000
	questTarget30TON = 30_000_000_000
)

type QuestProgressView struct {
	Code               string  `json:"code"`
	Title              string  `json:"title"`
	Description        string  `json:"description"`
	RewardLimitNanoton int64   `json:"reward_limit_nanoton"`
	Completed          bool    `json:"completed"`
	ProgressCurrent    int64   `json:"progress_current"`
	ProgressTarget     int64   `json:"progress_target"`
	ProgressRatio      float64 `json:"progress_ratio"`
}

type QuestsResponse struct {
	Quests                   []QuestProgressView `json:"quests"`
	PersonalLimitNanoton     int64               `json:"personal_limit_nanoton"`
	PersonalUsedNanoton      int64               `json:"personal_used_nanoton"`
	PersonalRemainingNanoton int64               `json:"personal_remaining_nanoton"`
	BaseLimitNanoton         int64               `json:"base_limit_nanoton"`
	MaxLimitNanoton          int64               `json:"max_limit_nanoton"`
	TVLNanoton               int64               `json:"tvl_nanoton"`
	TVLCapNanoton            int64               `json:"tvl_cap_nanoton"`
	TVLRemainingNanoton      int64               `json:"tvl_remaining_nanoton"`
}

func (s *Service) ListQuests(ctx context.Context, userID uuid.UUID) (*QuestsResponse, error) {
	if err := s.syncQuestCompletions(ctx, userID); err != nil {
		return nil, err
	}

	quests, err := s.staking.ListActiveQuests(ctx)
	if err != nil {
		return nil, err
	}
	completions, err := s.staking.ListQuestCompletions(ctx, userID)
	if err != nil {
		return nil, err
	}
	done := make(map[string]bool, len(completions))
	for _, c := range completions {
		done[c.QuestCode] = true
	}

	views := make([]QuestProgressView, 0, len(quests))
	var maxLimit int64 = domain.DefaultStakingPersonalLimitNano
	for _, q := range quests {
		maxLimit += q.RewardLimitNanoton
		current, target := s.questProgress(ctx, userID, q.Code)
		ratio := 0.0
		if target > 0 {
			ratio = float64(current) / float64(target)
			if ratio > 1 {
				ratio = 1
			}
		}
		if done[q.Code] {
			ratio = 1
			if current < target {
				current = target
			}
		}
		views = append(views, QuestProgressView{
			Code:               q.Code,
			Title:              q.Title,
			Description:        q.Description,
			RewardLimitNanoton: q.RewardLimitNanoton,
			Completed:          done[q.Code],
			ProgressCurrent:    current,
			ProgressTarget:     target,
			ProgressRatio:      ratio,
		})
	}

	limit, err := s.PersonalStakeLimit(ctx, userID)
	if err != nil {
		return nil, err
	}
	used, err := s.staking.SumActivePrincipalByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	remaining := limit - used
	if remaining < 0 {
		remaining = 0
	}
	tvl, cap, tvlRemaining, err := s.TVLSnapshot(ctx)
	if err != nil {
		return nil, err
	}

	return &QuestsResponse{
		Quests:                   views,
		PersonalLimitNanoton:     limit,
		PersonalUsedNanoton:      used,
		PersonalRemainingNanoton: remaining,
		BaseLimitNanoton:         domain.DefaultStakingPersonalLimitNano,
		MaxLimitNanoton:          maxLimit,
		TVLNanoton:               tvl,
		TVLCapNanoton:            cap,
		TVLRemainingNanoton:      tvlRemaining,
	}, nil
}

func (s *Service) syncQuestCompletions(ctx context.Context, userID uuid.UUID) error {
	quests, err := s.staking.ListActiveQuests(ctx)
	if err != nil {
		return err
	}
	completions, err := s.staking.ListQuestCompletions(ctx, userID)
	if err != nil {
		return err
	}
	done := make(map[string]bool, len(completions))
	for _, c := range completions {
		done[c.QuestCode] = true
	}
	for _, q := range quests {
		if done[q.Code] {
			continue
		}
		ok, err := s.isQuestComplete(ctx, userID, q.Code)
		if err != nil {
			return err
		}
		if ok {
			if err := s.staking.CompleteQuest(ctx, userID, q.Code); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) isQuestComplete(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	current, target := s.questProgress(ctx, userID, code)
	return target > 0 && current >= target, nil
}

func (s *Service) questProgress(ctx context.Context, userID uuid.UUID, code string) (current, target int64) {
	switch code {
	case QuestFirstGameBet:
		target = 1
		ok, err := s.staking.HasAnyGameBet(ctx, userID)
		if err == nil && ok {
			current = 1
		}
	case QuestRouletteWager5:
		target = questTarget5TON
		if v, err := s.staking.SumWagerByGame(ctx, userID, domain.GameRoulette); err == nil {
			current = v
		}
	case QuestRouletteWager25:
		target = questTarget25TON
		if v, err := s.staking.SumWagerByGame(ctx, userID, domain.GameRoulette); err == nil {
			current = v
		}
	case QuestCrashWager5:
		target = questTarget5TON
		if v, err := s.staking.SumWagerByGame(ctx, userID, domain.GameCrash); err == nil {
			current = v
		}
	case QuestCrashWager25:
		target = questTarget25TON
		if v, err := s.staking.SumWagerByGame(ctx, userID, domain.GameCrash); err == nil {
			current = v
		}
	case QuestPvPOneMatch:
		target = 1
		if v, err := s.staking.CountPvPMatches(ctx, userID); err == nil {
			current = v
			if current > target {
				current = target
			}
		}
	case QuestPvPFiveMatches:
		target = 5
		if v, err := s.staking.CountPvPMatches(ctx, userID); err == nil {
			current = v
			if current > target {
				current = target
			}
		}
	case QuestDeposit5:
		target = questTarget5TON
		if v, err := s.staking.SumDeposits(ctx, userID); err == nil {
			current = v
		}
	case QuestDeposit30:
		target = questTarget30TON
		if v, err := s.staking.SumDeposits(ctx, userID); err == nil {
			current = v
		}
	case QuestReferralActive1:
		target = 1
		if v, err := s.staking.CountActiveReferrals(ctx, userID); err == nil {
			current = v
			if current > target {
				current = target
			}
		}
	case QuestReferralActive3:
		target = 3
		if v, err := s.staking.CountActiveReferrals(ctx, userID); err == nil {
			current = v
			if current > target {
				current = target
			}
		}
	case QuestFullEpochStake:
		target = 1
		ok, err := s.staking.HasCompletedEpochStake(ctx, userID)
		if err == nil && ok {
			current = 1
		}
	default:
		target = 1
	}
	return current, target
}

func (s *Service) maybeCompleteFullEpochQuest(ctx context.Context, userID uuid.UUID) {
	ok, err := s.staking.HasCompletedEpochStake(ctx, userID)
	if err != nil || !ok {
		return
	}
	_ = s.staking.CompleteQuest(ctx, userID, QuestFullEpochStake)
}
