package wallet

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Config struct {
	DepositAddress     string
	MinDepositNanoton  int64
	MinWithdrawNanoton int64
	WithdrawFeeNanoton int64
	DepositTTL         time.Duration
	ChainDevMode       bool
}

type WithdrawalRiskEvaluator interface {
	EvaluateWithdrawal(ctx context.Context, userID uuid.UUID, netNanoton int64) (score int, flags []string, reviewReason *string, needsReview bool, err error)
}

type WithdrawalPromoGate interface {
	HasActivePromoRedemption(ctx context.Context, userID uuid.UUID) (bool, error)
}

type AdminWalletNotifier interface {
	NotifyDeposit(ctx context.Context, actor telegram.AdminActor, amountNanoton int64)
	NotifyWithdraw(ctx context.Context, actor telegram.AdminActor, amountNanoton int64)
	NotifyWithdrawFailed(ctx context.Context, actor telegram.AdminActor, transferID string, amountNanoton int64, errMsg string)
}

type Service struct {
	users     domain.UserRepository
	transfers domain.TonTransferRepository
	chain     *ton.Client
	cfg       Config
	risk      WithdrawalRiskEvaluator
	analytics *analyticsuc.Service
	notifier  balance.BalanceNotifier
	promoGate WithdrawalPromoGate
	admin     AdminWalletNotifier
}

func NewService(users domain.UserRepository, transfers domain.TonTransferRepository, chain *ton.Client, cfg Config) *Service {
	return &Service{
		users:     users,
		transfers: transfers,
		chain:     chain,
		cfg:       cfg,
	}
}

func (s *Service) SetRiskEvaluator(r WithdrawalRiskEvaluator) {
	s.risk = r
}

func (s *Service) SetAnalytics(analyticsSvc *analyticsuc.Service) {
	s.analytics = analyticsSvc
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) SetPromoGate(gate WithdrawalPromoGate) {
	s.promoGate = gate
}

func (s *Service) SetAdminNotifier(notifier AdminWalletNotifier) {
	s.admin = notifier
}

type DepositIntentView struct {
	ID            string `json:"id"`
	ToAddress     string `json:"to_address"`
	AmountNanoton int64  `json:"amount_nanoton"`
	Comment       string `json:"comment"`
	ExpiresAt     string `json:"expires_at"`
}

type TransferView struct {
	ID            string   `json:"id"`
	Direction     string   `json:"direction"`
	Status        string   `json:"status"`
	AmountNanoton int64    `json:"amount_nanoton"`
	FeeNanoton    int64    `json:"fee_nanoton"`
	NetNanoton    int64    `json:"net_nanoton"`
	WalletAddress string   `json:"wallet_address"`
	TxHash        *string  `json:"tx_hash,omitempty"`
	ErrorMessage  *string  `json:"error_message,omitempty"`
	RiskScore     int      `json:"risk_score,omitempty"`
	RiskFlags     []string `json:"risk_flags,omitempty"`
	ReviewReason  *string  `json:"review_reason,omitempty"`
	CreatedAt     string   `json:"created_at"`
	ConfirmedAt   *string  `json:"confirmed_at,omitempty"`
}

