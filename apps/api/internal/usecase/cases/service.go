package cases

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/inventory"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type BotUserResolver interface {
	EnsureBotUser(ctx context.Context) (*domain.User, error)
}

type ChannelChecker interface {
	IsChannelMember(ctx context.Context, channel string, telegramUserID int64) (bool, error)
}

type ChannelNotSubscribedError struct {
	Channel string
}

func (e *ChannelNotSubscribedError) Error() string {
	return domain.ErrChannelNotSubscribed.Error()
}

func (e *ChannelNotSubscribedError) Is(target error) bool {
	return target == domain.ErrChannelNotSubscribed
}

type Service struct {
	cases           domain.CaseRepository
	inventory       domain.InventoryRepository
	users           domain.UserRepository
	balance         *balance.Service
	valuator        *gifts.Valuator
	bot             BotUserResolver
	requiredChannel string
	channelChecker  ChannelChecker
	admin           AdminCaseNotifier
	live            LiveDropPublisher
	feedBuf         *liveDropBuffer
	liveSim         *LiveSim
}

type AdminCaseNotifier interface {
	NotifyCaseOpen(ctx context.Context, actor telegram.AdminActor, caseTitle, prizeName, source string, priceNanoton, prizeFloorNanoton int64, backed bool)
}

type LiveDropPublisher interface {
	PublishCaseLiveDrop(ctx context.Context, drop domain.CaseLiveDrop)
}

func NewService(
	caseRepo domain.CaseRepository,
	invRepo domain.InventoryRepository,
	users domain.UserRepository,
	balanceSvc *balance.Service,
) *Service {
	s := &Service{
		cases:     caseRepo,
		inventory: invRepo,
		users:     users,
		balance:   balanceSvc,
		feedBuf:   newLiveDropBuffer(),
	}
	s.liveSim = NewLiveSim(s)
	return s
}

func (s *Service) SetValuator(v *gifts.Valuator) { s.valuator = v }
func (s *Service) SetBotResolver(bot BotUserResolver) { s.bot = bot }
func (s *Service) SetAdminNotifier(notifier AdminCaseNotifier) { s.admin = notifier }
func (s *Service) SetLiveDropPublisher(publisher LiveDropPublisher) {
	s.live = NewBufferingLivePublisher(publisher, s.feedBuf)
}
func (s *Service) LiveSim() *LiveSim { return s.liveSim }
func (s *Service) SetChannelRequirement(channel string, checker ChannelChecker) {
	s.requiredChannel = strings.TrimSpace(channel)
	s.channelChecker = checker
}

type LootPreview struct {
	ID                  uuid.UUID `json:"id"`
	PrizeType           string    `json:"prize_type"`
	CollectionSlug      string    `json:"collection_slug"`
	DisplayName         string    `json:"display_name"`
	ImageURL            string    `json:"image_url"`
	RarityLabel         string    `json:"rarity_label"`
	TileBackgroundColor string    `json:"tile_background_color,omitempty"`
	SortOrder           int       `json:"sort_order"`
	FloorPriceNanoton   int64     `json:"floor_price_nanoton,omitempty"`
	AmountNanoton       int64     `json:"amount_nanoton,omitempty"`
}

type CaseView struct {
	ID                uuid.UUID     `json:"id"`
	Slug              string        `json:"slug"`
	Title             string        `json:"title"`
	ImageURL          string        `json:"image_url"`
	AccentColor       string        `json:"accent_color"`
	PriceNanoton      int64         `json:"price_nanoton"`
	Kind              string        `json:"kind"`
	SortOrder         int           `json:"sort_order"`
	RequireChannel    bool          `json:"require_channel"`
	RequiredChannel   string        `json:"required_channel,omitempty"`
	ChannelSubscribed *bool         `json:"channel_subscribed,omitempty"`
	Loot              []LootPreview `json:"loot,omitempty"`
	DailyAvailable    *bool         `json:"daily_available,omitempty"`
	NextAvailableAt   *time.Time    `json:"next_available_at,omitempty"`
}

// AdminLootEntry — loot row for admin CRUD (includes weight).
type AdminLootEntry struct {
	ID                  uuid.UUID `json:"id"`
	PrizeType           string    `json:"prize_type"`
	CollectionSlug      string    `json:"collection_slug"`
	DisplayName         string    `json:"display_name"`
	ImageURL            string    `json:"image_url"`
	RarityLabel         string    `json:"rarity_label"`
	TileBackgroundColor string    `json:"tile_background_color"`
	SortOrder           int       `json:"sort_order"`
	Weight              int       `json:"weight"`
	FloorPriceNanoton   int64     `json:"floor_price_nanoton"`
	AmountNanoton       int64     `json:"amount_nanoton"`
}

