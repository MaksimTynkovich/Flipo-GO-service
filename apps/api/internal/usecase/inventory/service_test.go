package inventory

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
)

type inventoryRepoStub struct {
	item        *domain.InventoryItem
	boundGiftID string
	boundMeta   []byte
}

func (s *inventoryRepoStub) ListByUser(context.Context, uuid.UUID, *domain.InventoryStatus) ([]domain.InventoryItem, error) {
	return nil, nil
}
func (s *inventoryRepoStub) ListByStatus(context.Context, domain.InventoryStatus, int) ([]domain.InventoryItem, error) {
	return nil, nil
}
func (s *inventoryRepoStub) FindByID(context.Context, uuid.UUID) (*domain.InventoryItem, error) {
	if s.item == nil {
		return nil, domain.ErrNotFound
	}
	item := *s.item
	return &item, nil
}
func (s *inventoryRepoStub) FindByTelegramGiftID(context.Context, uuid.UUID, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) FindByGiftSlug(context.Context, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) FindActiveByGiftSlug(context.Context, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) FindByTelegramTxRef(context.Context, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) Create(context.Context, *domain.InventoryItem) error { return nil }
func (s *inventoryRepoStub) CreateGiftWithdrawal(context.Context, *domain.GiftWithdrawal) error {
	return nil
}
func (s *inventoryRepoStub) PromoteProfileToDeposit(context.Context, uuid.UUID, uuid.UUID, string, int64, []byte, string, string) error {
	return nil
}
func (s *inventoryRepoStub) UpdateStatus(_ context.Context, id uuid.UUID, from, to domain.InventoryStatus) error {
	if s.item != nil && s.item.ID == id && s.item.Status == from {
		s.item.Status = to
	}
	return nil
}
func (s *inventoryRepoStub) UpdateFloorPriceNanoton(context.Context, uuid.UUID, int64) error {
	return nil
}
func (s *inventoryRepoStub) LockForBet(context.Context, uuid.UUID, uuid.UUID) error      { return nil }
func (s *inventoryRepoStub) ReleaseFromBet(context.Context, uuid.UUID) error             { return nil }
func (s *inventoryRepoStub) TransferFromBet(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (s *inventoryRepoStub) TransferOwnership(context.Context, uuid.UUID, uuid.UUID, domain.InventoryStatus) error {
	return nil
}
func (s *inventoryRepoStub) TakeHouseGiftForCollection(context.Context, uuid.UUID, uuid.UUID, string, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) TakeHouseGiftForModel(context.Context, uuid.UUID, uuid.UUID, string, string, string) (*domain.InventoryItem, error) {
	return nil, domain.ErrNotFound
}
func (s *inventoryRepoStub) HasHouseGift(context.Context, uuid.UUID, string, string, string) (bool, error) {
	return false, nil
}
func (s *inventoryRepoStub) BindTelegramGift(_ context.Context, _ uuid.UUID, telegramGiftID, _ string, metadata []byte, _, _ string) error {
	s.boundGiftID = telegramGiftID
	s.boundMeta = append([]byte(nil), metadata...)
	if s.item != nil {
		s.item.TelegramGiftID = telegramGiftID
		s.item.Metadata = append([]byte(nil), metadata...)
	}
	return nil
}
func (s *inventoryRepoStub) GetFloorPrice(context.Context, string) (int64, error) { return 0, nil }
func (s *inventoryRepoStub) SetFloorPrice(context.Context, string, int64) error   { return nil }

type userRepoStub struct {
	user *domain.User
}

func (s *userRepoStub) FindByID(context.Context, uuid.UUID) (*domain.User, error) {
	if s.user == nil {
		return nil, domain.ErrNotFound
	}
	user := *s.user
	return &user, nil
}
func (s *userRepoStub) FindByTelegramID(context.Context, int64) (*domain.User, error) {
	return nil, domain.ErrNotFound
}
func (s *userRepoStub) Upsert(context.Context, *domain.User) error { return nil }
func (s *userRepoStub) EnsureSocialBotUser(context.Context, uuid.UUID, int64, string, string, string) (*domain.User, error) {
	return nil, errors.New("not implemented")
}
func (s *userRepoStub) UpdateWallet(context.Context, uuid.UUID, string) error            { return nil }
func (s *userRepoStub) UpdateLocale(context.Context, uuid.UUID, string) error            { return nil }
func (s *userRepoStub) UpdateBanned(context.Context, uuid.UUID, bool) error              { return nil }
func (s *userRepoStub) UpdateWithdrawalsDisabled(context.Context, uuid.UUID, bool) error { return nil }
func (s *userRepoStub) UpdateBalance(context.Context, uuid.UUID, int64, domain.LedgerType, string, uuid.UUID) (int64, int64, error) {
	return 0, 0, nil
}
func (s *userRepoStub) RestoreAdminCredit(context.Context, uuid.UUID, int64) error {
	return nil
}
func (s *userRepoStub) GetBalanceForUpdate(context.Context, uuid.UUID) (int64, error) { return 0, nil }
func (s *userRepoStub) UpdateStakingTier(context.Context, uuid.UUID, domain.StakingTier) error {
	return nil
}
func (s *userRepoStub) ListIDsByStakingTier(context.Context, domain.StakingTier) ([]uuid.UUID, error) {
	return nil, nil
}
func (s *userRepoStub) SetReferrerIfEmpty(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *userRepoStub) SetCampaignIfEmpty(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *userRepoStub) SetAcquisitionPayloadIfEmpty(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (s *userRepoStub) CountReferrals(context.Context, uuid.UUID) (int64, error) { return 0, nil }
func (s *userRepoStub) CountReferralsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *userRepoStub) SumReferralEarnings(context.Context, uuid.UUID) (int64, error) { return 0, nil }
func (s *userRepoStub) SumReferralEarningsByRefType(context.Context, uuid.UUID, string) (int64, error) {
	return 0, nil
}
func (s *userRepoStub) SumReferralEarningsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *userRepoStub) ListReferrals(context.Context, uuid.UUID) ([]domain.User, error) {
	return nil, nil
}
func (s *userRepoStub) ListReferredUsers(context.Context) ([]domain.User, error)   { return nil, nil }
func (s *userRepoStub) ListTelegramIDs(context.Context, int, int) ([]int64, error) { return nil, nil }
func (s *userRepoStub) CountUsers(context.Context) (int64, error)                  { return 0, nil }

