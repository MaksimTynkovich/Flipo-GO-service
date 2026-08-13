package inventory

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type autoDepositInventoryStub struct {
	item           *domain.InventoryItem
	txRefItem      *domain.InventoryItem
	findActiveItem *domain.InventoryItem
	promotedItemID uuid.UUID
	promotedUserID uuid.UUID
	promotedTxRef  string
	promotedPrice  int64
	promoteCalls   int
}

func (s *autoDepositInventoryStub) ListByUser(context.Context, uuid.UUID, *domain.InventoryStatus) ([]domain.InventoryItem, error) {
	return nil, nil
}
func (s *autoDepositInventoryStub) ListByStatus(context.Context, domain.InventoryStatus, int) ([]domain.InventoryItem, error) {
	return nil, nil
}
func (s *autoDepositInventoryStub) FindByID(_ context.Context, id uuid.UUID) (*domain.InventoryItem, error) {
	if s.item == nil || s.item.ID != id {
		return nil, gorm.ErrRecordNotFound
	}
	item := *s.item
	return &item, nil
}
func (s *autoDepositInventoryStub) FindByTelegramGiftID(context.Context, uuid.UUID, string) (*domain.InventoryItem, error) {
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) FindByGiftSlug(context.Context, string) (*domain.InventoryItem, error) {
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) FindActiveByGiftSlug(context.Context, string) (*domain.InventoryItem, error) {
	if s.findActiveItem != nil {
		item := *s.findActiveItem
		return &item, nil
	}
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) FindByTelegramTxRef(context.Context, string) (*domain.InventoryItem, error) {
	if s.txRefItem != nil {
		item := *s.txRefItem
		return &item, nil
	}
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) Create(context.Context, *domain.InventoryItem) error { return nil }
func (s *autoDepositInventoryStub) CreateGiftWithdrawal(context.Context, *domain.GiftWithdrawal) error {
	return nil
}
func (s *autoDepositInventoryStub) PromoteProfileToDeposit(_ context.Context, itemID, userID uuid.UUID, txRef string, floorPriceNanoton int64, _ []byte, _, _ string) error {
	s.promoteCalls++
	s.promotedItemID = itemID
	s.promotedUserID = userID
	s.promotedTxRef = txRef
	s.promotedPrice = floorPriceNanoton
	if s.item != nil && s.item.ID == itemID {
		s.item.UserID = userID
		s.item.TelegramTxRef = txRef
		s.item.FloorPriceNanoton = floorPriceNanoton
	}
	return nil
}
func (s *autoDepositInventoryStub) UpdateStatus(context.Context, uuid.UUID, domain.InventoryStatus, domain.InventoryStatus) error {
	return nil
}
func (s *autoDepositInventoryStub) UpdateFloorPriceNanoton(context.Context, uuid.UUID, int64) error {
	return nil
}
func (s *autoDepositInventoryStub) LockForBet(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (s *autoDepositInventoryStub) ReleaseFromBet(context.Context, uuid.UUID) error { return nil }
func (s *autoDepositInventoryStub) TransferFromBet(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (s *autoDepositInventoryStub) TransferOwnership(context.Context, uuid.UUID, uuid.UUID, domain.InventoryStatus) error {
	return nil
}
func (s *autoDepositInventoryStub) TakeHouseGiftForCollection(context.Context, uuid.UUID, uuid.UUID, string, string) (*domain.InventoryItem, error) {
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) TakeHouseGiftForModel(context.Context, uuid.UUID, uuid.UUID, string, string, string) (*domain.InventoryItem, error) {
	return nil, gorm.ErrRecordNotFound
}
func (s *autoDepositInventoryStub) HasHouseGift(context.Context, uuid.UUID, string, string, string) (bool, error) {
	return false, nil
}
func (s *autoDepositInventoryStub) BindTelegramGift(context.Context, uuid.UUID, string, string, []byte, string, string) error {
	return nil
}
func (s *autoDepositInventoryStub) GetFloorPrice(context.Context, string) (int64, error) {
	return 0, nil
}
func (s *autoDepositInventoryStub) SetFloorPrice(context.Context, string, int64) error { return nil }

type autoDepositUserStub struct {
	user *domain.User
}

func (s *autoDepositUserStub) FindByID(context.Context, uuid.UUID) (*domain.User, error) {
	if s.user == nil {
		return nil, domain.ErrNotFound
	}
	user := *s.user
	return &user, nil
}
func (s *autoDepositUserStub) FindByTelegramID(_ context.Context, telegramID int64) (*domain.User, error) {
	if s.user == nil || s.user.TelegramID != telegramID {
		return nil, gorm.ErrRecordNotFound
	}
	user := *s.user
	return &user, nil
}
func (s *autoDepositUserStub) Upsert(context.Context, *domain.User) error { return nil }
func (s *autoDepositUserStub) EnsureSocialBotUser(context.Context, uuid.UUID, int64, string, string, string) (*domain.User, error) {
	return nil, errors.New("not implemented")
}
func (s *autoDepositUserStub) UpdateWallet(context.Context, uuid.UUID, string) error { return nil }
func (s *autoDepositUserStub) UpdateBanned(context.Context, uuid.UUID, bool) error   { return nil }
func (s *autoDepositUserStub) UpdateWithdrawalsDisabled(context.Context, uuid.UUID, bool) error {
	return nil
}
func (s *autoDepositUserStub) UpdateBalance(context.Context, uuid.UUID, int64, domain.LedgerType, string, uuid.UUID) (int64, int64, error) {
	return 0, 0, nil
}
func (s *autoDepositUserStub) RestoreAdminCredit(context.Context, uuid.UUID, int64) error { return nil }
func (s *autoDepositUserStub) GetBalanceForUpdate(context.Context, uuid.UUID) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) UpdateStakingTier(context.Context, uuid.UUID, domain.StakingTier) error {
	return nil
}
func (s *autoDepositUserStub) ListIDsByStakingTier(context.Context, domain.StakingTier) ([]uuid.UUID, error) {
	return nil, nil
}
func (s *autoDepositUserStub) SetReferrerIfEmpty(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (s *autoDepositUserStub) CountReferrals(context.Context, uuid.UUID) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) CountReferralsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) SumReferralEarnings(context.Context, uuid.UUID) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) SumReferralEarningsByRefType(context.Context, uuid.UUID, string) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) SumReferralEarningsSince(context.Context, uuid.UUID, time.Time) (int64, error) {
	return 0, nil
}
func (s *autoDepositUserStub) ListReferrals(context.Context, uuid.UUID) ([]domain.User, error) {
	return nil, nil
}
func (s *autoDepositUserStub) ListReferredUsers(context.Context) ([]domain.User, error) {
	return nil, nil
}
func (s *autoDepositUserStub) ListTelegramIDs(context.Context, int, int) ([]int64, error) {
	return nil, nil
}
func (s *autoDepositUserStub) CountUsers(context.Context) (int64, error) { return 0, nil }