// AdminCaseView — full case for admin list/edit.
type AdminCaseView struct {
	ID             uuid.UUID        `json:"id"`
	Slug           string           `json:"slug"`
	Title          string           `json:"title"`
	ImageURL       string           `json:"image_url"`
	AccentColor    string           `json:"accent_color"`
	PriceNanoton   int64            `json:"price_nanoton"`
	Kind           string           `json:"kind"`
	SortOrder      int              `json:"sort_order"`
	Active         bool             `json:"active"`
	RequireChannel bool             `json:"require_channel"`
	TargetRTPBPS   int              `json:"target_rtp_bps"`
	Loot           []AdminLootEntry `json:"loot"`
}

type CatalogView struct {
	Featured       []CaseView `json:"featured"`
	Daily          *CaseView  `json:"daily,omitempty"`
	Catalog        []CaseView `json:"catalog"`
	BannersEnabled bool       `json:"banners_enabled"`
}

type OpenResult struct {
	OpenID       uuid.UUID           `json:"open_id"`
	CaseID       uuid.UUID           `json:"case_id"`
	Source       string              `json:"source"`
	PrizeType    string              `json:"prize_type"`
	PrizeNanoton int64               `json:"prize_nanoton,omitempty"`
	Item         *inventory.ItemView `json:"item,omitempty"`
	LootEntry    LootPreview         `json:"loot_entry"`
	Backed       bool                `json:"backed"`
}