type liquidationBrokerStub struct {
	payout int64
	calls  int
}

func (s *liquidationBrokerStub) BuybackFromUser(context.Context, uuid.UUID, uuid.UUID, int64, int64) (int64, error) {
	return 0, errors.New("unexpected buyback")
}
func (s *liquidationBrokerStub) SettleCaseClaim(_ context.Context, _ uuid.UUID, _ uuid.UUID, payout int64) (int64, error) {
	s.calls++
	s.payout = payout
	return 777, nil
}

type buybackBrokerStub struct {
	calls  int
	payout int64
}

func (s *buybackBrokerStub) BuybackFromUser(_ context.Context, _, _ uuid.UUID, payout, _ int64) (int64, error) {
	s.calls++
	s.payout = payout
	return 999, nil
}
func (s *buybackBrokerStub) SettleCaseClaim(context.Context, uuid.UUID, uuid.UUID, int64) (int64, error) {
	return 0, errors.New("unexpected case cashout")
}

type custodyCheckerStub struct {
	enabled bool
	err     error
	calls   int
}

func (s *custodyCheckerStub) Enabled() bool { return s.enabled }
func (s *custodyCheckerStub) HasOwnedGift(context.Context, string) error {
	s.calls++
	return s.err
}

func TestLiquidateRejectsProfileAndManualDeposit(t *testing.T) {
	userID := uuid.New()
	cases := []struct {
		name string
		ref  string
		slug string
		want error
	}{
		{name: "profile", ref: "profile:MiniOscar-4788", slug: "MiniOscar-4788", want: domain.ErrGiftNotInBotCustody},
		{name: "manual", ref: "deposit:manual:20260812:minioscar-4788", slug: "MiniOscar-4788", want: domain.ErrGiftNotInBotCustody},
		{name: "slug deposit", ref: "deposit:MiniOscar-4788", slug: "MiniOscar-4788", want: domain.ErrGiftNotInBotCustody},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			itemID := uuid.New()
			broker := &buybackBrokerStub{}
			svc := &Service{
				inventory: &inventoryRepoStub{item: &domain.InventoryItem{
					ID:                itemID,
					UserID:            userID,
					Status:            domain.InvAvailable,
					TelegramTxRef:     tc.ref,
					TelegramGiftID:    tc.slug,
					FloorPriceNanoton: 150e9,
				}},
				market: broker,
			}
			_, err := svc.Liquidate(context.Background(), userID, itemID)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err=%v want %v", err, tc.want)
			}
			if broker.calls != 0 {
				t.Fatalf("buyback must not run, calls=%d", broker.calls)
			}
		})
	}
}

