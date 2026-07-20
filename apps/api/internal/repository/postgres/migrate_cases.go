package postgres

import (
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateCases(db *gorm.DB) error {
	type lootSeed struct {
		ID             uuid.UUID
		CollectionSlug string
		Weight         int
		DisplayName    string
		ImageURL       string
		RarityLabel    string
		SortOrder      int
	}
	type caseSeed struct {
		ID           uuid.UUID
		Slug         string
		Title        string
		Subtitle     string
		AccentColor  string
		PriceNanoton int64
		Kind         string
		SortOrder    int
		Loot         []lootSeed
	}

	ton := func(v float64) int64 { return int64(v * 1e9) }
	frag := func(slug string) string {
		return "https://nft.fragment.com/gift/" + slug + ".medium.jpg"
	}

	seeds := []caseSeed{
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000001"), Slug: "premium", Title: "Premium",
			Subtitle: "Лучшие подарки Telegram", AccentColor: "#3b82f6", PriceNanoton: ton(2.5),
			Kind: domain.CaseKindFeatured, SortOrder: 1,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000001"), CollectionSlug: "plushpepe", Weight: 40, DisplayName: "Plush Pepe", ImageURL: frag("plushpepe"), RarityLabel: "rare", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000002"), CollectionSlug: "homemadecake", Weight: 35, DisplayName: "Homemade Cake", ImageURL: frag("homemadecake"), RarityLabel: "uncommon", SortOrder: 2},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000003"), CollectionSlug: "durovscap", Weight: 20, DisplayName: "Durov's Cap", ImageURL: frag("durovscap"), RarityLabel: "epic", SortOrder: 3},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000004"), CollectionSlug: "preciouspeach", Weight: 5, DisplayName: "Precious Peach", ImageURL: frag("preciouspeach"), RarityLabel: "legendary", SortOrder: 4},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000002"), Slug: "daily", Title: "Daily",
			Subtitle: "Ежедневный подарок", AccentColor: "#22c55e", PriceNanoton: 0,
			Kind: domain.CaseKindDaily, SortOrder: 2,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000011"), CollectionSlug: "deskcalendar", Weight: 50, DisplayName: "Desk Calendar", ImageURL: frag("deskcalendar"), RarityLabel: "common", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000012"), CollectionSlug: "homemadecake", Weight: 30, DisplayName: "Homemade Cake", ImageURL: frag("homemadecake"), RarityLabel: "uncommon", SortOrder: 2},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000013"), CollectionSlug: "plushpepe", Weight: 15, DisplayName: "Plush Pepe", ImageURL: frag("plushpepe"), RarityLabel: "rare", SortOrder: 3},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000014"), CollectionSlug: "durovscap", Weight: 5, DisplayName: "Durov's Cap", ImageURL: frag("durovscap"), RarityLabel: "epic", SortOrder: 4},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000003"), Slug: "starter", Title: "Starter",
			Subtitle: "", AccentColor: "#16a34a", PriceNanoton: ton(0.5), Kind: domain.CaseKindCatalog, SortOrder: 10,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000021"), CollectionSlug: "deskcalendar", Weight: 70, DisplayName: "Desk Calendar", ImageURL: frag("deskcalendar"), RarityLabel: "common", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000022"), CollectionSlug: "homemadecake", Weight: 25, DisplayName: "Homemade Cake", ImageURL: frag("homemadecake"), RarityLabel: "uncommon", SortOrder: 2},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000023"), CollectionSlug: "plushpepe", Weight: 5, DisplayName: "Plush Pepe", ImageURL: frag("plushpepe"), RarityLabel: "rare", SortOrder: 3},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000004"), Slug: "pepe-love", Title: "Pepe Love",
			Subtitle: "", AccentColor: "#ea580c", PriceNanoton: ton(1.2), Kind: domain.CaseKindCatalog, SortOrder: 20,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000031"), CollectionSlug: "plushpepe", Weight: 80, DisplayName: "Plush Pepe", ImageURL: frag("plushpepe"), RarityLabel: "rare", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000032"), CollectionSlug: "preciouspeach", Weight: 20, DisplayName: "Precious Peach", ImageURL: frag("preciouspeach"), RarityLabel: "legendary", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000005"), Slug: "birthday", Title: "Birthday",
			Subtitle: "", AccentColor: "#9333ea", PriceNanoton: ton(1.8), Kind: domain.CaseKindCatalog, SortOrder: 30,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000041"), CollectionSlug: "homemadecake", Weight: 70, DisplayName: "Homemade Cake", ImageURL: frag("homemadecake"), RarityLabel: "uncommon", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000042"), CollectionSlug: "lootbag", Weight: 30, DisplayName: "Loot Bag", ImageURL: frag("lootbag"), RarityLabel: "rare", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000006"), Slug: "classic-cap", Title: "Classic Cap",
			Subtitle: "", AccentColor: "#475569", PriceNanoton: ton(2.0), Kind: domain.CaseKindCatalog, SortOrder: 40,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000051"), CollectionSlug: "durovscap", Weight: 85, DisplayName: "Durov's Cap", ImageURL: frag("durovscap"), RarityLabel: "epic", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000052"), CollectionSlug: "plushpepe", Weight: 15, DisplayName: "Plush Pepe", ImageURL: frag("plushpepe"), RarityLabel: "rare", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000007"), Slug: "gold", Title: "Gold",
			Subtitle: "", AccentColor: "#ca8a04", PriceNanoton: ton(3.0), Kind: domain.CaseKindCatalog, SortOrder: 50,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000061"), CollectionSlug: "swisswatch", Weight: 60, DisplayName: "Swiss Watch", ImageURL: frag("swisswatch"), RarityLabel: "epic", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000062"), CollectionSlug: "preciouspeach", Weight: 40, DisplayName: "Precious Peach", ImageURL: frag("preciouspeach"), RarityLabel: "legendary", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000008"), Slug: "diamond", Title: "Diamond",
			Subtitle: "", AccentColor: "#2563eb", PriceNanoton: ton(5.0), Kind: domain.CaseKindCatalog, SortOrder: 60,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000071"), CollectionSlug: "diamondring", Weight: 70, DisplayName: "Diamond Ring", ImageURL: frag("diamondring"), RarityLabel: "legendary", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000072"), CollectionSlug: "swisswatch", Weight: 30, DisplayName: "Swiss Watch", ImageURL: frag("swisswatch"), RarityLabel: "epic", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-000000000009"), Slug: "royal", Title: "Royal",
			Subtitle: "", AccentColor: "#dc2626", PriceNanoton: ton(7.5), Kind: domain.CaseKindCatalog, SortOrder: 70,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000081"), CollectionSlug: "preciouspeach", Weight: 55, DisplayName: "Precious Peach", ImageURL: frag("preciouspeach"), RarityLabel: "legendary", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000082"), CollectionSlug: "diamondring", Weight: 45, DisplayName: "Diamond Ring", ImageURL: frag("diamondring"), RarityLabel: "legendary", SortOrder: 2},
			},
		},
		{
			ID: uuid.MustParse("b1000000-0000-4000-8000-00000000000a"), Slug: "legendary", Title: "Legendary",
			Subtitle: "", AccentColor: "#7c3aed", PriceNanoton: ton(10.0), Kind: domain.CaseKindCatalog, SortOrder: 80,
			Loot: []lootSeed{
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000091"), CollectionSlug: "diamondring", Weight: 50, DisplayName: "Diamond Ring", ImageURL: frag("diamondring"), RarityLabel: "legendary", SortOrder: 1},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000092"), CollectionSlug: "lootbag", Weight: 30, DisplayName: "Loot Bag", ImageURL: frag("lootbag"), RarityLabel: "rare", SortOrder: 2},
				{ID: uuid.MustParse("b2000000-0000-4000-8000-000000000093"), CollectionSlug: "preciouspeach", Weight: 20, DisplayName: "Precious Peach", ImageURL: frag("preciouspeach"), RarityLabel: "legendary", SortOrder: 3},
			},
		},
	}

	for _, cs := range seeds {
		row := map[string]any{
			"id":             cs.ID,
			"slug":           cs.Slug,
			"title":          cs.Title,
			"subtitle":       cs.Subtitle,
			"image_url":      "",
			"accent_color":   cs.AccentColor,
			"price_nanoton":  cs.PriceNanoton,
			"kind":           cs.Kind,
			"sort_order":     cs.SortOrder,
			"active":         true,
			"target_rtp_bps": 9000,
		}
		if err := db.Table(domain.Case{}.TableName()).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{"title", "subtitle", "accent_color", "price_nanoton", "kind", "sort_order", "active", "target_rtp_bps"}),
		}).Create(row).Error; err != nil {
			return fmt.Errorf("seed case %s: %w", cs.Slug, err)
		}
		for _, l := range cs.Loot {
			loot := map[string]any{
				"id":              l.ID,
				"case_id":         cs.ID,
				"collection_slug": l.CollectionSlug,
				"weight":          l.Weight,
				"display_name":    l.DisplayName,
				"image_url":       l.ImageURL,
				"rarity_label":    l.RarityLabel,
				"sort_order":      l.SortOrder,
			}
			if err := db.Table(domain.CaseLootEntry{}.TableName()).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "id"}},
				DoUpdates: clause.AssignmentColumns([]string{"collection_slug", "weight", "display_name", "image_url", "rarity_label", "sort_order"}),
			}).Create(loot).Error; err != nil {
				return fmt.Errorf("seed loot %s/%s: %w", cs.Slug, l.CollectionSlug, err)
			}
		}
	}
	return nil
}