func (s *Service) CreateDepositIntent(ctx context.Context, userID uuid.UUID, amountNanoton int64) (*DepositIntentView, error) {
	if amountNanoton < s.cfg.MinDepositNanoton {
		return nil, domain.ErrInvalidAmount
	}
	if !s.chain.Enabled() {
		return nil, domain.ErrChainUnavailable
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user.TonWallet == "" {
		return nil, domain.ErrWalletNotLinked
	}

	now := time.Now().UTC()
	expiresAt := now.Add(s.cfg.DepositTTL)
	transferID := uuid.New()
	comment := fmt.Sprintf("flipo:dep:%s", strings.ReplaceAll(transferID.String(), "-", ""))

	transfer := &domain.TonTransfer{
		ID:             transferID,
		UserID:         userID,
		Direction:      domain.TonDirectionDeposit,
		Status:         domain.TonStatusAwaitingPayment,
		AmountNanoton:  amountNanoton,
		WalletAddress:  user.TonWallet,
		DepositComment: &comment,
		ExpiresAt:      &expiresAt,
	}
	if err := s.transfers.Create(ctx, transfer); err != nil {
		return nil, err
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &userID,
		ReferrerID:    user.ReferrerID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "deposit_intent_created",
		EventCategory: "wallet",
		Status:        "success",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"amount_nanoton": amountNanoton,
		},
	})
	if s.admin != nil {
		s.admin.NotifyDeposit(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, amountNanoton)
	}

	return &DepositIntentView{
		ID:            transfer.ID.String(),
		ToAddress:     s.cfg.DepositAddress,
		AmountNanoton: amountNanoton,
		Comment:       comment,
		ExpiresAt:     expiresAt.Format(time.RFC3339),
	}, nil
}

func (s *Service) ConfirmDeposit(ctx context.Context, userID, transferID uuid.UUID, txHash string) (*TransferView, int64, error) {
	transfer, err := s.transfers.FindByIDForUser(ctx, transferID, userID)
	if err != nil {
		return nil, 0, domain.ErrTransferNotFound
	}
	if transfer.Direction != domain.TonDirectionDeposit {
		return nil, 0, domain.ErrTransferNotFound
	}
	if transfer.IsTerminal() {
		bal, _ := s.users.GetBalanceForUpdate(ctx, userID)
		return toView(transfer), bal, nil
	}
	if transfer.ExpiresAt != nil && time.Now().UTC().After(*transfer.ExpiresAt) {
		transfer.Status = domain.TonStatusExpired
		_ = s.transfers.Update(ctx, transfer)
		return nil, 0, domain.ErrTransferExpired
	}

	if txHash != "" {
		ok, err := s.chain.VerifyTxHash(ctx, txHash)
		if err != nil {
			return nil, 0, err
		}
		if !ok && !s.cfg.ChainDevMode {
			return nil, 0, domain.ErrChainUnavailable
		}
		balanceAfter, err := s.transfers.CompleteDepositAtomic(ctx, transferID, txHash, 0)
		if err != nil {
			return nil, 0, err
		}
		updated, _ := s.transfers.FindByID(ctx, transferID)
		s.trackDepositConfirmed(ctx, transfer.UserID, transfer.AmountNanoton, transfer.WalletAddress)
		balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerDeposit)
		return toView(updated), balanceAfter, nil
	}

	if s.cfg.ChainDevMode {
		devHash := fmt.Sprintf("dev:%s", transferID.String())
		balanceAfter, err := s.transfers.CompleteDepositAtomic(ctx, transferID, devHash, 0)
		if err != nil {
			return nil, 0, err
		}
		updated, _ := s.transfers.FindByID(ctx, transferID)
		s.trackDepositConfirmed(ctx, transfer.UserID, transfer.AmountNanoton, transfer.WalletAddress)
		balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerDeposit)
		return toView(updated), balanceAfter, nil
	}

	if transfer.DepositComment == nil {
		return nil, 0, domain.ErrTransferNotFound
	}
	incoming, err := s.findDepositOnChain(ctx, s.cfg.DepositAddress, *transfer.DepositComment, transfer.AmountNanoton)
	if err != nil {
		return nil, 0, err
	}
	if incoming == nil {
		return toView(transfer), 0, nil
	}

	balanceAfter, err := s.transfers.CompleteDepositAtomic(ctx, transferID, incoming.TxHash, incoming.LT)
	if err != nil {
		return nil, 0, err
	}
	updated, _ := s.transfers.FindByID(ctx, transferID)
	s.trackDepositConfirmed(ctx, transfer.UserID, transfer.AmountNanoton, transfer.WalletAddress)
	balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerDeposit)
	return toView(updated), balanceAfter, nil
}