func (s *Service) Catalog(ctx context.Context, userID uuid.UUID) (*CatalogView, error) {
	rows, err := s.cases.ListActive(ctx)
	if err != nil {
		return nil, err
	}
	out := &CatalogView{
		Featured: make([]CaseView, 0),
		Catalog:  make([]CaseView, 0),
	}
	if settings, err := s.cases.GetCatalogSettings(ctx); err == nil && settings != nil {
		out.BannersEnabled = settings.BannersEnabled
	}
	var channelCached *bool
	channelStatus := func() *bool {
		if channelCached != nil {
			return channelCached
		}
		if userID == uuid.Nil {
			return nil
		}
		ok, err := s.isChannelSubscribed(ctx, userID)
		if err != nil {
			ok = false
		}
		channelCached = &ok
		return channelCached
	}
	for _, row := range rows {
		view := s.toCaseView(ctx, row, true)
		if view.RequireChannel {
			if s.requiredChannel != "" {
				view.RequiredChannel = s.requiredChannel
			}
			if sub := channelStatus(); sub != nil {
				v := *sub
				view.ChannelSubscribed = &v
			}
		}
		if userID != uuid.Nil && (row.Kind == domain.CaseKindDaily || isFreeChannelCase(row)) {
			avail, next, _ := s.caseOpenCooldownAvailability(ctx, userID, row.ID)
			view.DailyAvailable = &avail
			if !avail {
				view.NextAvailableAt = next
			}
		}
		switch row.Kind {
		case domain.CaseKindFeatured:
			out.Featured = append(out.Featured, view)
		case domain.CaseKindDaily:
			v := view
			out.Daily = &v
		default:
			out.Catalog = append(out.Catalog, view)
		}
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, idOrSlug string, userID uuid.UUID) (*CaseView, error) {
	c, err := s.findCase(ctx, idOrSlug)
	if err != nil {
		return nil, err
	}
	if !c.Active {
		return nil, domain.ErrCaseUnavailable
	}
	view := s.toCaseView(ctx, *c, true)
	if userID != uuid.Nil && (c.Kind == domain.CaseKindDaily || isFreeChannelCase(*c)) {
		avail, next, _ := s.caseOpenCooldownAvailability(ctx, userID, c.ID)
		view.DailyAvailable = &avail
		if !avail {
			view.NextAvailableAt = next
		}
	}
	s.attachChannelStatus(ctx, &view, userID)
	return &view, nil
}

func (s *Service) Open(ctx context.Context, userID uuid.UUID, idOrSlug, idempotencyKey, promoCode string) (*OpenResult, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if idempotencyKey == "" {
		return nil, domain.ErrInvalidAmount
	}
	if existing, err := s.cases.FindOpenByIdempotency(ctx, idempotencyKey); err == nil && existing != nil {
		return s.openResultFromExisting(ctx, existing)
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	c, err := s.findCase(ctx, idOrSlug)
	if err != nil {
		return nil, err
	}
	if !c.Active {
		return nil, domain.ErrCaseUnavailable
	}

	loot, err := s.cases.ListLootByCase(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	if len(loot) == 0 {
		return nil, domain.ErrCaseNoLoot
	}

	promoCode = strings.ToUpper(strings.TrimSpace(promoCode))
	var promo *domain.CasePromoCode

	source := domain.CaseOpenSourcePaid
	price := c.PriceNanoton
	switch {
	case c.Kind == domain.CaseKindPromo:
		source = domain.CaseOpenSourcePromo
		price = 0
		promo, err = s.validateCasePromo(ctx, userID, c.ID, promoCode)
		if err != nil {
			return nil, err
		}
	case c.Kind == domain.CaseKindDaily:
		source = domain.CaseOpenSourceDaily
		price = 0
		ok, err := s.caseOpenCooldownAvailable(ctx, userID, c.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrCaseCooldown
		}
	case price <= 0:
		// Free catalog/featured cases must require channel subscription.
		if !c.RequireChannel {
			return nil, domain.ErrInvalidAmount
		}
		ok, err := s.caseOpenCooldownAvailable(ctx, userID, c.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrCaseCooldown
		}
		source = domain.CaseOpenSourceFree
		price = 0
	}

	if c.RequireChannel {
		if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
			return nil, err
		}
	}

	entry, roll, err := pickWeighted(loot)
	if err != nil {
		return nil, err
	}

	openID := uuid.New()

	if price > 0 {
		if _, err := s.balance.Debit(ctx, userID, price, domain.LedgerCaseOpen, "case_open", openID); err != nil {
			return nil, err
		}
	}

	prizeType := domain.NormalizeCasePrizeType(entry.PrizeType)
	var item *domain.InventoryItem
	var itemView *inventory.ItemView
	var backed bool
	var prizeNanoton int64

	if prizeType == domain.CasePrizeTypeTon {
		prizeNanoton = domain.CaseLootPrizeValueNanoton(entry)
		if prizeNanoton <= 0 {
			if price > 0 {
				_, _ = s.balance.Credit(ctx, userID, price, domain.LedgerRefund, "case_open", openID)
			}
			return nil, domain.ErrInvalidAmount
		}
		if _, err := s.balance.Credit(ctx, userID, prizeNanoton, domain.LedgerCasePrize, "case_open", openID); err != nil {
			if price > 0 {
				_, _ = s.balance.Credit(ctx, userID, price, domain.LedgerRefund, "case_open", openID)
			}
			return nil, err
		}
	} else {
		granted, isBacked, err := s.grantPrize(ctx, userID, openID, *c, entry)
		if err != nil {
			if price > 0 {
				_, _ = s.balance.Credit(ctx, userID, price, domain.LedgerRefund, "case_open", openID)
			}
			return nil, err
		}
		item = granted
		backed = isBacked
		view := inventory.BuildItemView(ctx, s.valuator, *item)
		itemView = &view
		prizeNanoton = view.ValuationNanoton
		if prizeNanoton <= 0 {
			prizeNanoton = view.FloorPriceNanoton
		}
	}

	open := &domain.CaseOpen{
		ID:               openID,
		UserID:           userID,
		CaseID:           c.ID,
		PricePaidNanoton: price,
		Source:           source,
		RngRoll:          roll,
		LootEntryID:      entry.ID,
		PrizeType:        prizeType,
		PrizeNanoton:     prizeNanoton,
		IdempotencyKey:   idempotencyKey,
		CreatedAt:        time.Now().UTC(),
	}
	if item != nil {
		id := item.ID
		open.InventoryItemID = &id
	}
	if err := s.cases.CreateOpen(ctx, open); err != nil {
		if existing, findErr := s.cases.FindOpenByIdempotency(ctx, idempotencyKey); findErr == nil && existing != nil {
			return s.openResultFromExisting(ctx, existing)
		}
		return nil, err
	}

	if promo != nil {
		if err := s.cases.CreateCasePromoRedemption(ctx, &domain.CasePromoRedemption{
			UserID:     userID,
			Code:       promo.Code,
			CaseID:     c.ID,
			CaseOpenID: openID,
		}); err != nil {
			return nil, err
		}
		if err := s.cases.IncrementCasePromoUsed(ctx, promo.Code); err != nil {
			return nil, err
		}
	}

	result := &OpenResult{
		OpenID:       openID,
		CaseID:       c.ID,
		Source:       source,
		PrizeType:    prizeType,
		PrizeNanoton: prizeNanoton,
		Item:         itemView,
		LootEntry:    toLootPreview(entry),
		Backed:       backed,
	}
	if s.live != nil {
		s.live.PublishCaseLiveDrop(ctx, liveDropFromEntry(openID, entry, open.CreatedAt))
	}
	if s.admin != nil {
		actor := telegram.AdminActor{}
		if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
			actor = telegram.AdminActor{
				TelegramID: user.TelegramID,
				Username:   user.Username,
				FirstName:  user.FirstName,
				LastName:   user.LastName,
			}
		}
		prizeName := entry.DisplayName
		if itemView != nil && itemView.Name != "" {
			prizeName = itemView.Name
		}
		if prizeType == domain.CasePrizeTypeTon && prizeName == "" {
			prizeName = "TON"
		}
		s.admin.NotifyCaseOpen(ctx, actor, c.Title, prizeName, string(source), price, prizeNanoton, backed)
	}
	return result, nil
}

func (s *Service) validateCasePromo(ctx context.Context, userID, caseID uuid.UUID, code string) (*domain.CasePromoCode, error) {
	if code == "" {
		return nil, domain.ErrPromoInvalid
	}
	redeemed, err := s.cases.HasRedeemedCasePromoCode(ctx, userID, code)
	if err != nil {
		return nil, err
	}
	if redeemed {
		return nil, domain.ErrPromoAlreadyRedeemed
	}
	promo, err := s.cases.GetCasePromoCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if promo.CaseID != caseID {
		return nil, domain.ErrPromoInvalid
	}
	if !promo.Active {
		return nil, domain.ErrPromoInvalid
	}
	if promo.ExpiresAt != nil && time.Now().UTC().After(*promo.ExpiresAt) {
		return nil, domain.ErrPromoExpired
	}
	if promo.MaxUses > 0 && promo.UsedCount >= promo.MaxUses {
		return nil, domain.ErrPromoExhausted
	}
	return promo, nil
}

func (s *Service) ListOpens(ctx context.Context, userID uuid.UUID, limit int) ([]OpenResult, error) {
	opens, err := s.cases.ListOpensByUser(ctx, userID, limit)
	if err != nil {
		return nil, err
	}
	out := make([]OpenResult, 0, len(opens))
	for i := range opens {
		res, err := s.openResultFromExisting(ctx, &opens[i])
		if err != nil {
			continue
		}
		out = append(out, *res)
	}
	return out, nil
}

func (s *Service) LiveFeed(ctx context.Context, limit int) ([]domain.CaseLiveDrop, error) {
	if limit <= 0 {
		limit = 6
	}
	rows, err := s.cases.ListRecentOpens(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CaseLiveDrop, 0, limit*2)
	seen := make(map[uuid.UUID]struct{}, limit*2)
	appendDrop := func(row domain.CaseLiveDrop) {
		if _, ok := seen[row.OpenID]; ok {
			return
		}
		seen[row.OpenID] = struct{}{}
		if row.PrizeType != domain.CasePrizeTypeTon {
			img := row.ImageURL
			if img == "" {
				img = giftimage.FragmentURL(row.CollectionSlug)
			}
			row.ImageURL = img
		}
		out = append(out, row)
	}
	if s.feedBuf != nil {
		for _, row := range s.feedBuf.Snapshot() {
			appendDrop(row)
		}
	}
	for _, row := range rows {
		appendDrop(row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (s *Service) AdminGetLiveFeedSettings(ctx context.Context) (*domain.CaseLiveFeedSettings, error) {
	cfg, err := s.cases.GetLiveFeedSettings(ctx)
	if err != nil {
		return nil, err
	}
	NormalizeLiveFeedSettings(cfg)
	return cfg, nil
}

func (s *Service) AdminUpdateLiveFeedSettings(ctx context.Context, cfg domain.CaseLiveFeedSettings) (*domain.CaseLiveFeedSettings, error) {
	NormalizeLiveFeedSettings(&cfg)
	if err := s.cases.UpdateLiveFeedSettings(ctx, &cfg); err != nil {
		return nil, err
	}
	if s.liveSim != nil {
		s.liveSim.ApplySettings(cfg)
	}
	return s.AdminGetLiveFeedSettings(ctx)
}

// Admin CRUD

func (s *Service) AdminList(ctx context.Context) ([]AdminCaseView, error) {
	rows, err := s.cases.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminCaseView, 0, len(rows))
	for _, row := range rows {
		view := AdminCaseView{
			ID:             row.ID,
			Slug:           row.Slug,
			Title:          row.Title,
			ImageURL:       row.ImageURL,
			AccentColor:    row.AccentColor,
			PriceNanoton:   row.PriceNanoton,
			Kind:           row.Kind,
			SortOrder:      row.SortOrder,
			Active:         row.Active,
			RequireChannel: row.RequireChannel,
			TargetRTPBPS:   row.TargetRTPBPS,
			Loot:           []AdminLootEntry{},
		}
		if loot, err := s.cases.ListLootByCase(ctx, row.ID); err == nil {
			view.Loot = make([]AdminLootEntry, 0, len(loot))
			for _, e := range loot {
				preview := toLootPreview(e)
				view.Loot = append(view.Loot, AdminLootEntry{
					ID:                  e.ID,
					PrizeType:           preview.PrizeType,
					CollectionSlug:      e.CollectionSlug,
					DisplayName:         preview.DisplayName,
					ImageURL:            preview.ImageURL,
					RarityLabel:         e.RarityLabel,
					TileBackgroundColor: e.TileBackgroundColor,
					SortOrder:           e.SortOrder,
					Weight:              e.Weight,
					FloorPriceNanoton:   e.FloorPriceNanoton,
					AmountNanoton:       e.AmountNanoton,
				})
			}
		}
		out = append(out, view)
	}
	return out, nil
}

func (s *Service) AdminUpsertCase(ctx context.Context, c *domain.Case) error {
	if c.Kind == "" {
		c.Kind = domain.CaseKindCatalog
	}
	if strings.TrimSpace(c.AccentColor) == "" {
		c.AccentColor = "#3b82f6"
	}
	if c.Kind == domain.CaseKindPromo {
		c.PriceNanoton = 0
	}
	if c.Kind != domain.CaseKindDaily && c.Kind != domain.CaseKindPromo && c.PriceNanoton <= 0 && !c.RequireChannel {
		return fmt.Errorf("бесплатный кейс требует подписку на канал (require_channel)")
	}
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
		return s.cases.CreateCase(ctx, c)
	}
	return s.cases.UpdateCase(ctx, c)
}

func (s *Service) AdminListCasePromoCodes(ctx context.Context, caseID *uuid.UUID) ([]domain.CasePromoCode, error) {
	return s.cases.ListCasePromoCodes(ctx, caseID)
}

func (s *Service) AdminUpsertCasePromoCode(ctx context.Context, promo *domain.CasePromoCode) error {
	promo.Code = strings.ToUpper(strings.TrimSpace(promo.Code))
	if promo.Code == "" {
		return domain.ErrPromoInvalid
	}
	if promo.CaseID == uuid.Nil {
		return domain.ErrInvalidAmount
	}
	c, err := s.cases.FindByID(ctx, promo.CaseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domain.ErrNotFound
		}
		return err
	}
	if c.Kind != domain.CaseKindPromo {
		return fmt.Errorf("промокод можно привязать только к кейсу типа promo")
	}
	if promo.MaxUses < 0 {
		promo.MaxUses = 0
	}
	if existing, err := s.cases.GetCasePromoCode(ctx, promo.Code); err == nil && existing != nil {
		if existing.CaseID != promo.CaseID {
			return fmt.Errorf("промокод уже привязан к другому кейсу")
		}
		promo.UsedCount = existing.UsedCount
		promo.CreatedAt = existing.CreatedAt
	} else if err != nil && !errors.Is(err, domain.ErrPromoInvalid) {
		return err
	}
	return s.cases.UpsertCasePromoCode(ctx, promo)
}

func (s *Service) AdminDeleteCasePromoCode(ctx context.Context, code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return domain.ErrPromoInvalid
	}
	return s.cases.DeleteCasePromoCode(ctx, code)
}