func TestLiquidateRealDepositBuyback(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	broker := &buybackBrokerStub{}
	svc := &Service{
		inventory: &inventoryRepoStub{item: &domain.InventoryItem{
			ID:                itemID,
			UserID:            userID,
			Status:            domain.InvAvailable,
			TelegramTxRef:     "deposit:msg:777",
			TelegramGiftID:    "MiniOscar-4788",
			FloorPriceNanoton: 89e9,
		}},
		market: broker,
	}
	balance, err := svc.Liquidate(context.Background(), userID, itemID)
	if err != nil {
		t.Fatalf("liquidate: %v", err)
	}
	if balance != 999 || broker.calls != 1 || broker.payout != 89e9 {
		t.Fatalf("balance=%d calls=%d payout=%d", balance, broker.calls, broker.payout)
	}
}

func TestLiquidateRejectsWhenGiftNotOnDepositAccount(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	broker := &buybackBrokerStub{}
	checker := &custodyCheckerStub{enabled: true, err: telegram.ErrGiftNotOnAccount}
	svc := &Service{
		inventory: &inventoryRepoStub{item: &domain.InventoryItem{
			ID:                itemID,
			UserID:            userID,
			Status:            domain.InvAvailable,
			TelegramTxRef:     "deposit:msg:777",
			TelegramGiftID:    "MiniOscar-4788",
			FloorPriceNanoton: 150e9,
		}},
		market:  broker,
		custody: checker,
	}
	_, err := svc.Liquidate(context.Background(), userID, itemID)
	if !errors.Is(err, domain.ErrGiftNotInBotCustody) {
		t.Fatalf("err=%v", err)
	}
	if broker.calls != 0 {
		t.Fatalf("buyback must not run")
	}
	if checker.calls != 1 {
		t.Fatalf("custody checks=%d", checker.calls)
	}
}

func TestBuildItemViewIncludesCaseCashout(t *testing.T) {
	item := domain.InventoryItem{
		Metadata: []byte(`{"case_cashout_nanoton":123456789}`),
	}
	view := BuildItemView(context.Background(), nil, item)
	if view.CaseCashoutNanoton != 123456789 {
		t.Fatalf("got %d want %d", view.CaseCashoutNanoton, 123456789)
	}
}

func TestLiquidateCaseClaimUsesGuaranteedCashout(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:            itemID,
			UserID:        userID,
			Status:        domain.InvAvailable,
			TelegramTxRef: domain.CaseClaimTxRefPrefix + uuid.NewString(),
			Metadata:      []byte(`{"case_cashout_nanoton":4200000000}`),
		},
	}
	broker := &liquidationBrokerStub{}
	svc := &Service{inventory: repo, market: broker}

	balance, err := svc.LiquidateCaseClaim(context.Background(), userID, itemID)
	if err != nil {
		t.Fatalf("liquidate case claim: %v", err)
	}
	if balance != 777 {
		t.Fatalf("balance %d", balance)
	}
	if broker.calls != 1 {
		t.Fatalf("expected broker call, got %d", broker.calls)
	}
	if broker.payout != 4200000000 {
		t.Fatalf("payout %d", broker.payout)
	}
}

func TestLiquidateCaseClaimBackedHouseGiftWithoutCaseTxRef(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	caseID := uuid.New()
	lootID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:             itemID,
			UserID:         userID,
			Status:         domain.InvAvailable,
			TelegramTxRef:  "deposit:legacy-ref",
			TelegramGiftID: "snakebox-154039",
			Metadata: []byte(`{
				"fulfillment":"backed",
				"case_id":"` + caseID.String() + `",
				"loot_entry_id":"` + lootID.String() + `",
				"case_cashout_nanoton":1500000000
			}`),
		},
	}
	broker := &liquidationBrokerStub{}
	svc := &Service{inventory: repo, market: broker}

	balance, err := svc.LiquidateCaseClaim(context.Background(), userID, itemID)
	if err != nil {
		t.Fatalf("liquidate backed house gift: %v", err)
	}
	if balance != 777 {
		t.Fatalf("balance %d", balance)
	}
	if broker.payout != 1500000000 {
		t.Fatalf("payout %d", broker.payout)
	}
}