func (s *Service) RequestWithdrawal(ctx context.Context, userID uuid.UUID, receiveNanoton int64, idempotencyKey string) (*TransferView, int64, error) {
	if receiveNanoton < s.cfg.MinWithdrawNanoton {
		return nil, 0, domain.ErrInvalidAmount
	}
	if s.promoGate != nil {
		if active, err := s.promoGate.HasActivePromoRedemption(ctx, userID); err == nil && active {
			return nil, 0, domain.ErrPromoWagerPending
		}
	}
	if !s.chain.CanSend() {
		return nil, 0, domain.ErrChainUnavailable
	}
	if idempotencyKey == "" {
		return nil, 0, domain.ErrInvalidAmount
	}

	debitNanoton := receiveNanoton + s.cfg.WithdrawFeeNanoton
	if debitNanoton <= 0 {
		return nil, 0, domain.ErrInvalidAmount
	}

	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if user.TonWallet == "" {
		return nil, 0, domain.ErrWalletNotLinked
	}
	if user.BettingBalance < debitNanoton {
		return nil, 0, domain.ErrInsufficientFunds
	}

	initialStatus := domain.TonStatusQueued
	riskScore := 0
	var riskFlags []string
	var reviewReason *string
	if s.risk != nil {
		var needsReview bool
		riskScore, riskFlags, reviewReason, needsReview, err = s.risk.EvaluateWithdrawal(ctx, userID, receiveNanoton)
		if err != nil {
			return nil, 0, err
		}
		if needsReview {
			initialStatus = domain.TonStatusPendingReview
		}
	}

	transfer, balanceAfter, err := s.transfers.CreateWithdrawalAtomic(
		ctx,
		userID,
		debitNanoton,
		s.cfg.WithdrawFeeNanoton,
		user.TonWallet,
		idempotencyKey,
		initialStatus,
		riskScore,
		riskFlags,
		reviewReason,
	)
	if err != nil {
		return nil, 0, err
	}
	balance.NotifyUser(ctx, s.users, s.notifier, userID, -debitNanoton, domain.LedgerWithdraw)
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &userID,
		ReferrerID:    user.ReferrerID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "withdraw_requested",
		EventCategory: "wallet",
		Status:        "success",
		ErrorCode:     "",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"amount_nanoton":  receiveNanoton,
			"fee_nanoton":     s.cfg.WithdrawFeeNanoton,
			"risk_score":      riskScore,
			"risk_flags":      riskFlags,
			"review_required": initialStatus == domain.TonStatusPendingReview,
		},
	})
	if s.admin != nil {
		s.admin.NotifyWithdraw(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, receiveNanoton)
	}
	if initialStatus == domain.TonStatusPendingReview {
		s.analytics.Track(ctx, analyticsuc.EventInput{
			UserID:        &userID,
			ReferrerID:    user.ReferrerID,
			TelegramID:    &user.TelegramID,
			Source:        "api",
			EventName:     "withdraw_review_required",
			EventCategory: "wallet",
			Status:        "success",
			StakingTier:   string(user.StakingTier),
			Properties: map[string]any{
				"amount_nanoton": receiveNanoton,
				"risk_score":     riskScore,
				"risk_flags":     riskFlags,
			},
		})
	}
	return toView(transfer), balanceAfter, nil
}

func (s *Service) trackDepositConfirmed(ctx context.Context, userID uuid.UUID, amountNanoton int64, wallet string) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return
	}
	s.analytics.Track(ctx, analyticsuc.EventInput{
		UserID:        &userID,
		ReferrerID:    user.ReferrerID,
		TelegramID:    &user.TelegramID,
		Source:        "api",
		EventName:     "deposit_confirmed",
		EventCategory: "wallet",
		Status:        "success",
		StakingTier:   string(user.StakingTier),
		Properties: map[string]any{
			"amount_nanoton": amountNanoton,
			"wallet_address": wallet,
		},
	})
}