func (s *Service) AdminGetCatalogSettings(ctx context.Context) (*domain.CaseCatalogSettings, error) {
	return s.cases.GetCatalogSettings(ctx)
}

func (s *Service) AdminUpdateCatalogSettings(ctx context.Context, bannersEnabled bool) (*domain.CaseCatalogSettings, error) {
	settings := &domain.CaseCatalogSettings{
		ID:             1,
		BannersEnabled: bannersEnabled,
	}
	if err := s.cases.UpdateCatalogSettings(ctx, settings); err != nil {
		return nil, err
	}
	return s.cases.GetCatalogSettings(ctx)
}

func (s *Service) AdminReplaceLoot(ctx context.Context, caseID uuid.UUID, entries []domain.CaseLootEntry) error {
	if _, err := s.cases.FindByID(ctx, caseID); err != nil {
		return err
	}
	for i := range entries {
		if entries[i].Weight <= 0 {
			return domain.ErrInvalidAmount
		}
		if entries[i].FloorPriceNanoton < 0 || entries[i].AmountNanoton < 0 {
			return domain.ErrInvalidAmount
		}
		prizeType := domain.NormalizeCasePrizeType(entries[i].PrizeType)
		entries[i].PrizeType = prizeType
		entries[i].DisplayName = strings.TrimSpace(entries[i].DisplayName)
		entries[i].TileBackgroundColor = domain.NormalizeLootTileBackgroundColor(entries[i].TileBackgroundColor)

		if prizeType == domain.CasePrizeTypeTon {
			if entries[i].AmountNanoton <= 0 {
				return domain.ErrInvalidAmount
			}
			entries[i].CollectionSlug = ""
			if entries[i].DisplayName == "" {
				entries[i].DisplayName = "TON"
			}
			// Keep floor in sync so RTP/live feed use the cash amount.
			entries[i].FloorPriceNanoton = entries[i].AmountNanoton
			continue
		}

		entries[i].CollectionSlug = strings.ToLower(strings.TrimSpace(entries[i].CollectionSlug))
		if entries[i].CollectionSlug == "" {
			return domain.ErrInvalidAmount
		}
		entries[i].AmountNanoton = 0
		if entries[i].DisplayName == "" {
			entries[i].DisplayName = entries[i].CollectionSlug
		}
	}
	if err := s.cases.ReplaceLoot(ctx, caseID, entries); err != nil {
		return err
	}
	if s.liveSim != nil {
		s.liveSim.InvalidateLootPool()
	}
	return nil
}