func TestLiquidateRoutesCaseClaimsToGuaranteedCashout(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:            itemID,
			UserID:        userID,
			Status:        domain.InvAvailable,
			TelegramTxRef: domain.CaseClaimTxRefPrefix + uuid.NewString(),
			Metadata:      []byte(`{"case_cashout_nanoton":4200000000}`),
		},
	}
	broker := &liquidationBrokerStub{}
	svc := &Service{inventory: repo, market: broker}

	balance, err := svc.Liquidate(context.Background(), userID, itemID)
	if err != nil {
		t.Fatalf("liquidate: %v", err)
	}
	if balance != 777 {
		t.Fatalf("balance %d", balance)
	}
	if broker.calls != 1 || broker.payout != 4200000000 {
		t.Fatalf("settle calls=%d payout=%d", broker.calls, broker.payout)
	}
}

func TestLiquidateRoutesUnbackedCaseClaimsToGuaranteedCashout(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:            itemID,
			UserID:        userID,
			Status:        domain.InvAvailable,
			TelegramTxRef: domain.CaseClaimTxRefPrefix + uuid.NewString(),
			Metadata:      []byte(`{"fulfillment":"unbacked","case_cashout_nanoton":1500000000}`),
		},
	}
	broker := &liquidationBrokerStub{}
	svc := &Service{inventory: repo, market: broker}

	balance, err := svc.Liquidate(context.Background(), userID, itemID)
	if err != nil {
		t.Fatalf("liquidate: %v", err)
	}
	if balance != 777 || broker.payout != 1500000000 {
		t.Fatalf("balance=%d payout=%d", balance, broker.payout)
	}
}

func TestFulfillPendingWithdrawalMergesClaimMetadata(t *testing.T) {
	origFetch := fetchGiftTraits
	fetchGiftTraits = func(context.Context, string) (telegram.GiftAttributes, error) {
		return telegram.GiftAttributes{}, nil
	}
	defer func() { fetchGiftTraits = origFetch }()

	userID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:             itemID,
			UserID:         userID,
			CollectionSlug: "plush-pepe",
			Status:         domain.InvWithdrawPending,
			TelegramTxRef:  domain.CaseClaimTxRefPrefix + uuid.NewString(),
			Metadata:       []byte(`{"fulfillment":"unbacked","collection":"plush-pepe","case_cashout_nanoton":1500000000}`),
		},
	}
	users := &userRepoStub{
		user: &domain.User{ID: userID, TelegramID: 12345},
	}
	svc := &Service{inventory: repo, users: users}

	err := svc.FulfillPendingWithdrawal(context.Background(), itemID, "gift-slug")
	if err == nil || err.Error() != "вывод подарков временно недоступен" {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.boundGiftID != "" {
		t.Fatalf("gift should not be bound before successful send, got %q", repo.boundGiftID)
	}
}

func TestFulfillPendingWithdrawalRejectsMismatchedPromisedTraits(t *testing.T) {
	origFetch := fetchGiftTraits
	fetchGiftTraits = func(context.Context, string) (telegram.GiftAttributes, error) {
		return telegram.GiftAttributes{Model: "Ruby", Backdrop: "Black"}, nil
	}
	defer func() { fetchGiftTraits = origFetch }()

	userID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryRepoStub{
		item: &domain.InventoryItem{
			ID:             itemID,
			UserID:         userID,
			CollectionSlug: "plush-pepe",
			Status:         domain.InvWithdrawPending,
			TelegramTxRef:  domain.CaseClaimTxRefPrefix + uuid.NewString(),
			Metadata:       []byte(`{"fulfillment":"unbacked","collection":"plush-pepe","model":"Emerald","backdrop":"Black","case_cashout_nanoton":1500000000}`),
		},
	}
	users := &userRepoStub{
		user: &domain.User{ID: userID, TelegramID: 12345},
	}
	svc := &Service{inventory: repo, users: users}

	err := svc.FulfillPendingWithdrawal(context.Background(), itemID, "gift-slug")
	if err == nil || err.Error() != "slug не совпадает с обещанной моделью: нужен Emerald" {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.boundMeta) != 0 {
		t.Fatal("bind should not be called on trait mismatch")
	}
}
