package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const (
	CaseKindCatalog  = "catalog"
	CaseKindFeatured = "featured"
	CaseKindDaily    = "daily"

	CaseOpenSourcePaid  = "paid"
	CaseOpenSourceDaily = "daily"
	CaseOpenSourceFree  = "free"

	CaseClaimTxRefPrefix = "case:"

	CaseFulfillmentUnbacked = "unbacked"
	CaseFulfillmentBacked   = "backed"
)

type Case struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Slug            string    `gorm:"size:64;not null;uniqueIndex" json:"slug"`
	Title           string    `gorm:"size:128;not null" json:"title"`
	ImageURL        string    `gorm:"size:512" json:"image_url"`
	AccentColor     string    `gorm:"size:32" json:"accent_color"`
	PriceNanoton    int64     `gorm:"not null" json:"price_nanoton"`
	Kind            string    `gorm:"size:16;not null;index" json:"kind"`
	SortOrder       int       `gorm:"not null;default:0" json:"sort_order"`
	Active          bool      `gorm:"not null;default:true;index" json:"active"`
	RequireChannel  bool      `gorm:"not null;default:false" json:"require_channel"`
	TargetRTPBPS    int       `gorm:"column:target_rtp_bps;not null;default:9000" json:"target_rtp_bps"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (Case) TableName() string { return "cases" }

type CaseLootEntry struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CaseID            uuid.UUID `gorm:"type:uuid;not null;index" json:"case_id"`
	CollectionSlug    string    `gorm:"size:128;not null" json:"collection_slug"`
	Weight            int       `gorm:"not null" json:"weight"`
	DisplayName       string    `gorm:"size:128;not null" json:"display_name"`
	ImageURL          string    `gorm:"size:512" json:"image_url"`
	RarityLabel           string    `gorm:"size:64" json:"rarity_label"`
	TileBackgroundColor   string    `gorm:"size:16" json:"tile_background_color"`
	SortOrder             int       `gorm:"not null;default:0" json:"sort_order"`
	FloorPriceNanoton int64     `gorm:"not null;default:0" json:"floor_price_nanoton"`
	CreatedAt         time.Time `json:"created_at"`
}

func (CaseLootEntry) TableName() string { return "case_loot_entries" }

type CaseOpen struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID           uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	CaseID           uuid.UUID `gorm:"type:uuid;not null;index" json:"case_id"`
	PricePaidNanoton int64     `gorm:"not null" json:"price_paid_nanoton"`
	Source           string    `gorm:"size:16;not null" json:"source"`
	RngRoll          int       `gorm:"not null" json:"rng_roll"`
	LootEntryID      uuid.UUID `gorm:"type:uuid;not null" json:"loot_entry_id"`
	InventoryItemID  uuid.UUID `gorm:"type:uuid;not null" json:"inventory_item_id"`
	IdempotencyKey   string    `gorm:"size:128;not null;uniqueIndex" json:"idempotency_key"`
	CreatedAt        time.Time `gorm:"index" json:"created_at"`
}

func (CaseOpen) TableName() string { return "case_opens" }

type UserCaseState struct {
	UserID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	LastDailyOpenDate *time.Time `gorm:"type:date" json:"last_daily_open_date,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

func (UserCaseState) TableName() string { return "user_case_state" }

// CaseCatalogSettings — singleton (id=1) for catalog UI knobs.
type CaseCatalogSettings struct {
	ID             int       `gorm:"primaryKey" json:"id"`
	BannersEnabled bool      `gorm:"not null;default:false" json:"banners_enabled"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (CaseCatalogSettings) TableName() string { return "case_catalog_settings" }

// IsCaseClaimItem — inventory row created by opening a case.
func IsCaseClaimItem(item InventoryItem) bool {
	return strings.HasPrefix(item.TelegramTxRef, CaseClaimTxRefPrefix)
}

// CaseClaimFulfillment reads metadata.fulfillment; empty means backed (real deposit / bound gift).
func CaseClaimFulfillment(meta datatypes.JSON) string {
	if len(meta) == 0 {
		return CaseFulfillmentBacked
	}
	raw := string(meta)
	if strings.Contains(raw, `"fulfillment":"unbacked"`) || strings.Contains(raw, `"fulfillment": "unbacked"`) {
		return CaseFulfillmentUnbacked
	}
	return CaseFulfillmentBacked
}

func IsUnbackedCaseClaim(item InventoryItem) bool {
	if !IsCaseClaimItem(item) {
		return false
	}
	if item.TelegramGiftID == "" {
		return true
	}
	return CaseClaimFulfillment(item.Metadata) == CaseFulfillmentUnbacked
}

// Allowed loot tile background colors (admin picker). Empty string = use rarity default.
var AllowedLootTileColors = []string{
	"#f77091", "#ff9ebb", "#ff6b8b", "#ffb7b2", "#ff8e72", "#fdffb6",
	"#cff4d2", "#a8f0d3", "#70d6ff", "#54bbf0", "#a0c4ff", "#bdb2ff",
	"#9d8df1", "#3d348b", "#1a2642", "#111a2e",
}

var allowedLootTileColorSet map[string]struct{}

func init() {
	allowedLootTileColorSet = make(map[string]struct{}, len(AllowedLootTileColors))
	for _, c := range AllowedLootTileColors {
		allowedLootTileColorSet[c] = struct{}{}
	}
}

// NormalizeLootTileBackgroundColor returns a whitelisted hex or "".
func NormalizeLootTileBackgroundColor(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	if _, ok := allowedLootTileColorSet[s]; ok {
		return s
	}
	return ""
}