func (s *Service) grantPrize(
	ctx context.Context,
	userID, openID uuid.UUID,
	c domain.Case,
	entry domain.CaseLootEntry,
) (*domain.InventoryItem, bool, error) {
	floor := entry.FloorPriceNanoton
	if floor <= 0 {
		floor = s.quoteCollectionFloor(ctx, entry.CollectionSlug)
	}
	txRef := domain.CaseClaimTxRefPrefix + openID.String()
	imageURL := entry.ImageURL
	if imageURL == "" {
		imageURL = giftimage.FragmentURL(entry.CollectionSlug)
	}

	// Best-effort: take a real gift from bot house stock.
	if s.bot != nil {
		if botUser, err := s.bot.EnsureBotUser(ctx); err == nil && botUser != nil {
			if house, err := s.inventory.TakeHouseGiftForCollection(ctx, botUser.ID, userID, entry.CollectionSlug); err == nil && house != nil {
				meta, _ := json.Marshal(map[string]any{
					"fulfillment":    domain.CaseFulfillmentBacked,
					"case_id":        c.ID.String(),
					"case_slug":      c.Slug,
					"loot_entry_id":  entry.ID.String(),
					"collection":     entry.CollectionSlug,
				})
				_ = s.inventory.BindTelegramGift(ctx, house.ID, house.TelegramGiftID, house.ImageURL, meta, domain.CaseFulfillmentBacked)
				// Stamp case tx_ref via promote-style update is not available; leave original tx_ref.
				house.Metadata = datatypes.JSON(meta)
				return house, true, nil
			}
		}
	}

	meta, _ := json.Marshal(map[string]any{
		"fulfillment":   domain.CaseFulfillmentUnbacked,
		"case_id":       c.ID.String(),
		"case_slug":     c.Slug,
		"loot_entry_id": entry.ID.String(),
		"collection":    entry.CollectionSlug,
	})
	now := time.Now().UTC()
	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            userID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    "",
		CollectionSlug:    entry.CollectionSlug,
		Name:              entry.DisplayName,
		ImageURL:          imageURL,
		Metadata:          datatypes.JSON(meta),
		FloorPriceNanoton: floor,
		Status:            domain.InvAvailable,
		DepositedAt:       now,
		TelegramTxRef:     txRef,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.inventory.Create(ctx, item); err != nil {
		return nil, false, err
	}
	return item, false, nil
}

