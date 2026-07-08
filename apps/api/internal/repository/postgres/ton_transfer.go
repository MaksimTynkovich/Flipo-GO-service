package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TonTransferRepo struct {
	db *gorm.DB
}

func NewTonTransferRepo(db *gorm.DB) *TonTransferRepo {
	return &TonTransferRepo{db: db}
}

func (r *TonTransferRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.TonTransfer, error) {
	var t domain.TonTransfer
	if err := r.db.WithContext(ctx).First(&t, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TonTransferRepo) FindByIDForUser(ctx context.Context, id, userID uuid.UUID) (*domain.TonTransfer, error) {
	var t domain.TonTransfer
	if err := r.db.WithContext(ctx).First(&t, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TonTransferRepo) FindByIdempotencyKey(ctx context.Context, key string) (*domain.TonTransfer, error) {
	var t domain.TonTransfer
	err := r.db.WithContext(ctx).First(&t, "idempotency_key = ?", key).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &t, err
}

func (r *TonTransferRepo) FindByDepositComment(ctx context.Context, comment string) (*domain.TonTransfer, error) {
	var t domain.TonTransfer
	err := r.db.WithContext(ctx).First(&t, "deposit_comment = ?", comment).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &t, err
}

func (r *TonTransferRepo) FindByTxHash(ctx context.Context, txHash string) (*domain.TonTransfer, error) {
	var t domain.TonTransfer
	err := r.db.WithContext(ctx).First(&t, "tx_hash = ?", txHash).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &t, err
}

func (r *TonTransferRepo) ListByUser(ctx context.Context, userID uuid.UUID, limit int) ([]domain.TonTransfer, error) {
	var items []domain.TonTransfer
	q := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	return items, q.Find(&items).Error
}

func (r *TonTransferRepo) ListByStatus(ctx context.Context, statuses []domain.TonTransferStatus, limit int) ([]domain.TonTransfer, error) {
	var items []domain.TonTransfer
	q := r.db.WithContext(ctx).Where("status IN ?", statuses).Order("created_at ASC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	return items, q.Find(&items).Error
}

func (r *TonTransferRepo) ListAll(ctx context.Context, limit int) ([]domain.TonTransfer, error) {
	if limit <= 0 {
		limit = 100
	}
	var items []domain.TonTransfer
	return items, r.db.WithContext(ctx).Order("created_at DESC").Limit(limit).Find(&items).Error
}

func (r *TonTransferRepo) HasActiveWithdrawal(ctx context.Context, userID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("user_id = ? AND direction = ? AND status IN ?",
			userID,
			domain.TonDirectionWithdraw,
			activeWithdrawalStatuses(),
		).Count(&count).Error
	return count > 0, err
}

func (r *TonTransferRepo) Create(ctx context.Context, transfer *domain.TonTransfer) error {
	now := time.Now().UTC()
	if transfer.ID == uuid.Nil {
		transfer.ID = uuid.New()
	}
	transfer.CreatedAt = now
	transfer.UpdatedAt = now
	return r.db.WithContext(ctx).Create(transfer).Error
}

func (r *TonTransferRepo) Update(ctx context.Context, transfer *domain.TonTransfer) error {
	transfer.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(transfer).Error
}

func (r *TonTransferRepo) CreateWithdrawalAtomic(
	ctx context.Context,
	userID uuid.UUID,
	amountNanoton, feeNanoton int64,
	walletAddress, idempotencyKey string,
	initialStatus domain.TonTransferStatus,
	riskScore int,
	riskFlags []string,
	reviewReason *string,
) (*domain.TonTransfer, int64, error) {
	if existing, err := r.FindByIdempotencyKey(ctx, idempotencyKey); err != nil {
		return nil, 0, err
	} else if existing != nil {
		bal, balErr := r.getUserBalance(ctx, userID)
		if balErr != nil {
			return nil, 0, balErr
		}
		return existing, bal, nil
	}

	var transfer domain.TonTransfer
	var balanceAfter int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		active, err := r.hasActiveWithdrawalTx(tx, userID)
		if err != nil {
			return err
		}
		if active {
			return domain.ErrTransferPending
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", userID).Error; err != nil {
			return err
		}
		if user.TonWallet == "" || user.TonWallet != walletAddress {
			return domain.ErrWalletNotLinked
		}
		if user.BettingBalance < amountNanoton {
			return domain.ErrInsufficientFunds
		}

		newBalance := user.BettingBalance - amountNanoton
		now := time.Now().UTC()
		transfer = domain.TonTransfer{
			ID:             uuid.New(),
			UserID:         userID,
			Direction:      domain.TonDirectionWithdraw,
			Status:         initialStatus,
			AmountNanoton:  amountNanoton,
			FeeNanoton:     feeNanoton,
			WalletAddress:  walletAddress,
			IdempotencyKey: &idempotencyKey,
			RiskScore:      riskScore,
			RiskFlags:      riskFlags,
			ReviewReason:   reviewReason,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := tx.Create(&transfer).Error; err != nil {
			return err
		}

		if err := tx.Model(&user).Update("betting_balance", newBalance).Error; err != nil {
			return err
		}
		ledger := domain.BalanceLedger{
			UserID:        userID,
			Type:          domain.LedgerWithdraw,
			AmountNanoton: -amountNanoton,
			BalanceAfter:  newBalance,
			ReferenceType: "ton_withdraw",
			ReferenceID:   transfer.ID,
			CreatedAt:     now,
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}
		balanceAfter = newBalance
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return &transfer, balanceAfter, nil
}

func (r *TonTransferRepo) CompleteDepositAtomic(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) (int64, error) {
	if existing, err := r.FindByTxHash(ctx, txHash); err != nil {
		return 0, err
	} else if existing != nil && existing.ID != transferID {
		return 0, domain.ErrDuplicateRequest
	}

	var balanceAfter int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var transfer domain.TonTransfer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&transfer, "id = ?", transferID).Error; err != nil {
			return err
		}
		if transfer.Direction != domain.TonDirectionDeposit {
			return domain.ErrTransferNotFound
		}
		if transfer.Status == domain.TonStatusCompleted {
			var user domain.User
			if err := tx.First(&user, "id = ?", transfer.UserID).Error; err != nil {
				return err
			}
			balanceAfter = user.BettingBalance
			return nil
		}
		if transfer.Status != domain.TonStatusAwaitingPayment && transfer.Status != domain.TonStatusPaymentSeen {
			return fmt.Errorf("deposit not confirmable: %s", transfer.Status)
		}
		if transfer.ExpiresAt != nil && time.Now().UTC().After(*transfer.ExpiresAt) {
			return domain.ErrTransferExpired
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, "id = ?", transfer.UserID).Error; err != nil {
			return err
		}

		newBalance := user.BettingBalance + transfer.AmountNanoton
		now := time.Now().UTC()
		if err := tx.Model(&user).Update("betting_balance", newBalance).Error; err != nil {
			return err
		}
		ledger := domain.BalanceLedger{
			UserID:        transfer.UserID,
			Type:          domain.LedgerDeposit,
			AmountNanoton: transfer.AmountNanoton,
			BalanceAfter:  newBalance,
			ReferenceType: "ton_deposit",
			ReferenceID:   transfer.ID,
			CreatedAt:     now,
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}

		transfer.Status = domain.TonStatusCompleted
		transfer.TxHash = &txHash
		transfer.TxLT = &txLT
		transfer.ConfirmedAt = &now
		transfer.UpdatedAt = now
		if err := tx.Save(&transfer).Error; err != nil {
			return err
		}
		balanceAfter = newBalance
		return nil
	})
	return balanceAfter, err
}

func (r *TonTransferRepo) FailWithdrawalAtomic(ctx context.Context, transferID uuid.UUID, errMsg string) (int64, error) {
	var balanceAfter int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var transfer domain.TonTransfer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&transfer, "id = ?", transferID).Error; err != nil {
			return err
		}
		if transfer.Direction != domain.TonDirectionWithdraw || transfer.IsTerminal() {
			return nil
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, "id = ?", transfer.UserID).Error; err != nil {
			return err
		}

		newBalance := user.BettingBalance + transfer.AmountNanoton
		now := time.Now().UTC()
		if err := tx.Model(&user).Update("betting_balance", newBalance).Error; err != nil {
			return err
		}
		ledger := domain.BalanceLedger{
			UserID:        transfer.UserID,
			Type:          domain.LedgerRefund,
			AmountNanoton: transfer.AmountNanoton,
			BalanceAfter:  newBalance,
			ReferenceType: "ton_withdraw_refund",
			ReferenceID:   transfer.ID,
			CreatedAt:     now,
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}

		transfer.Status = domain.TonStatusFailed
		transfer.ErrorMessage = &errMsg
		transfer.UpdatedAt = now
		if err := tx.Save(&transfer).Error; err != nil {
			return err
		}
		balanceAfter = newBalance
		return nil
	})
	return balanceAfter, err
}

