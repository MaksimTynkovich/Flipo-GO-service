package staking

import "context"

type Notifier interface {
	SendDailyStakingYield(ctx context.Context, telegramUserID int64, yieldNanoton, referralBonusNanoton int64) error
	SendWeeklyStakingComplete(ctx context.Context, telegramUserID int64, totalYieldNanoton int64) error
}