func (s *Service) ListTransfers(ctx context.Context, userID uuid.UUID, limit int) ([]TransferView, error) {
	items, err := s.transfers.ListByUser(ctx, userID, limit)
	if err != nil {
		return nil, err
	}
	out := make([]TransferView, 0, len(items))
	for i := range items {
		out = append(out, *toView(&items[i]))
	}
	return out, nil
}

func (s *Service) GetTransfer(ctx context.Context, userID, transferID uuid.UUID) (*TransferView, error) {
	transfer, err := s.transfers.FindByIDForUser(ctx, transferID, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrTransferNotFound
		}
		return nil, err
	}
	return toView(transfer), nil
}

func (s *Service) ProcessPendingDeposits(ctx context.Context) error {
	items, err := s.transfers.ListByStatus(ctx, []domain.TonTransferStatus{domain.TonStatusAwaitingPayment}, 50)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	for i := range items {
		transfer := items[i]
		if transfer.ExpiresAt != nil && now.After(*transfer.ExpiresAt) {
			transfer.Status = domain.TonStatusExpired
			_ = s.transfers.Update(ctx, &items[i])
			continue
		}
		if transfer.DepositComment == nil {
			continue
		}
		incoming, err := s.findDepositOnChain(ctx, s.cfg.DepositAddress, *transfer.DepositComment, transfer.AmountNanoton)
		if err != nil {
			continue
		}
		if incoming == nil {
			continue
		}
		if transfer.Status != domain.TonStatusAwaitingPayment {
			continue
		}
		if _, err := s.transfers.CompleteDepositAtomic(ctx, transfer.ID, incoming.TxHash, incoming.LT); err != nil {
			continue
		}
		balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerDeposit)
	}
	return nil
}

