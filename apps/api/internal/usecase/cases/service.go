package cases

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
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
	cases            domain.CaseRepository
	inventory        domain.InventoryRepository
	users            domain.UserRepository
	balance          *balance.Service
	valuator         *gifts.Valuator
	bot              BotUserResolver
	requiredChannel  string
	channelChecker   ChannelChecker
}

func NewService(
	caseRepo domain.CaseRepository,
	invRepo domain.InventoryRepository,
	users domain.UserRepository,
	balanceSvc *balance.Service,
) *Service {
	return &Service{cases: caseRepo, inventory: invRepo, users: users, balance: balanceSvc}
}

func (s *Service) SetValuator(v *gifts.Valuator) { s.valuator = v }
func (s *Service) SetBotResolver(bot BotUserResolver) { s.bot = bot }
func (s *Service) SetChannelRequirement(channel string, checker ChannelChecker) {
	s.requiredChannel = strings.TrimSpace(channel)
	s.channelChecker = checker
}

type LootPreview struct {
	ID               uuid.UUID `json:"id"`
	CollectionSlug   string    `json:"collection_slug"`
	DisplayName      string    `json:"display_name"`
	ImageURL         string    `json:"image_url"`
	RarityLabel      string    `json:"rarity_label"`
	SortOrder        int       `json:"sort_order"`
	FloorPriceNanoton int64    `json:"floor_price_nanoton,omitempty"`
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
}

// AdminLootEntry — loot row for admin CRUD (includes weight).
type AdminLootEntry struct {
	ID             uuid.UUID `json:"id"`
	CollectionSlug string    `json:"collection_slug"`
	DisplayName    string    `json:"display_name"`
	ImageURL       string    `json:"image_url"`
	RarityLabel    string    `json:"rarity_label"`
	SortOrder      int       `json:"sort_order"`
	Weight         int       `json:"weight"`
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
	Featured []CaseView `json:"featured"`
	Daily    *CaseView  `json:"daily,omitempty"`
	Catalog  []CaseView `json:"catalog"`
}

