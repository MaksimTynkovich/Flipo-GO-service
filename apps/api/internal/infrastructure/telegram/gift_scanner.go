package telegram

import (
	"context"
	"time"
)

const defaultScanTimeout = 60 * time.Second

type GiftAttributes struct {
	Model    string `json:"model,omitempty"`
	Backdrop string `json:"backdrop,omitempty"`
	Symbol   string `json:"symbol,omitempty"`
}

type ScannedGift struct {
	Slug           string         `json:"slug"`
	Name           string         `json:"name"`
	CollectionSlug string         `json:"collection_slug"`
	TokenID        string         `json:"token_id"`
	ImageURL       string         `json:"image_url"`
	Attributes     GiftAttributes `json:"attributes,omitempty"`
	PriceNanoton   int64          `json:"price_nanoton"`
	PriceSource    string         `json:"price_source,omitempty"`
}

type ProfileGiftScanRequest struct {
	TelegramUserID int64
	Username       string
}

type ProfileGiftScanner interface {
	ScanProfileGifts(ctx context.Context, req ProfileGiftScanRequest) ([]ScannedGift, error)
}

type DebugGiftScanner struct{}

func NewDebugGiftScanner() *DebugGiftScanner {
	return &DebugGiftScanner{}
}

func (s *DebugGiftScanner) ScanProfileGifts(_ context.Context, _ ProfileGiftScanRequest) ([]ScannedGift, error) {
	return []ScannedGift{
		{
			Slug:           "vintagecigar-22477",
			Name:           "Vintage Cigar #22477",
			CollectionSlug: "vintagecigar",
			TokenID:        "22477",
			ImageURL:       "https://nft.fragment.com/gift/vintagecigar-22477.medium.jpg",
			PriceNanoton:   15_000_000_000,
		},
		{
			Slug:           "plushpepe-1984",
			Name:           "Plush Pepe #1984",
			CollectionSlug: "plushpepe",
			TokenID:        "1984",
			ImageURL:       "https://nft.fragment.com/gift/plushpepe-1984.medium.jpg",
			PriceNanoton:   12_000_000_000,
		},
		{
			Slug:           "swisswatch-777",
			Name:           "Swiss Watch #777",
			CollectionSlug: "swisswatch",
			TokenID:        "777",
			ImageURL:       "https://nft.fragment.com/gift/swisswatch-777.medium.jpg",
			PriceNanoton:   8_500_000_000,
		},
	}, nil
}

type MTProtoGiftScanner struct {
	cfg     MTProtoConfig
	timeout time.Duration
}

func NewMTProtoGiftScanner(cfg MTProtoConfig) *MTProtoGiftScanner {
	return &MTProtoGiftScanner{cfg: cfg, timeout: defaultScanTimeout}
}

func (s *MTProtoGiftScanner) ScanProfileGifts(ctx context.Context, req ProfileGiftScanRequest) ([]ScannedGift, error) {
	if !s.cfg.Enabled() {
		return nil, ErrMTProtoNotConfigured
	}

	scanCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	target := scanTargetFromRequest(req)
	result, err := ScanProfileGiftsOnce(scanCtx, s.cfg, target, ScanOptions{})
	if err != nil {
		return nil, err
	}
	return result.Gifts, nil
}

func scanTargetFromRequest(req ProfileGiftScanRequest) ScanTarget {
	if req.Username != "" {
		return ScanTarget{
			UserID:   req.TelegramUserID,
			Username: req.Username,
		}
	}
	return ScanTargetByID(req.TelegramUserID)
}

func NewProfileGiftScanner(debugEnabled bool, cfg MTProtoConfig) ProfileGiftScanner {
	if debugEnabled {
		return NewDebugGiftScanner()
	}
	return NewMTProtoGiftScanner(cfg)
}
