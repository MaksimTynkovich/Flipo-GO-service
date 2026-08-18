package wallet

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/ton"
	"github.com/google/uuid"
)

type tonTransferRepoStub struct {
	pending                []domain.TonTransfer
	listPendingCalled      bool
	completeCalls          int
	completedTransferID    uuid.UUID
	completedTxHash        string
	completedTxLT          int64
	updatedTransferIDs     []uuid.UUID
	updatedStatuses        []domain.TonTransferStatus
	listByStatusShouldFail bool
	sumWithdrawalsSince    int64
	createStatus           domain.TonTransferStatus
	createReviewReason     *string
	createRiskFlags        []string
}

func (s *tonTransferRepoStub) FindByID(context.Context, uuid.UUID) (*domain.TonTransfer, error) {
	return nil, domain.ErrNotFound
}
func (s *tonTransferRepoStub) FindByIDForUser(context.Context, uuid.UUID, uuid.UUID) (*domain.TonTransfer, error) {
	return nil, domain.ErrNotFound
}
func (s *tonTransferRepoStub) FindByIdempotencyKey(context.Context, string) (*domain.TonTransfer, error) {
	return nil, nil
}
func (s *tonTransferRepoStub) FindByDepositComment(context.Context, string) (*domain.TonTransfer, error) {
	return nil, nil
}
func (s *tonTransferRepoStub) FindByTxHash(context.Context, string) (*domain.TonTransfer, error) {
	return nil, nil
}
func (s *tonTransferRepoStub) ListByUser(context.Context, uuid.UUID, int) ([]domain.TonTransfer, error) {
	return nil, nil
}
func (s *tonTransferRepoStub) ListByStatus(context.Context, []domain.TonTransferStatus, int) ([]domain.TonTransfer, error) {
	if s.listByStatusShouldFail {
		return nil, errors.New("ListByStatus should not be used for pending deposits")
	}
	return nil, nil
}
func (s *tonTransferRepoStub) ListPendingDeposits(_ context.Context, _ time.Time, _ int) ([]domain.TonTransfer, error) {
	s.listPendingCalled = true
	out := make([]domain.TonTransfer, len(s.pending))
	copy(out, s.pending)
	return out, nil
}
func (s *tonTransferRepoStub) HasActiveWithdrawal(context.Context, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *tonTransferRepoStub) SumSuccessfulWithdrawalsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return s.sumWithdrawalsSince, nil
}
func (s *tonTransferRepoStub) Create(context.Context, *domain.TonTransfer) error { return nil }
func (s *tonTransferRepoStub) Update(_ context.Context, transfer *domain.TonTransfer) error {
	s.updatedTransferIDs = append(s.updatedTransferIDs, transfer.ID)
	s.updatedStatuses = append(s.updatedStatuses, transfer.Status)
	return nil
}
func (s *tonTransferRepoStub) CreateWithdrawalAtomic(_ context.Context, userID uuid.UUID, amountNanoton, feeNanoton int64, walletAddress, _ string, initialStatus domain.TonTransferStatus, _ int, riskFlags []string, reviewReason *string) (*domain.TonTransfer, int64, error) {
	s.createStatus = initialStatus
	s.createRiskFlags = append([]string{}, riskFlags...)
	s.createReviewReason = reviewReason
	return &domain.TonTransfer{
		ID:            uuid.New(),
		UserID:        userID,
		Direction:     domain.TonDirectionWithdraw,
		Status:        initialStatus,
		AmountNanoton: amountNanoton,
		FeeNanoton:    feeNanoton,
		WalletAddress: walletAddress,
		ReviewReason:  reviewReason,
		RiskFlags:     append([]string{}, riskFlags...),
	}, 0, nil
}
func (s *tonTransferRepoStub) CompleteDepositAtomic(_ context.Context, transferID uuid.UUID, txHash string, txLT int64) (int64, bool, error) {
	s.completeCalls++
	s.completedTransferID = transferID
	s.completedTxHash = txHash
	s.completedTxLT = txLT
	return 0, true, nil
}
func (s *tonTransferRepoStub) ClaimWithdrawalBroadcast(context.Context, uuid.UUID) (bool, error) {
	return false, errors.New("not implemented")
}
func (s *tonTransferRepoStub) FailWithdrawalAtomic(context.Context, uuid.UUID, string) (int64, error) {
	return 0, errors.New("not implemented")
}
func (s *tonTransferRepoStub) CompleteWithdrawal(context.Context, uuid.UUID, string, int64) error {
	return errors.New("not implemented")
}
func (s *tonTransferRepoStub) ListAll(context.Context, int) ([]domain.TonTransfer, error) {
	return nil, nil
}
func (s *tonTransferRepoStub) ApproveWithdrawal(context.Context, uuid.UUID, uuid.UUID) error {
	return errors.New("not implemented")
}
func (s *tonTransferRepoStub) RejectWithdrawalAtomic(context.Context, uuid.UUID, uuid.UUID, string) (int64, error) {
	return 0, errors.New("not implemented")
}

