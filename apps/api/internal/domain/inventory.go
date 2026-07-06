package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type NFTSource string

const (
	NFTSourceTelegramGift NFTSource = "telegram_gift"
	NFTSourceCustom       NFTSource = "custom"
)

type InventoryStatus string

const (
	InvAvailable  InventoryStatus = "available"
	InvStaked     InventoryStatus = "staked"
	InvLiquidated InventoryStatus = "liquidated"
	InvLocked     InventoryStatus = "locked"
	InvWithdrawn  InventoryStatus = "withdrawn"
	// InvDissolved — виртуальная запись профильного стейка; не продаётся и не показывается в инвентаре.
	InvDissolved InventoryStatus = "dissolved"
)

type InventoryItem struct {
	ID                uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID            uuid.UUID       `gorm:"type:uuid;not null;index" json:"user_id"`
	Source            NFTSource       `gorm:"type:varchar(32);not null" json:"source"`
	TelegramGiftID    string          `gorm:"size:128;uniqueIndex" json:"telegram_gift_id"`
	CollectionSlug    string          `gorm:"size:128" json:"collection_slug"`
	TokenID           string          `gorm:"size:128" json:"token_id"`
	Name              string          `gorm:"size:256" json:"name"`
	ImageURL          string          `gorm:"size:512" json:"image_url"`
	Metadata          datatypes.JSON  `gorm:"type:jsonb" json:"metadata,omitempty"`
	FloorPriceNanoton int64           `gorm:"not null" json:"floor_price_nanoton"`
	Status            InventoryStatus `gorm:"type:varchar(32);not null;index" json:"status"`
	DepositedAt       time.Time       `gorm:"not null" json:"deposited_at"`
	LiquidatedAt      *time.Time      `json:"liquidated_at,omitempty"`
	TelegramTxRef     string          `gorm:"size:256" json:"telegram_tx_ref"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// IsProfileVirtualItem — запись создана только для стейка из профиля Telegram, без депозита в бота.
func IsProfileVirtualItem(item InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, "profile:")
}

type NFTFloorPrice struct {
	CollectionSlug    string    `gorm:"size:128;primaryKey" json:"collection_slug"`
	PriceNanoton      int64     `gorm:"not null" json:"price_nanoton"`
	UpdatedAt         time.Time `json:"updated_at"`
}