func (s *Service) quoteCollectionFloor(ctx context.Context, collectionSlug string) int64 {
	if price, err := s.inventory.GetFloorPrice(ctx, collectionSlug); err == nil && price > 0 {
		return price
	}
	if s.valuator != nil {
		sg := gifts.ScannedGiftFromItem(domain.InventoryItem{
			CollectionSlug: collectionSlug,
			Name:           collectionSlug,
		})
		if price, _ := s.valuator.QuoteBuyback(ctx, sg); price > 0 {
			return price
		}
	}
	return 0
}

func (s *Service) findCase(ctx context.Context, idOrSlug string) (*domain.Case, error) {
	idOrSlug = strings.TrimSpace(idOrSlug)
	if id, err := uuid.Parse(idOrSlug); err == nil {
		c, err := s.cases.FindByID(ctx, id)
		if err == nil {
			return c, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	c, err := s.cases.FindBySlug(ctx, idOrSlug)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return c, nil
}

func (s *Service) caseOpenCooldownAvailability(ctx context.Context, userID, caseID uuid.UUID) (bool, *time.Time, error) {
	open, err := s.cases.FindLatestOpenByUserCase(ctx, userID, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true, nil, nil
		}
		return false, nil, err
	}
	now := time.Now().UTC()
	next := open.CreatedAt.UTC().Add(caseOpenCooldown)
	if !now.Before(next) {
		return true, nil, nil
	}
	return false, &next, nil
}

func (s *Service) caseOpenCooldownAvailable(ctx context.Context, userID, caseID uuid.UUID) (bool, error) {
	ok, _, err := s.caseOpenCooldownAvailability(ctx, userID, caseID)
	return ok, err
}

const caseOpenCooldown = 24 * time.Hour

func isFreeChannelCase(c domain.Case) bool {
	if c.Kind == domain.CaseKindDaily || c.Kind == domain.CaseKindPromo {
		return false
	}
	return c.PriceNanoton <= 0 && c.RequireChannel
}

func caseOpenCooldownElapsed(lastOpenAt *time.Time, now time.Time) bool {
	if lastOpenAt == nil {
		return true
	}
	return !now.UTC().Before(lastOpenAt.UTC().Add(caseOpenCooldown))
}

func (s *Service) toCaseView(ctx context.Context, c domain.Case, withLoot bool) CaseView {
	view := CaseView{
		ID:             c.ID,
		Slug:           c.Slug,
		Title:          c.Title,
		ImageURL:       c.ImageURL,
		AccentColor:    c.AccentColor,
		PriceNanoton:   c.PriceNanoton,
		Kind:           c.Kind,
		SortOrder:      c.SortOrder,
		RequireChannel: c.RequireChannel,
	}
	if c.RequireChannel && s.requiredChannel != "" {
		view.RequiredChannel = s.requiredChannel
	}
	if withLoot {
		if loot, err := s.cases.ListLootByCase(ctx, c.ID); err == nil {
			view.Loot = make([]LootPreview, 0, len(loot))
			for _, e := range loot {
				preview := toLootPreview(e)
				if preview.PrizeType != domain.CasePrizeTypeTon && preview.FloorPriceNanoton <= 0 {
					preview.FloorPriceNanoton = s.quoteCollectionFloor(ctx, e.CollectionSlug)
				}
				view.Loot = append(view.Loot, preview)
			}
		}
	}
	return view
}

func (s *Service) attachChannelStatus(ctx context.Context, view *CaseView, userID uuid.UUID) {
	if view == nil || !view.RequireChannel {
		return
	}
	if s.requiredChannel != "" {
		view.RequiredChannel = s.requiredChannel
	}
	if userID == uuid.Nil {
		return
	}
	ok, err := s.isChannelSubscribed(ctx, userID)
	if err != nil {
		ok = false
	}
	view.ChannelSubscribed = &ok
}

func (s *Service) ensureChannelSubscribed(ctx context.Context, userID uuid.UUID) error {
	if s.requiredChannel == "" || s.channelChecker == nil {
		// Misconfigured: cannot verify — fail closed for gated cases.
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.TelegramID <= 0 {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	member, err := s.channelChecker.IsChannelMember(ctx, s.requiredChannel, user.TelegramID)
	if err != nil {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	if !member {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	return nil
}

func (s *Service) isChannelSubscribed(ctx context.Context, userID uuid.UUID) (bool, error) {
	if s.requiredChannel == "" || s.channelChecker == nil {
		return false, nil
	}
	err := s.ensureChannelSubscribed(ctx, userID)
	if err == nil {
		return true, nil
	}
	var channelErr *ChannelNotSubscribedError
	if errors.As(err, &channelErr) || errors.Is(err, domain.ErrChannelNotSubscribed) {
		return false, nil
	}
	return false, err
}

func (s *Service) openResultFromExisting(ctx context.Context, open *domain.CaseOpen) (*OpenResult, error) {
	preview := LootPreview{}
	if loot, err := s.cases.ListLootByCase(ctx, open.CaseID); err == nil {
		for _, e := range loot {
			if e.ID == open.LootEntryID {
				preview = toLootPreview(e)
				break
			}
		}
	}
	prizeType := domain.NormalizeCasePrizeType(open.PrizeType)
	if prizeType == "" || (open.PrizeType == "" && preview.PrizeType != "") {
		prizeType = domain.NormalizeCasePrizeType(preview.PrizeType)
	}
	result := &OpenResult{
		OpenID:       open.ID,
		CaseID:       open.CaseID,
		Source:       open.Source,
		PrizeType:    prizeType,
		PrizeNanoton: open.PrizeNanoton,
		LootEntry:    preview,
	}
	if prizeType == domain.CasePrizeTypeTon {
		if result.PrizeNanoton <= 0 {
			result.PrizeNanoton = domain.CaseLootPrizeValueNanoton(domain.CaseLootEntry{
				PrizeType:         prizeType,
				AmountNanoton:     preview.AmountNanoton,
				FloorPriceNanoton: preview.FloorPriceNanoton,
			})
		}
		return result, nil
	}
	if open.InventoryItemID == nil {
		return nil, domain.ErrNotFound
	}
	item, err := s.inventory.FindByID(ctx, *open.InventoryItemID)
	if err != nil {
		return nil, err
	}
	view := inventory.BuildItemView(ctx, s.valuator, *item)
	result.Item = &view
	result.Backed = !domain.IsUnbackedCaseClaim(*item)
	if result.PrizeNanoton <= 0 {
		result.PrizeNanoton = view.ValuationNanoton
		if result.PrizeNanoton <= 0 {
			result.PrizeNanoton = view.FloorPriceNanoton
		}
	}
	return result, nil
}

func toLootPreview(e domain.CaseLootEntry) LootPreview {
	prizeType := domain.NormalizeCasePrizeType(e.PrizeType)
	img := e.ImageURL
	name := e.DisplayName
	floor := e.FloorPriceNanoton
	if prizeType == domain.CasePrizeTypeTon {
		if name == "" {
			name = "TON"
		}
		if floor <= 0 {
			floor = e.AmountNanoton
		}
	} else if img == "" && e.CollectionSlug != "" {
		img = giftimage.FragmentURL(e.CollectionSlug)
	}
	return LootPreview{
		ID:                  e.ID,
		PrizeType:           prizeType,
		CollectionSlug:      e.CollectionSlug,
		DisplayName:         name,
		ImageURL:            img,
		RarityLabel:         e.RarityLabel,
		TileBackgroundColor: e.TileBackgroundColor,
		SortOrder:           e.SortOrder,
		FloorPriceNanoton:   floor,
		AmountNanoton:       e.AmountNanoton,
	}
}

func liveDropFromEntry(openID uuid.UUID, entry domain.CaseLootEntry, createdAt time.Time) domain.CaseLiveDrop {
	preview := toLootPreview(entry)
	return domain.CaseLiveDrop{
		OpenID:              openID,
		PrizeType:           preview.PrizeType,
		CollectionSlug:      preview.CollectionSlug,
		DisplayName:         preview.DisplayName,
		ImageURL:            preview.ImageURL,
		RarityLabel:         preview.RarityLabel,
		TileBackgroundColor: preview.TileBackgroundColor,
		FloorPriceNanoton:   domain.CaseLootPrizeValueNanoton(entry),
		CreatedAt:           createdAt,
	}
}

func pickWeighted(entries []domain.CaseLootEntry) (domain.CaseLootEntry, int, error) {
	total := 0
	for _, e := range entries {
		if e.Weight > 0 {
			total += e.Weight
		}
	}
	if total <= 0 {
		return domain.CaseLootEntry{}, 0, domain.ErrCaseNoLoot
	}
	roll, err := secureIntn(total)
	if err != nil {
		return domain.CaseLootEntry{}, 0, err
	}
	cursor := 0
	for _, e := range entries {
		if e.Weight <= 0 {
			continue
		}
		cursor += e.Weight
		if roll < cursor {
			return e, roll, nil
		}
	}
	return entries[len(entries)-1], roll, nil
}

func secureIntn(n int) (int, error) {
	if n <= 0 {
		return 0, fmt.Errorf("invalid n")
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0, err
	}
	return int(binary.BigEndian.Uint64(b[:]) % uint64(n)), nil
}