type walletUserRepoStub struct {
	user *domain.User
}

type walletPlatformRepoStub struct {
	withdrawal *domain.PlatformWithdrawalSettings
}

func (s *walletUserRepoStub) FindByID(context.Context, uuid.UUID) (*domain.User, error) {
	if s.user == nil {
		return nil, domain.ErrNotFound
	}
	u := *s.user
	return &u, nil
}
func (s *walletUserRepoStub) FindByTelegramID(context.Context, int64) (*domain.User, error) {
	return nil, domain.ErrNotFound
}
func (s *walletUserRepoStub) Upsert(context.Context, *domain.User) error { return nil }
func (s *walletUserRepoStub) EnsureSocialBotUser(context.Context, uuid.UUID, int64, string, string, string) (*domain.User, error) {
	return nil, errors.New("not implemented")
}
func (s *walletUserRepoStub) UpdateWallet(context.Context, uuid.UUID, string) error { return nil }
func (s *walletUserRepoStub) UpdateLocale(context.Context, uuid.UUID, string) error { return nil }
func (s *walletUserRepoStub) UpdateBanned(context.Context, uuid.UUID, bool) error   { return nil }
func (s *walletUserRepoStub) UpdateWithdrawalsDisabled(context.Context, uuid.UUID, bool) error {
	return nil
}
func (s *walletUserRepoStub) UpdateBalance(context.Context, uuid.UUID, int64, domain.LedgerType, string, uuid.UUID) (int64, int64, error) {
	return 0, 0, errors.New("not implemented")
}
func (s *walletUserRepoStub) RestoreAdminCredit(context.Context, uuid.UUID, int64) error { return nil }
func (s *walletUserRepoStub) GetBalanceForUpdate(context.Context, uuid.UUID) (int64, error) {
	if s.user == nil {
		return 0, domain.ErrNotFound
	}
	return s.user.BettingBalance, nil
}
func (s *walletUserRepoStub) UpdateStakingTier(context.Context, uuid.UUID, domain.StakingTier) error {
	return nil
}
func (s *walletUserRepoStub) ListIDsByStakingTier(context.Context, domain.StakingTier) ([]uuid.UUID, error) {
	return nil, nil
}
func (s *walletUserRepoStub) SetReferrerIfEmpty(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *walletUserRepoStub) SetCampaignIfEmpty(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *walletUserRepoStub) SetAcquisitionPayloadIfEmpty(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (s *walletUserRepoStub) CountReferrals(context.Context, uuid.UUID) (int64, error) { return 0, nil }
func (s *walletUserRepoStub) CountReferralsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *walletUserRepoStub) SumReferralEarnings(context.Context, uuid.UUID) (int64, error) {
	return 0, nil
}
func (s *walletUserRepoStub) SumReferralEarningsByRefType(context.Context, uuid.UUID, string) (int64, error) {
	return 0, nil
}
func (s *walletUserRepoStub) SumReferralEarningsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *walletUserRepoStub) ListReferrals(context.Context, uuid.UUID) ([]domain.User, error) {
	return nil, nil
}
func (s *walletUserRepoStub) ListReferredUsers(context.Context) ([]domain.User, error) {
	return nil, nil
}
func (s *walletUserRepoStub) ListTelegramIDs(context.Context, int, int) ([]int64, error) {
	return nil, nil
}
func (s *walletUserRepoStub) ListTelegramRecipients(context.Context, int, int) ([]domain.TelegramRecipient, error) {
	return nil, nil
}
func (s *walletUserRepoStub) CountUsers(context.Context) (int64, error) { return 0, nil }

