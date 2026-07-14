package domain

import "time"

// GiftTraitPrice caches market valuation by collection+model, with backdrop
// only when it is price-sensitive (Black / Onyx Black).
type GiftTraitPrice struct {
	CollectionSlug string    `gorm:"size:128;primaryKey" json:"collection_slug"`
	Model          string    `gorm:"size:128;primaryKey" json:"model"`
	Backdrop       string    `gorm:"size:128;primaryKey;default:''" json:"backdrop"`
	PriceNanoton   int64     `gorm:"not null" json:"price_nanoton"`
	Source         string    `gorm:"size:64;not null;default:''" json:"source"`
	FetchedAt      time.Time `gorm:"not null" json:"fetched_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (GiftTraitPrice) TableName() string { return "gift_trait_prices" }
