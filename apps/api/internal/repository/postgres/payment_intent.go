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

type PaymentIntentRepo struct {
	db *gorm.DB
}

func NewPaymentIntentRepo(db *gorm.DB) *PaymentIntentRepo {
	return &PaymentIntentRepo{db: db}
}

func (r *PaymentIntentRepo) Create(ctx context.Context, intent *domain.PaymentIntent) error {
	now := time.Now().UTC()
	if intent.CreatedAt.IsZero() {
		intent.CreatedAt = now
	}
	intent.UpdatedAt = now
	return r.db.WithContext(ctx).Create(intent).Error
}

func (r *PaymentIntentRepo) Update(ctx context.Context, intent *domain.PaymentIntent) error {
	intent.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Save(intent).Error
}

func (r *PaymentIntentRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.PaymentIntent, error) {
	var row domain.PaymentIntent
	err := r.db.WithContext(ctx).First(&row, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &row, err
}

func (r *PaymentIntentRepo) FindByIDForUser(ctx context.Context, id, userID uuid.UUID) (*domain.PaymentIntent, error) {
	var row domain.PaymentIntent
	err := r.db.WithContext(ctx).First(&row, "id = ? AND user_id = ?", id, userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &row, err
}

func (r *PaymentIntentRepo) FindByPayload(ctx context.Context, payload string) (*domain.PaymentIntent, error) {
	var row domain.PaymentIntent
	err := r.db.WithContext(ctx).First(&row, "payload = ?", payload).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &row, err
}

func (r *PaymentIntentRepo) FindByProviderInvoiceID(ctx context.Context, provider, invoiceID string) (*domain.PaymentIntent, error) {
	var row domain.PaymentIntent
	err := r.db.WithContext(ctx).First(&row, "provider = ? AND provider_invoice_id = ?", provider, invoiceID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	return &row, err
}

// CompleteAtomic marks intent paid and credits balance once.
func (r *PaymentIntentRepo) CompleteAtomic(ctx context.Context, intentID uuid.UUID) (balanceAfter int64, credited bool, err error) {
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var intent domain.PaymentIntent
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&intent, "id = ?", intentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.ErrNotFound
			}
			return err
		}
		if intent.Status == domain.PaymentStatusPaid {
			var user domain.User
			if err := tx.Select("betting_balance").First(&user, "id = ?", intent.UserID).Error; err != nil {
				return err
			}
			balanceAfter = user.BettingBalance
			credited = false
			return nil
		}
		if intent.Status != domain.PaymentStatusAwaiting {
			return fmt.Errorf("payment not confirmable: %s", intent.Status)
		}
		if intent.AmountNanoton <= 0 {
			return domain.ErrInvalidAmount
		}

		var user domain.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", intent.UserID).Error; err != nil {
			return err
		}
		balanceAfter = user.BettingBalance + intent.AmountNanoton
		if err := tx.Model(&user).Update("betting_balance", balanceAfter).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		ledger := domain.BalanceLedger{
			ID:            uuid.New(),
			UserID:        intent.UserID,
			Type:          domain.LedgerDeposit,
			AmountNanoton: intent.AmountNanoton,
			BalanceAfter:  balanceAfter,
			ReferenceType: "payment_" + intent.Provider,
			ReferenceID:   intent.ID,
			CreatedAt:     now,
		}
		if err := tx.Create(&ledger).Error; err != nil {
			return err
		}
		intent.Status = domain.PaymentStatusPaid
		intent.PaidAt = &now
		intent.UpdatedAt = now
		if err := tx.Save(&intent).Error; err != nil {
			return err
		}
		credited = true
		return nil
	})
	return balanceAfter, credited, err
}