func (s *walletPlatformRepoStub) GetGameConfig(context.Context, domain.GameType) (*domain.GameConfig, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListGameConfigs(context.Context) ([]domain.GameConfig, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpsertGameConfig(context.Context, *domain.GameConfig) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetRiskSettings(context.Context) (*domain.PlatformRiskSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateRiskSettings(context.Context, *domain.PlatformRiskSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ApplyRouletteBankDelta(context.Context, int64) (*domain.PlatformRiskSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ApplyCrashBankDelta(context.Context, int64) (*domain.PlatformRiskSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetActiveSeed(context.Context, domain.GameType) (*domain.ProvablyFairSeedSession, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) CreateSeedSession(context.Context, *domain.ProvablyFairSeedSession) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) DeactivateSeeds(context.Context, domain.GameType) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListSeedHistory(context.Context, domain.GameType, int) ([]domain.ProvablyFairSeedSession, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListPromoCodes(context.Context) ([]domain.PromoCode, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpsertPromoCode(context.Context, *domain.PromoCode) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) DeletePromoCode(context.Context, string) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetBotSettings(context.Context) (*domain.TelegramBotSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateBotSettings(context.Context, *domain.TelegramBotSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetMaintenanceSettings(context.Context) (*domain.PlatformMaintenanceSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateMaintenanceSettings(context.Context, *domain.PlatformMaintenanceSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetWithdrawalSettings(context.Context) (*domain.PlatformWithdrawalSettings, error) {
	return s.withdrawal, nil
}
func (s *walletPlatformRepoStub) UpdateWithdrawalSettings(context.Context, *domain.PlatformWithdrawalSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetDepositSettings(context.Context) (*domain.PlatformDepositSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateDepositSettings(context.Context, *domain.PlatformDepositSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetYieldSettings(context.Context) (*domain.PlatformYieldSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateYieldSettings(context.Context, *domain.PlatformYieldSettings) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetPromoCode(context.Context, string) (*domain.PromoCode, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) HasRedeemedPromoCode(context.Context, uuid.UUID, string) (bool, error) {
	return false, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) CreateRedemption(context.Context, *domain.PromoRedemption) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) DeleteRedemption(context.Context, uuid.UUID) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) IncrementPromoUsed(context.Context, string) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ClaimPromoRedemption(context.Context, uuid.UUID, string, int64) (*domain.PromoRedemption, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ReleasePromoRedemption(context.Context, uuid.UUID, string) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) CreateBroadcast(context.Context, *domain.TelegramBroadcast) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) GetBroadcast(context.Context, uuid.UUID) (*domain.TelegramBroadcast, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpdateBroadcast(context.Context, *domain.TelegramBroadcast) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListBroadcasts(context.Context, int) ([]domain.TelegramBroadcast, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListQueuedBroadcasts(context.Context, int) ([]domain.TelegramBroadcast, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) UpsertBroadcastDelivery(context.Context, *domain.TelegramBroadcastDelivery) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListBroadcastDeliveries(context.Context, uuid.UUID, string, int, int) ([]domain.TelegramBroadcastDelivery, int64, error) {
	return nil, 0, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) CreateSweep(context.Context, *domain.TreasurySweep) error {
	return errors.New("not implemented")
}
func (s *walletPlatformRepoStub) ListSweeps(context.Context, int) ([]domain.TreasurySweep, error) {
	return nil, errors.New("not implemented")
}
func (s *walletPlatformRepoStub) EnsureDefaults(context.Context) error { return nil }

var (
	_ domain.TonTransferRepository = (*tonTransferRepoStub)(nil)
	_ domain.UserRepository        = (*walletUserRepoStub)(nil)
	_ domain.PlatformRepository    = (*walletPlatformRepoStub)(nil)
)

func TestProcessPendingDepositsUsesDedicatedPendingQuery(t *testing.T) {
	now := time.Now().UTC()
	expiredAt := now.Add(-time.Minute)
	comment := "flipo:dep:recent"
	activeID := uuid.New()

	repo := &tonTransferRepoStub{
		listByStatusShouldFail: true,
		pending: []domain.TonTransfer{
			{
				ID:        uuid.New(),
				UserID:    uuid.New(),
				Direction: domain.TonDirectionDeposit,
				Status:    domain.TonStatusAwaitingPayment,
				ExpiresAt: &expiredAt,
			},
			{
				ID:             activeID,
				UserID:         uuid.New(),
				Direction:      domain.TonDirectionDeposit,
				Status:         domain.TonStatusAwaitingPayment,
				AmountNanoton:  2_000_000_000,
				DepositComment: &comment,
			},
		},
	}
	users := &walletUserRepoStub{
		user: &domain.User{ID: repo.pending[1].UserID, TelegramID: 395183166},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"result":[{"transaction_id":{"hash":"chain-hash","lt":"123456"},"in_msg":{"source":"wallet","value":"2000000000","message":"flipo:dep:recent","msg_data":{"text":"","body":""}}}]}`))
	}))
	defer server.Close()

	svc := NewService(
		users,
		repo,
		ton.NewClient(server.URL, "", "deposit-wallet", false, "", "", ""),
		Config{DepositAddress: "deposit-wallet"},
	)

	if err := svc.ProcessPendingDeposits(context.Background()); err != nil {
		t.Fatalf("ProcessPendingDeposits: %v", err)
	}
	if !repo.listPendingCalled {
		t.Fatal("expected ListPendingDeposits to be used")
	}
	if len(repo.updatedTransferIDs) != 1 || repo.updatedTransferIDs[0] != repo.pending[0].ID {
		t.Fatalf("expired deposit should be marked updated once, got %+v", repo.updatedTransferIDs)
	}
	if len(repo.updatedStatuses) != 1 || repo.updatedStatuses[0] != domain.TonStatusExpired {
		t.Fatalf("expired deposit status=%v, want %s", repo.updatedStatuses, domain.TonStatusExpired)
	}
	if repo.completeCalls != 1 {
		t.Fatalf("expected one completed deposit, got %d", repo.completeCalls)
	}
	if repo.completedTransferID != activeID {
		t.Fatalf("completed transfer %s, want %s", repo.completedTransferID, activeID)
	}
	if repo.completedTxHash != "chain-hash" || repo.completedTxLT != 123456 {
		t.Fatalf("unexpected chain confirmation %q / %d", repo.completedTxHash, repo.completedTxLT)
	}
}

func TestRequestWithdrawalDailyLimitTriggersReview(t *testing.T) {
	userID := uuid.New()
	repo := &tonTransferRepoStub{sumWithdrawalsSince: 1_500_000_000}
	users := &walletUserRepoStub{
		user: &domain.User{
			ID:             userID,
			TelegramID:     1,
			TonWallet:      "wallet",
			BettingBalance: 10_000_000_000,
		},
	}
	svc := NewService(users, repo, ton.NewClient("", "", "", true, "", "", ""), Config{
		MinWithdrawNanoton: 100_000_000,
		WithdrawFeeNanoton: 10_000_000,
	})
	svc.SetPlatform(&walletPlatformRepoStub{
		withdrawal: &domain.PlatformWithdrawalSettings{
			AutoWithdrawDailyLimitNanoton: 2_000_000_000,
		},
	})

	transfer, _, err := svc.RequestWithdrawal(context.Background(), userID, 700_000_000, "idem-1")
	if err != nil {
		t.Fatalf("RequestWithdrawal: %v", err)
	}
	if transfer.Status != string(domain.TonStatusPendingReview) {
		t.Fatalf("status=%s want %s", transfer.Status, domain.TonStatusPendingReview)
	}
	if repo.createReviewReason == nil || *repo.createReviewReason == "" {
		t.Fatal("expected review reason for daily limit")
	}
	found := false
	for _, flag := range repo.createRiskFlags {
		if flag == "daily_auto_withdraw_limit_exceeded" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected daily limit flag, got %v", repo.createRiskFlags)
	}
}

func TestRequestWithdrawalDailyLimitAllowsWithinThreshold(t *testing.T) {
	userID := uuid.New()
	repo := &tonTransferRepoStub{sumWithdrawalsSince: 1_000_000_000}
	users := &walletUserRepoStub{
		user: &domain.User{
			ID:             userID,
			TelegramID:     1,
			TonWallet:      "wallet",
			BettingBalance: 10_000_000_000,
		},
	}
	svc := NewService(users, repo, ton.NewClient("", "", "", true, "", "", ""), Config{
		MinWithdrawNanoton: 100_000_000,
		WithdrawFeeNanoton: 10_000_000,
	})
	svc.SetPlatform(&walletPlatformRepoStub{
		withdrawal: &domain.PlatformWithdrawalSettings{
			AutoWithdrawDailyLimitNanoton: 2_000_000_000,
		},
	})

	transfer, _, err := svc.RequestWithdrawal(context.Background(), userID, 500_000_000, "idem-2")
	if err != nil {
		t.Fatalf("RequestWithdrawal: %v", err)
	}
	if transfer.Status != string(domain.TonStatusQueued) {
		t.Fatalf("status=%s want %s", transfer.Status, domain.TonStatusQueued)
	}
}