type OpenResult struct {
	OpenID    uuid.UUID           `json:"open_id"`
	CaseID    uuid.UUID           `json:"case_id"`
	Source    string              `json:"source"`
	Item      inventory.ItemView  `json:"item"`
	LootEntry LootPreview         `json:"loot_entry"`
	Backed    bool                `json:"backed"`
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
	var dailyAvail bool
	if userID != uuid.Nil {
		dailyAvail, _ = s.dailyAvailable(ctx, userID)
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
		switch row.Kind {
		case domain.CaseKindFeatured:
			out.Featured = append(out.Featured, view)
		case domain.CaseKindDaily:
			v := view
			avail := dailyAvail
			v.DailyAvailable = &avail
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
	if c.Kind == domain.CaseKindDaily && userID != uuid.Nil {
		avail, _ := s.dailyAvailable(ctx, userID)
		view.DailyAvailable = &avail
	}
	s.attachChannelStatus(ctx, &view, userID)
	return &view, nil
}

func (s *Service) Open(ctx context.Context, userID uuid.UUID, idOrSlug, idempotencyKey string) (*OpenResult, error) {
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

	source := domain.CaseOpenSourcePaid
	price := c.PriceNanoton
	if c.Kind == domain.CaseKindDaily {
		source = domain.CaseOpenSourceDaily
		price = 0
		ok, err := s.dailyAvailable(ctx, userID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrCaseDailyUsed
		}
	} else if price <= 0 {
		// Free catalog/featured cases must require channel subscription.
		if !c.RequireChannel {
			return nil, domain.ErrInvalidAmount
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

	item, backed, err := s.grantPrize(ctx, userID, openID, *c, entry)
	if err != nil {
		if price > 0 {
			_, _ = s.balance.Credit(ctx, userID, price, domain.LedgerRefund, "case_open", openID)
		}
		return nil, err
	}

	open := &domain.CaseOpen{
		ID:               openID,
		UserID:           userID,
		CaseID:           c.ID,
		PricePaidNanoton: price,
		Source:           source,
		RngRoll:          roll,
		LootEntryID:      entry.ID,
		InventoryItemID:  item.ID,
		IdempotencyKey:   idempotencyKey,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.cases.CreateOpen(ctx, open); err != nil {
		if existing, findErr := s.cases.FindOpenByIdempotency(ctx, idempotencyKey); findErr == nil && existing != nil {
			return s.openResultFromExisting(ctx, existing)
		}
		return nil, err
	}

	if c.Kind == domain.CaseKindDaily {
		state, err := s.cases.GetOrCreateState(ctx, userID)
		if err != nil {
			return nil, err
		}
		day := mskCalendarDate(time.Now())
		state.LastDailyOpenDate = &day
		if err := s.cases.SaveState(ctx, state); err != nil {
			return nil, err
		}
	}

	view := inventory.BuildItemView(ctx, s.valuator, *item)
	return &OpenResult{
		OpenID:    openID,
		CaseID:    c.ID,
		Source:    source,
		Item:      view,
		LootEntry: toLootPreview(entry),
		Backed:    backed,
	}, nil
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
				img := e.ImageURL
				if img == "" {
					img = giftimage.FragmentURL(e.CollectionSlug)
				}
				view.Loot = append(view.Loot, AdminLootEntry{
					ID:             e.ID,
					CollectionSlug: e.CollectionSlug,
					DisplayName:    e.DisplayName,
					ImageURL:       img,
					RarityLabel:    e.RarityLabel,
					SortOrder:      e.SortOrder,
					Weight:         e.Weight,
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
	if c.Kind != domain.CaseKindDaily && c.PriceNanoton <= 0 && !c.RequireChannel {
		return fmt.Errorf("бесплатный кейс требует подписку на канал (require_channel)")
	}
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
		return s.cases.CreateCase(ctx, c)
	}
	return s.cases.UpdateCase(ctx, c)
}

func (s *Service) AdminReplaceLoot(ctx context.Context, caseID uuid.UUID, entries []domain.CaseLootEntry) error {
	if _, err := s.cases.FindByID(ctx, caseID); err != nil {
		return err
	}
	for i := range entries {
		if entries[i].Weight <= 0 {
			return domain.ErrInvalidAmount
		}
		entries[i].CollectionSlug = strings.ToLower(strings.TrimSpace(entries[i].CollectionSlug))
		if entries[i].CollectionSlug == "" {
			return domain.ErrInvalidAmount
		}
		entries[i].DisplayName = strings.TrimSpace(entries[i].DisplayName)
		if entries[i].DisplayName == "" {
			entries[i].DisplayName = entries[i].CollectionSlug
		}
	}
	return s.cases.ReplaceLoot(ctx, caseID, entries)
}

func (s *Service) grantPrize(
	ctx context.Context,
	userID, openID uuid.UUID,
	c domain.Case,
	entry domain.CaseLootEntry,
) (*domain.InventoryItem, bool, error) {
	floor := s.quoteCollectionFloor(ctx, entry.CollectionSlug)
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

func (s *Service) dailyAvailable(ctx context.Context, userID uuid.UUID) (bool, error) {
	state, err := s.cases.GetOrCreateState(ctx, userID)
	if err != nil {
		return false, err
	}
	today := mskCalendarDate(time.Now())
	if state.LastDailyOpenDate == nil {
		return true, nil
	}
	last := state.LastDailyOpenDate.UTC()
	return !(last.Year() == today.Year() && last.Month() == today.Month() && last.Day() == today.Day()), nil
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
				preview.FloorPriceNanoton = s.quoteCollectionFloor(ctx, e.CollectionSlug)
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
	item, err := s.inventory.FindByID(ctx, open.InventoryItemID)
	if err != nil {
		return nil, err
	}
	view := inventory.BuildItemView(ctx, s.valuator, *item)
	preview := LootPreview{}
	if loot, err := s.cases.ListLootByCase(ctx, open.CaseID); err == nil {
		for _, e := range loot {
			if e.ID == open.LootEntryID {
				preview = toLootPreview(e)
				break
			}
		}
	}
	return &OpenResult{
		OpenID:    open.ID,
		CaseID:    open.CaseID,
		Source:    open.Source,
		Item:      view,
		LootEntry: preview,
		Backed:    !domain.IsUnbackedCaseClaim(*item),
	}, nil
}

func toLootPreview(e domain.CaseLootEntry) LootPreview {
	img := e.ImageURL
	if img == "" {
		img = giftimage.FragmentURL(e.CollectionSlug)
	}
	return LootPreview{
		ID:             e.ID,
		CollectionSlug: e.CollectionSlug,
		DisplayName:    e.DisplayName,
		ImageURL:       img,
		RarityLabel:    e.RarityLabel,
		SortOrder:      e.SortOrder,
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

func mskCalendarDate(now time.Time) time.Time {
	msk := time.FixedZone("MSK", 3*60*60)
	local := now.In(msk)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}