func (s *Service) findDepositOnChain(ctx context.Context, depositAddress, comment string, minAmount int64) (*ton.IncomingTransfer, error) {
	delays := []time.Duration{0, 2 * time.Second, 5 * time.Second, 10 * time.Second}
	var lastErr error
	for _, delay := range delays {
		if delay > 0 {
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			case <-timer.C:
			}
		}
		incoming, err := s.chain.FindDepositByComment(ctx, depositAddress, comment, minAmount)
		if err != nil {
			lastErr = err
			continue
		}
		if incoming != nil {
			return incoming, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, nil
}

func (s *Service) ProcessPendingWithdrawals(ctx context.Context) error {
	items, err := s.transfers.ListByStatus(ctx, []domain.TonTransferStatus{domain.TonStatusQueued}, 20)
	if err != nil {
		return err
	}
	for i := range items {
		transfer := &items[i]

		claimed, err := s.transfers.ClaimWithdrawalBroadcast(ctx, transfer.ID)
		if err != nil {
			slog.ErrorContext(ctx, "withdrawal claim failed",
				"transfer_id", transfer.ID,
				"user_id", transfer.UserID,
				"error", err,
			)
			continue
		}
		if !claimed {
			continue
		}
		transfer.Status = domain.TonStatusBroadcasting

		txHash, lt, err := s.chain.SendTON(ctx, transfer.WalletAddress, transfer.NetAmountNanoton(), "")
		if err != nil {
			s.failWithdrawal(ctx, transfer, err)
			continue
		}
		if err := s.transfers.CompleteWithdrawal(ctx, transfer.ID, txHash, lt); err != nil {
			slog.ErrorContext(ctx, "withdrawal sent but complete failed",
				"transfer_id", transfer.ID,
				"user_id", transfer.UserID,
				"tx_hash", txHash,
				"error", err,
			)
			if s.admin != nil {
				s.admin.NotifyWithdrawFailed(ctx, s.actorForUser(ctx, transfer.UserID), transfer.ID.String(), transfer.NetAmountNanoton(),
					fmt.Sprintf("on-chain sent but DB complete failed: %v (tx=%s)", err, txHash))
			}
		}
	}
	return nil
}

func (s *Service) failWithdrawal(ctx context.Context, transfer *domain.TonTransfer, sendErr error) {
	errMsg := sendErr.Error()
	slog.ErrorContext(ctx, "withdrawal send failed, refunding user",
		"transfer_id", transfer.ID,
		"user_id", transfer.UserID,
		"amount_nanoton", transfer.AmountNanoton,
		"net_nanoton", transfer.NetAmountNanoton(),
		"error", errMsg,
	)

	balanceAfter, failErr := s.transfers.FailWithdrawalAtomic(ctx, transfer.ID, errMsg)
	if failErr != nil {
		slog.ErrorContext(ctx, "withdrawal refund failed",
			"transfer_id", transfer.ID,
			"user_id", transfer.UserID,
			"error", failErr,
		)
		if s.admin != nil {
			s.admin.NotifyWithdrawFailed(ctx, s.actorForUser(ctx, transfer.UserID), transfer.ID.String(), transfer.NetAmountNanoton(),
				fmt.Sprintf("send failed (%s) AND refund failed: %v", errMsg, failErr))
		}
		return
	}

	slog.InfoContext(ctx, "withdrawal refunded",
		"transfer_id", transfer.ID,
		"user_id", transfer.UserID,
		"balance_after", balanceAfter,
	)
	balance.NotifyUser(ctx, s.users, s.notifier, transfer.UserID, transfer.AmountNanoton, domain.LedgerRefund)

	user, _ := s.users.FindByID(ctx, transfer.UserID)
	actor := telegram.AdminActor{}
	if user != nil {
		actor = telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}
	}
	if s.admin != nil {
		s.admin.NotifyWithdrawFailed(ctx, actor, transfer.ID.String(), transfer.NetAmountNanoton(), errMsg)
	}
	if s.analytics != nil {
		var telegramID *int64
		var referrerID *uuid.UUID
		stakingTier := ""
		if user != nil {
			telegramID = &user.TelegramID
			referrerID = user.ReferrerID
			stakingTier = string(user.StakingTier)
		}
		userID := transfer.UserID
		s.analytics.Track(ctx, analyticsuc.EventInput{
			UserID:        &userID,
			ReferrerID:    referrerID,
			TelegramID:    telegramID,
			Source:        "worker",
			EventName:     "withdraw_failed",
			EventCategory: "wallet",
			Status:        "error",
			ErrorCode:     "withdraw_send_failed",
			ErrorMessage:  errMsg,
			StakingTier:   stakingTier,
			Properties: map[string]any{
				"transfer_id":    transfer.ID.String(),
				"amount_nanoton": transfer.NetAmountNanoton(),
				"fee_nanoton":    transfer.FeeNanoton,
				"refunded":       true,
			},
		})
	}
}

func (s *Service) actorForUser(ctx context.Context, userID uuid.UUID) telegram.AdminActor {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user == nil {
		return telegram.AdminActor{}
	}
	return telegram.AdminActor{
		TelegramID: user.TelegramID,
		Username:   user.Username,
		FirstName:  user.FirstName,
		LastName:   user.LastName,
	}
}

func toView(transfer *domain.TonTransfer) *TransferView {
	if transfer == nil {
		return nil
	}
	var confirmedAt *string
	if transfer.ConfirmedAt != nil {
		v := transfer.ConfirmedAt.Format(time.RFC3339)
		confirmedAt = &v
	}
	return &TransferView{
		ID:            transfer.ID.String(),
		Direction:     string(transfer.Direction),
		Status:        string(transfer.Status),
		AmountNanoton: transfer.AmountNanoton,
		FeeNanoton:    transfer.FeeNanoton,
		NetNanoton:    transfer.NetAmountNanoton(),
		WalletAddress: transfer.WalletAddress,
		TxHash:        transfer.TxHash,
		ErrorMessage:  transfer.ErrorMessage,
		RiskScore:     transfer.RiskScore,
		RiskFlags:     transfer.RiskFlagList(),
		ReviewReason:  transfer.ReviewReason,
		CreatedAt:     transfer.CreatedAt.Format(time.RFC3339),
		ConfirmedAt:   confirmedAt,
	}
}