var (
	_ domain.InventoryRepository = (*autoDepositInventoryStub)(nil)
	_ domain.UserRepository      = (*autoDepositUserStub)(nil)
)

func TestAutoDepositPromotesStakedProfileGift(t *testing.T) {
	userID := uuid.New()
	itemID := uuid.New()
	user := &domain.User{ID: userID, TelegramID: 395183166}
	existing := &domain.InventoryItem{
		ID:             itemID,
		UserID:         userID,
		TelegramGiftID: "MiniOscar-4788",
		TelegramTxRef:  "profile:MiniOscar-4788",
		Status:         domain.InvStaked,
	}
	repo := &autoDepositInventoryStub{
		item:           existing,
		findActiveItem: existing,
	}
	svc := &AutoDepositService{users: &autoDepositUserStub{user: user}, inventory: repo}

	ok, err := svc.creditOne(context.Background(), telegram.IncomingGift{
		ScannedGift: telegram.ScannedGift{
			Slug:           "MiniOscar-4788",
			CollectionSlug: "MiniOscar",
			TokenID:        "4788",
			Name:           "Mini Oscar",
			ImageURL:       "https://example.test/minioscar.png",
			PriceNanoton:   1230000000,
		},
		SenderTelegramID: user.TelegramID,
		MsgID:            777,
	})
	if err != nil {
		t.Fatalf("creditOne: %v", err)
	}
	if !ok {
		t.Fatal("expected deposit to be credited")
	}
	if repo.promoteCalls != 1 {
		t.Fatalf("promoteCalls=%d", repo.promoteCalls)
	}
	if repo.promotedTxRef != "deposit:msg:777" {
		t.Fatalf("promotedTxRef=%q", repo.promotedTxRef)
	}
	if repo.item.Status != domain.InvStaked {
		t.Fatalf("status=%s, want staked", repo.item.Status)
	}
}

func TestAutoDepositSkipsAlreadyCreditedTxRef(t *testing.T) {
	repo := &autoDepositInventoryStub{
		txRefItem: &domain.InventoryItem{ID: uuid.New(), Status: domain.InvAvailable},
	}
	svc := &AutoDepositService{
		users:     &autoDepositUserStub{user: &domain.User{ID: uuid.New(), TelegramID: 395183166}},
		inventory: repo,
	}

	ok, err := svc.creditOne(context.Background(), telegram.IncomingGift{
		ScannedGift:      telegram.ScannedGift{Slug: "MiniOscar-4788", PriceNanoton: 1},
		SenderTelegramID: 395183166,
		MsgID:            777,
	})
	if err != nil {
		t.Fatalf("creditOne: %v", err)
	}
	if ok {
		t.Fatal("expected existing tx_ref path to skip credit")
	}
	if repo.promoteCalls != 0 {
		t.Fatalf("promoteCalls=%d, want 0", repo.promoteCalls)
	}
}
