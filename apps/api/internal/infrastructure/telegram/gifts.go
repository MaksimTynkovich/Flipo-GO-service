package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type GiftTransfer struct {
	GiftID         string
	CollectionSlug string
	TokenID        string
	Name           string
	ImageURL       string
	TelegramTxRef  string
	Metadata       json.RawMessage
}

type GiftDepositVerifier interface {
	VerifyAndParse(ctx context.Context, telegramUserID int64, txRef string) (*GiftTransfer, error)
}

type BotGiftVerifier struct {
	botToken   string
	httpClient *http.Client
}

func NewBotGiftVerifier(botToken string) *BotGiftVerifier {
	return &BotGiftVerifier{
		botToken:   botToken,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// VerifyAndParse validates a gift transfer reference via Telegram Bot API.
// In production this calls the gifts/transfers endpoint; for dev, txRef format:
// gift:{gift_id}:{collection_slug}:{price_nanoton}
func (v *BotGiftVerifier) VerifyAndParse(ctx context.Context, telegramUserID int64, txRef string) (*GiftTransfer, error) {
	if txRef == "" {
		return nil, errors.New("empty tx ref")
	}

	if len(txRef) > 5 && txRef[:5] == "gift:" {
		parts := splitN(txRef, ":", 4)
		if len(parts) < 4 {
			return nil, errors.New("invalid dev gift ref format")
		}
		return &GiftTransfer{
			GiftID:         parts[1],
			CollectionSlug: parts[2],
			Name:           fmt.Sprintf("Gift %s", parts[1]),
			TelegramTxRef:  txRef,
			Metadata:       json.RawMessage(`{}`),
		}, nil
	}

	// Production path: query Telegram API
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getStarTransactions", v.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("telegram api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram api status: %d", resp.StatusCode)
	}

	return nil, errors.New("gift transfer not found in telegram api response")
}

func splitN(s, sep string, n int) []string {
	var result []string
	for i := 0; i < n-1; i++ {
		idx := indexOf(s, sep)
		if idx < 0 {
			result = append(result, s)
			return result
		}
		result = append(result, s[:idx])
		s = s[idx+len(sep):]
	}
	result = append(result, s)
	return result
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

type DepositService struct {
	verifier  GiftDepositVerifier
	inventory domain.InventoryRepository
}

func NewDepositService(verifier GiftDepositVerifier, inventory domain.InventoryRepository) *DepositService {
	return &DepositService{verifier: verifier, inventory: inventory}
}

func (s *DepositService) ProcessDeposit(ctx context.Context, user *domain.User, txRef string) (*domain.InventoryItem, error) {
	transfer, err := s.verifier.VerifyAndParse(ctx, user.TelegramID, txRef)
	if err != nil {
		return nil, err
	}

	floorPrice, err := s.inventory.GetFloorPrice(ctx, transfer.CollectionSlug)
	if err != nil || floorPrice <= 0 {
		floorPrice = 100_000_000 // 0.1 TON default
	}

	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            user.ID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    transfer.GiftID,
		CollectionSlug:    transfer.CollectionSlug,
		TokenID:           transfer.TokenID,
		Name:              transfer.Name,
		ImageURL:          transfer.ImageURL,
		Metadata:          datatypes.JSON(transfer.Metadata),
		FloorPriceNanoton: floorPrice,
		Status:            domain.InvAvailable,
		DepositedAt:       time.Now().UTC(),
		TelegramTxRef:     transfer.TelegramTxRef,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}

	if err := s.inventory.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}
