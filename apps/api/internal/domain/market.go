package domain

import (
	"time"

	"github.com/google/uuid"
)

type ListingStatus string

const (
	ListingActive    ListingStatus = "active"
	ListingSold      ListingStatus = "sold"
	ListingCancelled ListingStatus = "cancelled"
)

type ListingSource string

const (
	ListingSourceBot  ListingSource = "bot"
	ListingSourceUser ListingSource = "user"
)

const BotTelegramID int64 = 0

type MarketListing struct {
	ID              uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	SellerID        uuid.UUID     `gorm:"type:uuid;not null;index" json:"seller_id"`
	InventoryItemID uuid.UUID     `gorm:"type:uuid;not null;index" json:"inventory_item_id"`
	PriceNanoton    int64         `gorm:"not null" json:"price_nanoton"`
	Status          ListingStatus `gorm:"type:varchar(32);not null;index" json:"status"`
	Source          ListingSource `gorm:"type:varchar(16);not null" json:"source"`
	BuyerID         *uuid.UUID    `gorm:"type:uuid" json:"buyer_id,omitempty"`
	SoldAt          *time.Time    `json:"sold_at,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`

	Seller User          `gorm:"foreignKey:SellerID" json:"-"`
	Item   InventoryItem `gorm:"foreignKey:InventoryItemID" json:"-"`
	Buyer  *User         `gorm:"foreignKey:BuyerID" json:"-"`
}