func (r *TonTransferRepo) CompleteWithdrawal(ctx context.Context, transferID uuid.UUID, txHash string, txLT int64) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("id = ? AND direction = ?", transferID, domain.TonDirectionWithdraw).
		Updates(map[string]interface{}{
			"status":       domain.TonStatusCompleted,
			"tx_hash":      txHash,
			"tx_lt":        txLT,
			"confirmed_at": now,
			"updated_at":   now,
		}).Error
}

func (r *TonTransferRepo) ApproveWithdrawal(ctx context.Context, transferID, adminID uuid.UUID) error {
	now := time.Now().UTC()
	res := r.db.WithContext(ctx).Model(&domain.TonTransfer{}).
		Where("id = ? AND direction = ? AND status = ?", transferID, domain.TonDirectionWithdraw, domain.TonStatusPendingReview).
		Updates(map[string]interface{}{
			"status":      domain.TonStatusQueued,
			"reviewed_by": adminID,
			"reviewed_at": now,
			"updated_at":  now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrTransferNotFound
	}
	return nil
}

func (r *TonTransferRepo) RejectWithdrawalAtomic(ctx context.Context, transferID, adminID uuid.UUID, reason string) (int64, error) {
	var balanceAfter int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var transfer domain.TonTransfer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&transfer, "id = ?", transferID).Error; err != nil {
			return err
		}
		if transfer.Direction != domain.TonDirectionWithdraw || transfer.Status != domain.TonStatusPendingReview {
			return domain.ErrTransferNotFound
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, "id = ?", transfer.UserID).Error; err != nil {
			return err
		}

		newBalance := user.BettingBalance + transfer.AmountNanoton
		now := time.Now().UTC()
		if err := tx.Model(&user).Update("betting_balance", newBalance).Error; err != nil {
			return err
		}
		ledger := domain.BalanceLedger{
			UserID:        transfer.UserID,
			Type:          domain.LedgerRefund,
			AmountNanoton: transfer.AmountNanoton,
			BalanceAfter:  newBalance,
			ReferenceType: "ton_withdraw_rejected",
			ReferenceID:   transfer.ID,
			CreatedAt:     now,
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}

		transfer.Status = domain.TonStatusRejected
		transfer.ErrorMessage = &reason
		transfer.ReviewedBy = &adminID
		transfer.ReviewedAt = &now
		transfer.UpdatedAt = now
		if err := tx.Save(&transfer).Error; err != nil {
			return err
		}
		balanceAfter = newBalance
		return nil
	})
	return balanceAfter, err
}

func activeWithdrawalStatuses() []domain.TonTransferStatus {
	return []domain.TonTransferStatus{
		domain.TonStatusPendingReview,
		domain.TonStatusApproved,
		domain.TonStatusQueued,
		domain.TonStatusBroadcasting,
		domain.TonStatusPaymentSeen,
	}
}

func (r *TonTransferRepo) getUserBalance(ctx context.Context, userID uuid.UUID) (int64, error) {
	var user domain.User
	if err := r.db.WithContext(ctx).Select("betting_balance").First(&user, "id = ?", userID).Error; err != nil {
		return 0, err
	}
	return user.BettingBalance, nil
}

func (r *TonTransferRepo) hasActiveWithdrawalTx(tx *gorm.DB, userID uuid.UUID) (bool, error) {
	var count int64
	err := tx.Model(&domain.TonTransfer{}).
		Where("user_id = ? AND direction = ? AND status IN ?",
			userID,
			domain.TonDirectionWithdraw,
			activeWithdrawalStatuses(),
		).Count(&count).Error
	return count > 0, err
}

var _ domain.TonTransferRepository = (*TonTransferRepo)(nil)
