package postgres

import (
	"errors"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"gorm.io/gorm"
)

func depositWagerEnabledTx(tx *gorm.DB) (bool, error) {
	var settings domain.PlatformWithdrawalSettings
	err := tx.First(&settings, "id = ?", 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return true, nil // default on
	}
	if err != nil {
		return false, err
	}
	return settings.DepositWagerEnabled, nil
}

func maybeAddDepositWagerTx(tx *gorm.DB, user *domain.User, amount int64) error {
	if amount <= 0 || user == nil {
		return nil
	}
	enabled, err := depositWagerEnabledTx(tx)
	if err != nil || !enabled {
		return err
	}
	return applyWagerRequiredTx(tx, user, amount)
}

func enforceDepositWagerTx(tx *gorm.DB, user *domain.User, debitNanoton int64) error {
	if user == nil {
		return nil
	}
	enabled, err := depositWagerEnabledTx(tx)
	if err != nil {
		return err
	}
	if !enabled {
		return nil
	}
	cap := domain.WithdrawableDebitCap(user.BettingBalance, user.WagerRequiredNanoton, user.WagerProgressNanoton)
	if debitNanoton > cap {
		return domain.NewWagerIncomplete(user, 0)
	}
	return nil
}

func crashWagerTargetTx(tx *gorm.DB) float64 {
	var settings domain.PlatformWithdrawalSettings
	if err := tx.First(&settings, "id = ?", 1).Error; err != nil {
		return domain.DefaultCrashWagerTarget
	}
	return domain.NormalizeCrashWagerTarget(settings.CrashWagerTarget)
}
