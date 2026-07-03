package telegram

import (
	"context"
	"errors"
)

type ScannedGift struct {
	Slug           string
	Name           string
	CollectionSlug string
	TokenID        string
	ImageURL       string
	PriceNanoton   int64
}

type ProfileGiftScanner interface {
	ScanProfileGifts(ctx context.Context, telegramUserID int64) ([]ScannedGift, error)
}

type DebugGiftScanner struct{}

func NewDebugGiftScanner() *DebugGiftScanner {
	return &DebugGiftScanner{}
}

func (s *DebugGiftScanner) ScanProfileGifts(_ context.Context, _ int64) ([]ScannedGift, error) {
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

type MTProtoGiftScanner struct{}

func NewMTProtoGiftScanner() *MTProtoGiftScanner {
	return &MTProtoGiftScanner{}
}

func (s *MTProtoGiftScanner) ScanProfileGifts(_ context.Context, _ int64) ([]ScannedGift, error) {
	// TODO: payments.getSavedStarGifts via MTProto userbot session
	return nil, errors.New("mtproto gift scanner not configured")
}

func NewProfileGiftScanner(debugEnabled bool) ProfileGiftScanner {
	if debugEnabled {
		return NewDebugGiftScanner()
	}
	return NewMTProtoGiftScanner()
}
