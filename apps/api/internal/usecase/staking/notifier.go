package staking

import "context"

type Notifier interface {
	// SendDailyStakingSettled sends one Telegram message after the 00:05 settle tick:
	// yield + optional referral bonus + unlock CTA.
	SendDailyStakingSettled(ctx context.Context, telegramUserID int64, yieldNanoton, referralBonusNanoton int64) error
}
