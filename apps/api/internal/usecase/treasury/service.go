package treasury

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	"github.com/google/uuid"
)

type Service struct {
	platform domain.PlatformRepository
	chain    *ton.Client
}

func NewService(platform domain.PlatformRepository, chain *ton.Client) *Service {
	return &Service{platform: platform, chain: chain}
}

type WalletStatus struct {
	HotWalletAddress        string `json:"hot_wallet_address"`
	ColdWalletAddress       string `json:"cold_wallet_address"`
	HotBalanceNanoton       int64  `json:"hot_balance_nanoton"`
	HotWalletMaxNanoton     int64  `json:"hot_wallet_max_nanoton"`
	SweepThresholdNanoton   int64  `json:"sweep_threshold_nanoton"`
	PendingLiabilityNanoton int64  `json:"pending_liability_nanoton"`
	RequiresSweep           bool   `json:"requires_sweep"`
}

func (s *Service) Status(ctx context.Context, hotAddress string, pendingLiability int64) (*WalletStatus, error) {
	settings, err := s.platform.GetRiskSettings(ctx)
	if err != nil {
		return nil, err
	}

	var hotBalance int64
	if s.chain != nil && s.chain.CanSend() {
		hotBalance, _ = s.chain.GetWalletBalance(ctx)
	}

	return &WalletStatus{
		HotWalletAddress:        hotAddress,
		ColdWalletAddress:       settings.ColdWalletAddress,
		HotBalanceNanoton:       hotBalance,
		HotWalletMaxNanoton:     settings.HotWalletMaxBalanceNanoton,
		SweepThresholdNanoton:   settings.HotWalletSweepThreshold,
		PendingLiabilityNanoton: pendingLiability,
		RequiresSweep:           hotBalance > settings.HotWalletMaxBalanceNanoton &&
			hotBalance-settings.HotWalletMaxBalanceNanoton >= settings.HotWalletSweepThreshold,
	}, nil
}

func (s *Service) SweepIfNeeded(ctx context.Context) error {
	if s.chain == nil || !s.chain.CanSend() {
		return nil
	}

	settings, err := s.platform.GetRiskSettings(ctx)
	if err != nil {
		return err
	}
	if settings.ColdWalletAddress == "" {
		return nil
	}

	hotBalance, err := s.chain.GetWalletBalance(ctx)
	if err != nil {
		return err
	}
	if hotBalance <= settings.HotWalletMaxBalanceNanoton {
		return nil
	}

	sweepAmount := hotBalance - settings.HotWalletMaxBalanceNanoton
	if sweepAmount < settings.HotWalletSweepThreshold {
		return nil
	}

	sweepID := uuid.New()
	comment := fmt.Sprintf("flipo:sweep:%s", sweepID.String())
	txHash, _, err := s.chain.SendTON(ctx, settings.ColdWalletAddress, sweepAmount, comment)
	record := &domain.TreasurySweep{
		ID:                sweepID,
		AmountNanoton:     sweepAmount,
		ColdWalletAddress: settings.ColdWalletAddress,
		HotBalanceBefore:  hotBalance,
		Status:            "completed",
	}
	if err != nil {
		msg := err.Error()
		record.Status = "failed"
		record.ErrorMessage = &msg
		_ = s.platform.CreateSweep(ctx, record)
		return err
	}
	record.TxHash = &txHash
	if err := s.platform.CreateSweep(ctx, record); err != nil {
		return err
	}
	slog.Info("treasury sweep completed",
		"amount", sweepAmount,
		"cold", settings.ColdWalletAddress,
		"tx", txHash,
	)
	return nil
}

func (s *Service) ListSweeps(ctx context.Context) ([]domain.TreasurySweep, error) {
	return s.platform.ListSweeps(ctx, 20)
}
