package cases

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
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
	entitlements    domain.DailyQuestRepository
	valuator        *gifts.Valuator
	bot             BotUserResolver
	deposits        DepositSummer
	requiredChannel string
	channelChecker  ChannelChecker
	admin           AdminCaseNotifier
	userNotifier    CaseUserNotifier
	live            LiveDropPublisher
	feedBuf         *liveDropBuffer
	liveSim         *LiveSim
	isAdmin         func(telegramID int64) bool
	botAPI          *telegram.BotAPI
	botUsername     string
	webAppShortName string
	webAppURL       string
}

// DepositSummer sums successful TON/payment deposits for a user (nanoton).
type DepositSummer interface {
	SumDeposits(ctx context.Context, userID uuid.UUID) (int64, error)
}

// CaseUserNotifier sends user-facing Telegram messages about cases.
type CaseUserNotifier interface {
	SendCaseDailyReady(ctx context.Context, telegramUserID int64, caseTitle, caseSlug string) error
}

type AdminCaseNotifier interface {
	NotifyCaseOpen(ctx context.Context, actor telegram.AdminActor, caseTitle, prizeName, source string, priceNanoton, prizeFloorNanoton int64, backed bool)
	NotifyPromoActivationFailed(ctx context.Context, actor telegram.AdminActor, code, reason string)
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

func (s *Service) SetEntitlements(repo domain.DailyQuestRepository) {
	s.entitlements = repo
}

func (s *Service) SetValuator(v *gifts.Valuator)               { s.valuator = v }
func (s *Service) SetBotResolver(bot BotUserResolver)          { s.bot = bot }
func (s *Service) SetDepositSummer(d DepositSummer)            { s.deposits = d }
func (s *Service) SetAdminNotifier(notifier AdminCaseNotifier) { s.admin = notifier }
func (s *Service) SetUserNotifier(notifier CaseUserNotifier)   { s.userNotifier = notifier }
func (s *Service) SetLiveDropPublisher(publisher LiveDropPublisher) {
	s.live = NewBufferingLivePublisher(publisher, s.feedBuf)
}
func (s *Service) LiveSim() *LiveSim { return s.liveSim }
func (s *Service) SetChannelRequirement(channel string, checker ChannelChecker) {
	s.requiredChannel = strings.TrimSpace(channel)
	s.channelChecker = checker
}

func (s *Service) SetAdminChecker(isAdmin func(telegramID int64) bool) {
	s.isAdmin = isAdmin
}

func (s *Service) SetPreparedShareBot(api *telegram.BotAPI, botUsername, webAppShortName, webAppURL string) {
	s.botAPI = api
	s.botUsername = strings.TrimPrefix(strings.TrimSpace(botUsername), "@")
	s.webAppShortName = strings.Trim(strings.TrimSpace(webAppShortName), "/")
	s.webAppURL = strings.TrimRight(strings.TrimSpace(webAppURL), "/")
}

func (s *Service) telegramIsAdmin(telegramID int64) bool {
	return s.isAdmin != nil && telegramID > 0 && s.isAdmin(telegramID)
}

type LootPreview struct {
	ID                  uuid.UUID `json:"id"`
	PrizeType           string    `json:"prize_type"`
	CollectionSlug      string    `json:"collection_slug"`
	CollectionName      string    `json:"collection_name,omitempty"`
	ModelName           string    `json:"model_name,omitempty"`
	Backdrop            string    `json:"backdrop,omitempty"`
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
	RequiredNameTag   string        `json:"required_name_tag,omitempty"`
	RequireShare      bool          `json:"require_share"`
	NameTagOK         *bool         `json:"name_tag_ok,omitempty"`
	ShareDone         *bool         `json:"share_done,omitempty"`
	Loot              []LootPreview `json:"loot,omitempty"`
	DailyAvailable    *bool         `json:"daily_available,omitempty"`
	NextAvailableAt   *time.Time    `json:"next_available_at,omitempty"`
	// FreeOpenAvailable — user has an unused daily-quest free open for this case.
	FreeOpenAvailable bool `json:"free_open_available,omitempty"`
}

// AdminLootEntry — loot row for admin CRUD (includes weight).
type AdminLootEntry struct {
	ID                  uuid.UUID `json:"id"`
	PrizeType           string    `json:"prize_type"`
	CollectionSlug      string    `json:"collection_slug"`
	CollectionName      string    `json:"collection_name,omitempty"`
	ModelName           string    `json:"model_name,omitempty"`
	Backdrop            string    `json:"backdrop,omitempty"`
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
	ID              uuid.UUID        `json:"id"`
	Slug            string           `json:"slug"`
	Title           string           `json:"title"`
	TitleEN         string           `json:"title_en"`
	TitleRU         string           `json:"title_ru"`
	ImageURL        string           `json:"image_url"`
	AccentColor     string           `json:"accent_color"`
	PriceNanoton    int64            `json:"price_nanoton"`
	Kind            string           `json:"kind"`
	SortOrder       int              `json:"sort_order"`
	Active          bool             `json:"active"`
	RequireChannel  bool             `json:"require_channel"`
	RequiredNameTag string           `json:"required_name_tag"`
	RequireShare    bool             `json:"require_share"`
	TargetRTPBPS    int              `json:"target_rtp_bps"`
	Loot            []AdminLootEntry `json:"loot"`
}

type CatalogView struct {
	Featured       []CaseView `json:"featured"`
	Daily          *CaseView  `json:"daily,omitempty"`
	Catalog        []CaseView `json:"catalog"`
	Enabled        bool       `json:"enabled"`
	BannersEnabled bool       `json:"banners_enabled"`
}

type FeaturesView struct {
	Enabled        bool `json:"enabled"`
	BannersEnabled bool `json:"banners_enabled"`
}

type OpenResult struct {
	OpenID                   uuid.UUID           `json:"open_id"`
	CaseID                   uuid.UUID           `json:"case_id"`
	Source                   string              `json:"source"`
	PrizeType                string              `json:"prize_type"`
	PrizeNanoton             int64               `json:"prize_nanoton,omitempty"`
	GuaranteedCashoutNanoton int64               `json:"guaranteed_cashout_nanoton,omitempty"`
	Item                     *inventory.ItemView `json:"item,omitempty"`
	LootEntry                LootPreview         `json:"loot_entry"`
	Backed                   bool                `json:"backed"`
}

func (s *Service) Features(ctx context.Context) (*FeaturesView, error) {
	settings, err := s.cases.GetCatalogSettings(ctx)
	if err != nil {
		return nil, err
	}
	return &FeaturesView{
		Enabled:        settings.Enabled,
		BannersEnabled: settings.BannersEnabled,
	}, nil
}

func (s *Service) ensureCasesEnabled(ctx context.Context, telegramID int64) error {
	if s.telegramIsAdmin(telegramID) {
		return nil
	}
	settings, err := s.cases.GetCatalogSettings(ctx)
	if err != nil {
		return err
	}
	if !settings.Enabled {
		return domain.ErrCasesDisabled
	}
	return nil
}

func (s *Service) Catalog(ctx context.Context, userID uuid.UUID, telegramID int64) (*CatalogView, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
	rows, err := s.cases.ListActive(ctx)
	if err != nil {
		return nil, err
	}
	out := &CatalogView{
		Featured: make([]CaseView, 0),
		Catalog:  make([]CaseView, 0),
		Enabled:  true,
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
	freeOpenByCase := s.availableFreeOpenCaseIDs(ctx, userID)
	locale := s.userLocale(ctx, userID)
	for _, row := range rows {
		view := s.toCaseView(ctx, row, true, locale)
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
		if _, ok := freeOpenByCase[row.ID]; ok {
			view.FreeOpenAvailable = true
		}
		s.attachQuestStatus(ctx, &view, userID)
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

func (s *Service) Get(ctx context.Context, idOrSlug string, userID uuid.UUID, telegramID int64) (*CaseView, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
	c, err := s.findCase(ctx, idOrSlug)
	if err != nil {
		return nil, err
	}
	if !c.Active {
		return nil, domain.ErrCaseUnavailable
	}
	view := s.toCaseView(ctx, *c, true, s.userLocale(ctx, userID))
	if userID != uuid.Nil && (c.Kind == domain.CaseKindDaily || isFreeChannelCase(*c)) {
		avail, next, _ := s.caseOpenCooldownAvailability(ctx, userID, c.ID)
		view.DailyAvailable = &avail
		if !avail {
			view.NextAvailableAt = next
		}
	}
	if _, ok := s.availableFreeOpenCaseIDs(ctx, userID)[c.ID]; ok {
		view.FreeOpenAvailable = true
	}
	s.attachChannelStatus(ctx, &view, userID)
	s.attachQuestStatus(ctx, &view, userID)
	return &view, nil
}

func (s *Service) Open(ctx context.Context, userID uuid.UUID, telegramID int64, idOrSlug, idempotencyKey, promoCode string) (*OpenResult, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
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
	var usedEntitlement *domain.UserCaseEntitlement
	releaseEntitlement := func() {
		if usedEntitlement != nil && s.entitlements != nil {
			_ = s.entitlements.ReleaseEntitlement(ctx, usedEntitlement.ID)
			usedEntitlement = nil
		}
	}

	// Quest free-open entitlement takes priority over paid debit.
	if s.entitlements != nil && c.Kind != domain.CaseKindPromo && c.Kind != domain.CaseKindDaily {
		if ent, eErr := s.entitlements.ClaimEntitlementForOpen(ctx, userID, c.ID); eErr == nil && ent != nil {
			usedEntitlement = ent
			source = domain.CaseOpenSourceQuest
			price = 0
		} else if eErr != nil && !errors.Is(eErr, domain.ErrCaseEntitlementMissing) {
			return nil, eErr
		}
	}

	switch {
	case usedEntitlement != nil:
		// already set source/price above
	case c.Kind == domain.CaseKindPromo:
		source = domain.CaseOpenSourcePromo
		price = 0
		promo, err = s.validateCasePromo(ctx, userID, c.ID, promoCode)
		if err != nil {
			s.notifyPromoActivationFailed(ctx, userID, promoCode, casePromoFailureReason(err, c.Title))
			return nil, err
		}
	case c.Kind == domain.CaseKindDaily:
		source = domain.CaseOpenSourceDaily
		price = 0
		if err := s.ensureCaseQuestsDone(ctx, userID, c); err != nil {
			return nil, err
		}
		if err := s.cases.ClaimCaseCooldown(ctx, userID, c.ID, caseOpenCooldown); err != nil {
			return nil, err
		}
	case price <= 0:
		// Free catalog/featured cases must require channel subscription.
		if !c.RequireChannel {
			return nil, domain.ErrInvalidAmount
		}
		if err := s.cases.ClaimCaseCooldown(ctx, userID, c.ID, caseOpenCooldown); err != nil {
			return nil, err
		}
		source = domain.CaseOpenSourceFree
		price = 0
	}
	cooldownClaimed := source == domain.CaseOpenSourceDaily || source == domain.CaseOpenSourceFree
	releaseCooldown := func() {
		if cooldownClaimed {
			_ = s.cases.ReleaseCaseCooldown(ctx, userID, c.ID)
		}
		releaseEntitlement()
	}

	if c.RequireChannel {
		if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
			releaseCooldown()
			if promo != nil {
				s.notifyPromoActivationFailed(ctx, userID, promoCode, casePromoFailureReason(err, c.Title))
			}
			return nil, err
		}
	}

	poolKind := domain.CasePoolForKind(c.Kind)
	if source == domain.CaseOpenSourceQuest {
		poolKind = domain.CasePoolPromo
	}
	var pool domain.CasePoolSnapshot
	var catalogSettings *domain.CaseCatalogSettings
	if settings, err := s.cases.GetCatalogSettings(ctx); err == nil && settings != nil {
		catalogSettings = settings
		// Trigger daily/promo refill via zero delta when those pools are used.
		if poolKind == domain.CasePoolDaily || poolKind == domain.CasePoolPromo {
			if refreshed, dErr := s.cases.ApplyCasePoolDelta(ctx, poolKind, 0); dErr == nil && refreshed != nil {
				catalogSettings = refreshed
			}
		}
		pool = catalogSettings.PoolSnapshot(poolKind)
	}

	openID := uuid.New()

	promoClaimed := false
	releasePromo := func() {
		if !promoClaimed || promo == nil {
			return
		}
		_ = s.cases.DeleteCasePromoRedemption(ctx, userID, promo.Code)
		_ = s.cases.DecrementCasePromoUsed(ctx, promo.Code)
		promoClaimed = false
	}
	if promo != nil {
		if err := s.cases.CreateCasePromoRedemption(ctx, &domain.CasePromoRedemption{
			UserID:     userID,
			Code:       promo.Code,
			CaseID:     c.ID,
			CaseOpenID: openID,
		}); err != nil {
			releaseCooldown()
			s.notifyPromoActivationFailed(ctx, userID, promoCode, casePromoFailureReason(err, c.Title))
			return nil, err
		}
		if err := s.cases.IncrementCasePromoUsed(ctx, promo.Code); err != nil {
			_ = s.cases.DeleteCasePromoRedemption(ctx, userID, promo.Code)
			releaseCooldown()
			s.notifyPromoActivationFailed(ctx, userID, promoCode, casePromoFailureReason(err, c.Title))
			return nil, err
		}
		promoClaimed = true
	}

	var adminFunded int64
	organicPrice := price
	refundOpenDebit := func() {
		if price <= 0 {
			return
		}
		_, _ = s.balance.Credit(ctx, userID, price, domain.LedgerRefund, "case_open", openID)
		_ = s.balance.RestoreAdminCredit(ctx, userID, adminFunded)
		if pool.Enabled && organicPrice > 0 {
			_, _ = s.cases.ApplyCasePoolDelta(ctx, poolKind, -organicPrice)
		}
	}

	if price > 0 {
		if _, funded, err := s.balance.DebitDetailed(ctx, userID, price, domain.LedgerCaseOpen, "case_open", openID); err != nil {
			releasePromo()
			releaseCooldown()
			return nil, err
		} else {
			adminFunded = funded
			if adminFunded > price {
				adminFunded = price
			}
			organicPrice = price - adminFunded
		}
		// Only live (non-admin) spend tops up the paid/daily/promo pool.
		if pool.Enabled && organicPrice > 0 {
			if refreshed, err := s.cases.ApplyCasePoolDelta(ctx, poolKind, organicPrice); err == nil && refreshed != nil {
				pool = refreshed.PoolSnapshot(poolKind)
			}
		}
	}

	boostDecision := depositBoostDecision{}
	if price > 0 && s.deposits != nil {
		if catalogSettings != nil {
			domain.NormalizeDepositBoost(catalogSettings)
		}
		deposits, _ := s.deposits.SumDeposits(ctx, userID)
		boostDecision = resolveDepositBoost(catalogSettings, pool, price, deposits)
	}

	effectiveLoot, _ := s.prepareLootForOpen(ctx, loot, pool, price, boostDecision)
	entry, roll, err := pickWeighted(effectiveLoot)
	if err != nil {
		refundOpenDebit()
		releasePromo()
		releaseCooldown()
		return nil, err
	}

	prizeType := domain.NormalizeCasePrizeType(entry.PrizeType)
	var item *domain.InventoryItem
	var itemView *inventory.ItemView
	var backed bool
	var guaranteedCashoutNanoton int64
	var prizeNanoton int64

	if prizeType == domain.CasePrizeTypeTon {
		prizeNanoton = domain.CaseLootPrizeValueNanoton(entry)
		if prizeNanoton <= 0 {
			refundOpenDebit()
			releasePromo()
			releaseCooldown()
			return nil, domain.ErrInvalidAmount
		}
		if _, err := s.balance.Credit(ctx, userID, prizeNanoton, domain.LedgerCasePrize, "case_open", openID); err != nil {
			refundOpenDebit()
			releasePromo()
			releaseCooldown()
			return nil, err
		}
	} else {
		guaranteedCashoutNanoton = entry.FloorPriceNanoton
		if guaranteedCashoutNanoton <= 0 {
			guaranteedCashoutNanoton = s.quoteLootFloor(ctx, entry)
		}
		granted, isBacked, err := s.grantPrize(ctx, userID, openID, *c, entry, guaranteedCashoutNanoton)
		if err != nil {
			refundOpenDebit()
			releasePromo()
			releaseCooldown()
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

	if pool.Enabled && prizeNanoton > 0 {
		_, _ = s.cases.ApplyCasePoolDelta(ctx, poolKind, -prizeNanoton)
	}
	if pool.Enabled && poolKind == domain.CasePoolPaid {
		_, _ = s.cases.AdvancePaidRecoveryPace(ctx)
	}

	open := &domain.CaseOpen{
		ID:                 openID,
		UserID:             userID,
		CaseID:             c.ID,
		PricePaidNanoton:   price,
		AdminFundedNanoton: adminFunded,
		Source:             source,
		RngRoll:            roll,
		LootEntryID:        entry.ID,
		PrizeType:          prizeType,
		PrizeNanoton:       prizeNanoton,
		IdempotencyKey:     idempotencyKey,
		CreatedAt:          time.Now().UTC(),
	}
	if item != nil {
		id := item.ID
		open.InventoryItemID = &id
	}
	if err := s.cases.CreateOpen(ctx, open); err != nil {
		if existing, findErr := s.cases.FindOpenByIdempotency(ctx, idempotencyKey); findErr == nil && existing != nil {
			// Another request with the same key won; drop our reservation.
			releasePromo()
			releaseCooldown()
			return s.openResultFromExisting(ctx, existing)
		}
		releasePromo()
		releaseCooldown()
		return nil, err
	}

	// Share is required again before the next open.
	if c.RequireShare {
		_ = s.cases.ResetCaseQuestShare(ctx, userID, c.ID)
	}

	lootPreview := toLootPreview(entry)
	lootPreview.RarityLabel = rarityFromValue(s.liveFeedSettings(ctx), domain.CaseLootPrizeValueNanoton(entry))
	result := &OpenResult{
		OpenID:                   openID,
		CaseID:                   c.ID,
		Source:                   source,
		PrizeType:                prizeType,
		PrizeNanoton:             prizeNanoton,
		GuaranteedCashoutNanoton: guaranteedCashoutNanoton,
		Item:                     itemView,
		LootEntry:                lootPreview,
		Backed:                   backed,
	}
	if s.live != nil {
		cfg := s.liveFeedSettings(ctx)
		drop := liveDropFromEntry(openID, entry, open.CreatedAt, cfg)
		if liveRealDropAllowed(cfg, drop.PrizeType, drop.FloorPriceNanoton) {
			s.live.PublishCaseLiveDrop(ctx, drop)
		}
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

func (s *Service) notifyPromoActivationFailed(ctx context.Context, userID uuid.UUID, code, reason string) {
	if s.admin == nil {
		return
	}
	actor := telegram.AdminActor{}
	if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
		actor = telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}
	}
	s.admin.NotifyPromoActivationFailed(ctx, actor, code, reason)
}

func casePromoFailureReason(err error, caseTitle string) string {
	if err == nil {
		return "неизвестная ошибка"
	}
	var channelErr *ChannelNotSubscribedError
	reason := ""
	if errors.As(err, &channelErr) {
		channel := ""
		if channelErr != nil {
			channel = strings.TrimSpace(channelErr.Channel)
		}
		if channel != "" {
			reason = fmt.Sprintf("не подписан на канал %s", channel)
		} else {
			reason = "не подписан на обязательный канал"
		}
	} else {
		switch {
		case errors.Is(err, domain.ErrPromoInvalid):
			reason = "промокод недействителен"
		case errors.Is(err, domain.ErrPromoExpired):
			reason = "промокод истёк"
		case errors.Is(err, domain.ErrPromoExhausted):
			reason = "промокод исчерпан"
		case errors.Is(err, domain.ErrPromoAlreadyRedeemed):
			reason = "промокод уже использован"
		default:
			reason = strings.TrimSpace(err.Error())
			if reason == "" {
				reason = "не удалось активировать промокод"
			}
		}
	}
	title := strings.TrimSpace(caseTitle)
	if title != "" {
		return fmt.Sprintf("кейс «%s»: %s", title, reason)
	}
	return reason
}

func (s *Service) ListOpens(ctx context.Context, userID uuid.UUID, telegramID int64, limit int) ([]OpenResult, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
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

func (s *Service) LiveFeed(ctx context.Context, telegramID int64, limit int) ([]domain.CaseLiveDrop, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 24
	}
	if limit > 48 {
		limit = 48
	}
	rows, err := s.cases.ListRecentOpens(ctx, limit)
	if err != nil {
		return nil, err
	}
	cfg := s.liveFeedSettings(ctx)
	realOpenIDs := make(map[uuid.UUID]struct{}, len(rows))
	for _, row := range rows {
		realOpenIDs[row.OpenID] = struct{}{}
	}
	out := make([]domain.CaseLiveDrop, 0, limit*2)
	seen := make(map[uuid.UUID]struct{}, limit*2)
	appendDrop := func(row domain.CaseLiveDrop, fromBuffer bool) {
		if _, ok := seen[row.OpenID]; ok {
			return
		}
		if fromBuffer {
			if !liveBufferDropAllowed(cfg, row, realOpenIDs) {
				return
			}
		} else if !liveRealDropAllowed(cfg, row.PrizeType, row.FloorPriceNanoton) {
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
		row.RarityLabel = rarityFromValue(cfg, row.FloorPriceNanoton)
		out = append(out, row)
	}
	if s.feedBuf != nil {
		for _, row := range s.feedBuf.Snapshot() {
			appendDrop(row, true)
		}
	}
	for _, row := range rows {
		appendDrop(row, false)
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
			ID:              row.ID,
			Slug:            row.Slug,
			Title:           row.Title,
			TitleEN:         row.TitleEN,
			TitleRU:         row.TitleRU,
			ImageURL:        row.ImageURL,
			AccentColor:     row.AccentColor,
			PriceNanoton:    row.PriceNanoton,
			Kind:            row.Kind,
			SortOrder:       row.SortOrder,
			Active:          row.Active,
			RequireChannel:  row.RequireChannel,
			RequiredNameTag: row.RequiredNameTag,
			RequireShare:    row.RequireShare,
			TargetRTPBPS:    row.TargetRTPBPS,
			Loot:            []AdminLootEntry{},
		}
		if loot, err := s.cases.ListLootByCase(ctx, row.ID); err == nil {
			view.Loot = make([]AdminLootEntry, 0, len(loot))
			for _, e := range loot {
				preview := toLootPreview(e)
				view.Loot = append(view.Loot, AdminLootEntry{
					ID:                  e.ID,
					PrizeType:           preview.PrizeType,
					CollectionSlug:      e.CollectionSlug,
					CollectionName:      e.CollectionName,
					ModelName:           e.ModelName,
					Backdrop:            preview.Backdrop,
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
	c.TitleEN, c.TitleRU, c.Title = domain.SyncLocalized(c.TitleEN, c.TitleRU, c.Title)
	if c.Title == "" {
		return fmt.Errorf("укажите название кейса")
	}
	if c.Kind == "" {
		c.Kind = domain.CaseKindCatalog
	}
	if strings.TrimSpace(c.AccentColor) == "" {
		c.AccentColor = "#3b82f6"
	}
	if c.Kind == domain.CaseKindPromo {
		c.PriceNanoton = 0
	}
	c.RequiredNameTag = strings.TrimSpace(c.RequiredNameTag)
	if c.Kind != domain.CaseKindDaily {
		c.RequiredNameTag = ""
		c.RequireShare = false
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

func (s *Service) AdminDeleteCase(ctx context.Context, id uuid.UUID) error {
	if id == uuid.Nil {
		return domain.ErrNotFound
	}
	return s.cases.DeleteCase(ctx, id)
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

type CatalogSettingsPatch struct {
	Enabled        *bool
	BannersEnabled *bool

	BankEnabled               *bool
	BankNanoton               *int64
	BankTargetNanoton         *int64
	BankLossThresholdNanoton  *int64
	BankRecoveryTargetNanoton *int64
	BankBiasWeight            *int
	BankMaxPrizeBps           *int
	BankFatPaused             *bool
	BankAdjustNanoton         *int64 // relative delta for paid bank

	BankRecoverySmoothEnabled     *bool
	BankRecoveryDrainOpens        *int
	BankRecoveryReliefOpens       *int
	BankRecoveryReliefMaxPrizeBps *int

	DailyPoolEnabled            *bool
	DailyPoolNanoton            *int64
	DailyPoolMaxPrizeBps        *int
	DailyPoolDailyRefillNanoton *int64
	DailyPoolAdjustNanoton      *int64

	PromoPoolEnabled            *bool
	PromoPoolNanoton            *int64
	PromoPoolMaxPrizeBps        *int
	PromoPoolDailyRefillNanoton *int64
	PromoPoolAdjustNanoton      *int64

	DepositBoostEnabled         *bool
	DepositBoostMinNanoton      *int64
	DepositBoostBiasWeight      *int
	DepositBoostTier1MinNanoton *int64
	DepositBoostTier2MinNanoton *int64
	DepositBoostTier3MinNanoton *int64
	DepositBoostTier4MinNanoton *int64
	DepositBoostTier1BiasWeight *int
	DepositBoostTier2BiasWeight *int
	DepositBoostTier3BiasWeight *int
	DepositBoostTier4BiasWeight *int
	DepositBoostSurplusShareBps *int
	DepositBoostRampNanoton     *int64
}

func (s *Service) AdminUpdateCatalogSettings(ctx context.Context, patch CatalogSettingsPatch) (*domain.CaseCatalogSettings, error) {
	settings, err := s.cases.GetCatalogSettings(ctx)
	if err != nil {
		return nil, err
	}
	if patch.Enabled != nil {
		settings.Enabled = *patch.Enabled
	}
	if patch.BannersEnabled != nil {
		settings.BannersEnabled = *patch.BannersEnabled
	}
	if patch.BankEnabled != nil {
		settings.BankEnabled = *patch.BankEnabled
	}
	if patch.BankNanoton != nil {
		settings.BankNanoton = *patch.BankNanoton
	}
	if patch.BankTargetNanoton != nil {
		settings.BankTargetNanoton = *patch.BankTargetNanoton
	}
	if patch.BankLossThresholdNanoton != nil {
		settings.BankLossThresholdNanoton = *patch.BankLossThresholdNanoton
	}
	if patch.BankRecoveryTargetNanoton != nil {
		settings.BankRecoveryTargetNanoton = *patch.BankRecoveryTargetNanoton
	}
	if patch.BankBiasWeight != nil {
		settings.BankBiasWeight = *patch.BankBiasWeight
	}
	if patch.BankMaxPrizeBps != nil {
		settings.BankMaxPrizeBps = *patch.BankMaxPrizeBps
	}
	if patch.BankFatPaused != nil {
		settings.BankFatPaused = *patch.BankFatPaused
	}
	if patch.BankRecoverySmoothEnabled != nil {
		settings.BankRecoverySmoothEnabled = *patch.BankRecoverySmoothEnabled
	}
	if patch.BankRecoveryDrainOpens != nil {
		settings.BankRecoveryDrainOpens = *patch.BankRecoveryDrainOpens
	}
	if patch.BankRecoveryReliefOpens != nil {
		settings.BankRecoveryReliefOpens = *patch.BankRecoveryReliefOpens
	}
	if patch.BankRecoveryReliefMaxPrizeBps != nil {
		settings.BankRecoveryReliefMaxPrizeBps = *patch.BankRecoveryReliefMaxPrizeBps
	}
	if patch.BankAdjustNanoton != nil {
		settings.BankNanoton += *patch.BankAdjustNanoton
	}
	if patch.DailyPoolEnabled != nil {
		settings.DailyPoolEnabled = *patch.DailyPoolEnabled
	}
	if patch.DailyPoolNanoton != nil {
		settings.DailyPoolNanoton = *patch.DailyPoolNanoton
	}
	if patch.DailyPoolMaxPrizeBps != nil {
		settings.DailyPoolMaxPrizeBps = *patch.DailyPoolMaxPrizeBps
	}
	if patch.DailyPoolDailyRefillNanoton != nil {
		settings.DailyPoolDailyRefillNanoton = *patch.DailyPoolDailyRefillNanoton
	}
	if patch.DailyPoolAdjustNanoton != nil {
		settings.DailyPoolNanoton += *patch.DailyPoolAdjustNanoton
	}
	if patch.PromoPoolEnabled != nil {
		settings.PromoPoolEnabled = *patch.PromoPoolEnabled
	}
	if patch.PromoPoolNanoton != nil {
		settings.PromoPoolNanoton = *patch.PromoPoolNanoton
	}
	if patch.PromoPoolMaxPrizeBps != nil {
		settings.PromoPoolMaxPrizeBps = *patch.PromoPoolMaxPrizeBps
	}
	if patch.PromoPoolDailyRefillNanoton != nil {
		settings.PromoPoolDailyRefillNanoton = *patch.PromoPoolDailyRefillNanoton
	}
	if patch.PromoPoolAdjustNanoton != nil {
		settings.PromoPoolNanoton += *patch.PromoPoolAdjustNanoton
	}
	if patch.DepositBoostEnabled != nil {
		settings.DepositBoostEnabled = *patch.DepositBoostEnabled
	}
	if patch.DepositBoostMinNanoton != nil {
		settings.DepositBoostMinNanoton = *patch.DepositBoostMinNanoton
	}
	if patch.DepositBoostBiasWeight != nil {
		settings.DepositBoostBiasWeight = *patch.DepositBoostBiasWeight
	}
	if patch.DepositBoostTier1MinNanoton != nil {
		settings.DepositBoostTier1MinNanoton = *patch.DepositBoostTier1MinNanoton
	}
	if patch.DepositBoostTier2MinNanoton != nil {
		settings.DepositBoostTier2MinNanoton = *patch.DepositBoostTier2MinNanoton
	}
	if patch.DepositBoostTier3MinNanoton != nil {
		settings.DepositBoostTier3MinNanoton = *patch.DepositBoostTier3MinNanoton
	}
	if patch.DepositBoostTier4MinNanoton != nil {
		settings.DepositBoostTier4MinNanoton = *patch.DepositBoostTier4MinNanoton
	}
	if patch.DepositBoostTier1BiasWeight != nil {
		settings.DepositBoostTier1BiasWeight = *patch.DepositBoostTier1BiasWeight
	}
	if patch.DepositBoostTier2BiasWeight != nil {
		settings.DepositBoostTier2BiasWeight = *patch.DepositBoostTier2BiasWeight
	}
	if patch.DepositBoostTier3BiasWeight != nil {
		settings.DepositBoostTier3BiasWeight = *patch.DepositBoostTier3BiasWeight
	}
	if patch.DepositBoostTier4BiasWeight != nil {
		settings.DepositBoostTier4BiasWeight = *patch.DepositBoostTier4BiasWeight
	}
	if patch.DepositBoostSurplusShareBps != nil {
		settings.DepositBoostSurplusShareBps = *patch.DepositBoostSurplusShareBps
	}
	if patch.DepositBoostRampNanoton != nil {
		settings.DepositBoostRampNanoton = *patch.DepositBoostRampNanoton
	}
	if err := s.cases.UpdateCatalogSettings(ctx, settings); err != nil {
		return nil, err
	}
	return s.cases.GetCatalogSettings(ctx)
}

// NotifyDailyCasesReady sends Telegram pushes for daily cases whose 24h cooldown just ended.
func (s *Service) NotifyDailyCasesReady(ctx context.Context) (int, error) {
	if s.userNotifier == nil {
		return 0, nil
	}
	rows, err := s.cases.ListDailyCooldownsReadyForNotify(ctx, caseOpenCooldown, 100)
	if err != nil {
		return 0, err
	}
	sent := 0
	now := time.Now().UTC()
	for _, row := range rows {
		if row.TelegramID <= 0 {
			continue
		}
		if err := s.userNotifier.SendCaseDailyReady(ctx, row.TelegramID, row.LocalizedTitle(row.Locale), row.CaseSlug); err != nil {
			continue
		}
		if err := s.cases.MarkCaseCooldownReadyNotified(ctx, row.UserID, row.CaseID, now); err != nil {
			continue
		}
		sent++
	}
	return sent, nil
}

func (s *Service) AdminCaseOpenStats(ctx context.Context, since *time.Time) (*domain.CaseOpenStats, error) {
	return s.cases.CaseOpenStats(ctx, since)
}

// AdminCaseOpenDetailedView — rich open-stats payload for the admin case-stats section.
type AdminCaseOpenDetailedView struct {
	Today             AdminCaseOpenPeriodView      `json:"today"`
	Last7Days         AdminCaseOpenPeriodView      `json:"last_7_days"`
	Last30Days        AdminCaseOpenPeriodView      `json:"last_30_days"`
	AllTime           AdminCaseOpenPeriodView      `json:"all_time"`
	SourcesToday      AdminCaseOpenSourceBreakdown `json:"sources_today"`
	SourcesAllTime    AdminCaseOpenSourceBreakdown `json:"sources_all_time"`
	PrizeTypes7d      []AdminCaseOpenPrizeTypeView `json:"prize_types_7d"`
	PrizeTypesAllTime []AdminCaseOpenPrizeTypeView `json:"prize_types_all_time"`
	ByCaseToday       []AdminCaseOpenCaseView      `json:"by_case_today"`
	ByCase7d          []AdminCaseOpenCaseView      `json:"by_case_7d"`
	ByCase30d         []AdminCaseOpenCaseView      `json:"by_case_30d"`
	ByCaseAllTime     []AdminCaseOpenCaseView      `json:"by_case_all_time"`
	TopPrizes7d       []AdminCaseOpenPrizeHitView  `json:"top_prizes_7d"`
	OpensByDay        []AdminCaseOpenDailyView     `json:"opens_by_day"`
}

type AdminCaseOpenPeriodView struct {
	Opens             int64 `json:"opens"`
	UniqueUsers       int64 `json:"unique_users"`
	SpentNanoton      int64 `json:"spent_nanoton"`
	PrizeTotalNanoton int64 `json:"prize_total_nanoton"`
	HouseEdgeNanoton  int64 `json:"house_edge_nanoton"`
	ActualRTPBPS      int   `json:"actual_rtp_bps"`
	PaidOpens         int64 `json:"paid_opens"`
	FreeOpens         int64 `json:"free_opens"`
	AvgTicketNanoton  int64 `json:"avg_ticket_nanoton"`
	AvgPrizeNanoton   int64 `json:"avg_prize_nanoton"`
}

type AdminCaseOpenSourceView struct {
	Opens             int64 `json:"opens"`
	UniqueUsers       int64 `json:"unique_users"`
	SpentNanoton      int64 `json:"spent_nanoton"`
	PrizeTotalNanoton int64 `json:"prize_total_nanoton"`
}

type AdminCaseOpenSourceBreakdown struct {
	Paid  AdminCaseOpenSourceView `json:"paid"`
	Daily AdminCaseOpenSourceView `json:"daily"`
	Free  AdminCaseOpenSourceView `json:"free"`
	Promo AdminCaseOpenSourceView `json:"promo"`
}

type AdminCaseOpenPrizeTypeView struct {
	PrizeType         string `json:"prize_type"`
	Opens             int64  `json:"opens"`
	PrizeTotalNanoton int64  `json:"prize_total_nanoton"`
}

type AdminCaseOpenCaseView struct {
	CaseID            string `json:"case_id"`
	Title             string `json:"title"`
	Slug              string `json:"slug"`
	ImageURL          string `json:"image_url,omitempty"`
	Kind              string `json:"kind,omitempty"`
	PriceNanoton      int64  `json:"price_nanoton"`
	SortOrder         int    `json:"sort_order"`
	Active            bool   `json:"active"`
	Opens             int64  `json:"opens"`
	SpentNanoton      int64  `json:"spent_nanoton"`
	PrizeTotalNanoton int64  `json:"prize_total_nanoton"`
	HouseEdgeNanoton  int64  `json:"house_edge_nanoton"`
	ActualRTPBPS      int    `json:"actual_rtp_bps"`
}

type AdminCaseOpenPrizeHitView struct {
	LootEntryID       string  `json:"loot_entry_id"`
	Label             string  `json:"label"`
	PrizeType         string  `json:"prize_type"`
	Hits              int64   `json:"hits"`
	PrizeTotalNanoton int64   `json:"prize_total_nanoton"`
	SharePercent      float64 `json:"share_percent"`
}

type AdminCaseOpenDailyView struct {
	Date              string `json:"date"`
	Opens             int64  `json:"opens"`
	UniqueUsers       int64  `json:"unique_users"`
	SpentNanoton      int64  `json:"spent_nanoton"`
	PrizeTotalNanoton int64  `json:"prize_total_nanoton"`
}

func (s *Service) AdminCaseOpenStatsDetailed(ctx context.Context) (*AdminCaseOpenDetailedView, error) {
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	since7d := today.AddDate(0, 0, -6)
	since30d := today.AddDate(0, 0, -29)
	since14d := today.AddDate(0, 0, -13)

	todayStats, err := s.cases.CaseOpenPeriodStats(ctx, today)
	if err != nil {
		return nil, err
	}
	weekStats, err := s.cases.CaseOpenPeriodStats(ctx, since7d)
	if err != nil {
		return nil, err
	}
	monthStats, err := s.cases.CaseOpenPeriodStats(ctx, since30d)
	if err != nil {
		return nil, err
	}
	allStats, err := s.cases.CaseOpenPeriodStats(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	sourcesToday, err := s.cases.CaseOpenSourceStats(ctx, today)
	if err != nil {
		return nil, err
	}
	sourcesAll, err := s.cases.CaseOpenSourceStats(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	prizeTypes7d, err := s.cases.CaseOpenPrizeTypeStats(ctx, since7d)
	if err != nil {
		return nil, err
	}
	prizeTypesAll, err := s.cases.CaseOpenPrizeTypeStats(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	// limit 0 = all cases with opens in the period (catalog overlay).
	byCaseToday, err := s.cases.CaseOpenByCaseStats(ctx, today, 0)
	if err != nil {
		return nil, err
	}
	byCase7d, err := s.cases.CaseOpenByCaseStats(ctx, since7d, 0)
	if err != nil {
		return nil, err
	}
	byCase30d, err := s.cases.CaseOpenByCaseStats(ctx, since30d, 0)
	if err != nil {
		return nil, err
	}
	byCaseAll, err := s.cases.CaseOpenByCaseStats(ctx, time.Time{}, 0)
	if err != nil {
		return nil, err
	}

	topPrizes, err := s.cases.CaseOpenTopPrizes(ctx, since7d, 15)
	if err != nil {
		return nil, err
	}

	dailyRows, err := s.cases.CaseOpenByDay(ctx, since14d)
	if err != nil {
		return nil, err
	}

	var totalHits int64
	for _, hit := range topPrizes {
		totalHits += hit.Hits
	}
	prizeHits := make([]AdminCaseOpenPrizeHitView, 0, len(topPrizes))
	for _, hit := range topPrizes {
		share := 0.0
		if totalHits > 0 {
			share = float64(hit.Hits) * 100 / float64(totalHits)
		}
		prizeHits = append(prizeHits, AdminCaseOpenPrizeHitView{
			LootEntryID:       hit.LootEntryID.String(),
			Label:             hit.Label,
			PrizeType:         hit.PrizeType,
			Hits:              hit.Hits,
			PrizeTotalNanoton: hit.PrizeTotalNanoton,
			SharePercent:      share,
		})
	}

	byDay := make(map[string]domain.CaseOpenDailyStats, len(dailyRows))
	for _, row := range dailyRows {
		key := row.Date.UTC().Format("2006-01-02")
		byDay[key] = row
	}
	opensByDay := make([]AdminCaseOpenDailyView, 0, 14)
	for i := 0; i < 14; i++ {
		day := since14d.AddDate(0, 0, i)
		key := day.Format("2006-01-02")
		point := AdminCaseOpenDailyView{Date: key}
		if row, ok := byDay[key]; ok {
			point.Opens = row.Opens
			point.UniqueUsers = row.UniqueUsers
			point.SpentNanoton = row.SpentNanoton
			point.PrizeTotalNanoton = row.PrizeTotalNanoton
		}
		opensByDay = append(opensByDay, point)
	}

	return &AdminCaseOpenDetailedView{
		Today:             mapCaseOpenPeriod(todayStats),
		Last7Days:         mapCaseOpenPeriod(weekStats),
		Last30Days:        mapCaseOpenPeriod(monthStats),
		AllTime:           mapCaseOpenPeriod(allStats),
		SourcesToday:      mapCaseOpenSources(sourcesToday),
		SourcesAllTime:    mapCaseOpenSources(sourcesAll),
		PrizeTypes7d:      mapCaseOpenPrizeTypes(prizeTypes7d),
		PrizeTypesAllTime: mapCaseOpenPrizeTypes(prizeTypesAll),
		ByCaseToday:       mapCaseOpenCases(byCaseToday),
		ByCase7d:          mapCaseOpenCases(byCase7d),
		ByCase30d:         mapCaseOpenCases(byCase30d),
		ByCaseAllTime:     mapCaseOpenCases(byCaseAll),
		TopPrizes7d:       prizeHits,
		OpensByDay:        opensByDay,
	}, nil
}

func mapCaseOpenPeriod(s domain.CaseOpenPeriodStats) AdminCaseOpenPeriodView {
	v := AdminCaseOpenPeriodView{
		Opens:             s.Opens,
		UniqueUsers:       s.UniqueUsers,
		SpentNanoton:      s.SpentNanoton,
		PrizeTotalNanoton: s.PrizeTotalNanoton,
		HouseEdgeNanoton:  s.SpentNanoton - s.PrizeTotalNanoton,
		PaidOpens:         s.PaidOpens,
		FreeOpens:         s.FreeOpens,
	}
	if s.PaidSpentNanoton > 0 {
		v.ActualRTPBPS = int((s.PaidPrizeNanoton * 10000) / s.PaidSpentNanoton)
	}
	if s.PaidOpens > 0 {
		v.AvgTicketNanoton = s.PaidSpentNanoton / s.PaidOpens
	}
	if s.Opens > 0 {
		v.AvgPrizeNanoton = s.PrizeTotalNanoton / s.Opens
	}
	return v
}

func mapCaseOpenSources(rows []domain.CaseOpenSourceStats) AdminCaseOpenSourceBreakdown {
	out := AdminCaseOpenSourceBreakdown{}
	for _, row := range rows {
		v := AdminCaseOpenSourceView{
			Opens:             row.Opens,
			UniqueUsers:       row.UniqueUsers,
			SpentNanoton:      row.SpentNanoton,
			PrizeTotalNanoton: row.PrizeTotalNanoton,
		}
		switch row.Source {
		case domain.CaseOpenSourcePaid:
			out.Paid = v
		case domain.CaseOpenSourceDaily:
			out.Daily = v
		case domain.CaseOpenSourceFree:
			out.Free = v
		case domain.CaseOpenSourcePromo:
			out.Promo = v
		}
	}
	return out
}

func mapCaseOpenPrizeTypes(rows []domain.CaseOpenPrizeTypeStats) []AdminCaseOpenPrizeTypeView {
	out := make([]AdminCaseOpenPrizeTypeView, 0, len(rows))
	for _, row := range rows {
		out = append(out, AdminCaseOpenPrizeTypeView{
			PrizeType:         row.PrizeType,
			Opens:             row.Opens,
			PrizeTotalNanoton: row.PrizeTotalNanoton,
		})
	}
	return out
}

func mapCaseOpenCases(rows []domain.CaseOpenCaseStats) []AdminCaseOpenCaseView {
	out := make([]AdminCaseOpenCaseView, 0, len(rows))
	for _, row := range rows {
		v := AdminCaseOpenCaseView{
			CaseID:            row.CaseID.String(),
			Title:             row.Title,
			Slug:              row.Slug,
			ImageURL:          row.ImageURL,
			Kind:              row.Kind,
			PriceNanoton:      row.PriceNanoton,
			SortOrder:         row.SortOrder,
			Active:            row.Active,
			Opens:             row.Opens,
			SpentNanoton:      row.SpentNanoton,
			PrizeTotalNanoton: row.PrizeTotalNanoton,
			HouseEdgeNanoton:  row.SpentNanoton - row.PrizeTotalNanoton,
		}
		if row.SpentNanoton > 0 {
			v.ActualRTPBPS = int((row.PrizeTotalNanoton * 10000) / row.SpentNanoton)
		}
		out = append(out, v)
	}
	return out
}

func (s *Service) AdminReplaceLoot(ctx context.Context, caseID uuid.UUID, entries []domain.CaseLootEntry) error {
	if _, err := s.cases.FindByID(ctx, caseID); err != nil {
		return err
	}
	for i := range entries {
		if entries[i].Weight < 0 {
			return domain.ErrInvalidAmount
		}
		if entries[i].FloorPriceNanoton < 0 || entries[i].AmountNanoton < 0 {
			return domain.ErrInvalidAmount
		}
		prizeType := domain.NormalizeCasePrizeType(entries[i].PrizeType)
		entries[i].PrizeType = prizeType
		entries[i].DisplayName = strings.TrimSpace(entries[i].DisplayName)
		entries[i].TileBackgroundColor = domain.NormalizeLootTileBackgroundColor(entries[i].TileBackgroundColor)
		entries[i].Backdrop = domain.NormalizeCaseLootBackdrop(entries[i].Backdrop)

		if prizeType == domain.CasePrizeTypeTon {
			if entries[i].AmountNanoton <= 0 {
				return domain.ErrInvalidAmount
			}
			entries[i].CollectionSlug = ""
			entries[i].CollectionName = ""
			entries[i].ModelName = ""
			entries[i].Backdrop = ""
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
		entries[i].CollectionName = strings.TrimSpace(entries[i].CollectionName)
		entries[i].ModelName = strings.TrimSpace(entries[i].ModelName)
		entries[i].AmountNanoton = 0
		if entries[i].CollectionName == "" {
			// Prefer human title in display_name when it isn't just the slug/model.
			dn := entries[i].DisplayName
			if dn != "" && !strings.EqualFold(dn, entries[i].CollectionSlug) && dn != entries[i].ModelName {
				entries[i].CollectionName = dn
			}
		}
		if entries[i].DisplayName == "" {
			if entries[i].CollectionName != "" {
				entries[i].DisplayName = entries[i].CollectionName
			} else if entries[i].ModelName != "" {
				entries[i].DisplayName = entries[i].ModelName
			} else {
				entries[i].DisplayName = entries[i].CollectionSlug
			}
		}
	}
	hasPositiveWeight := false
	for _, e := range entries {
		if e.Weight > 0 {
			hasPositiveWeight = true
			break
		}
	}
	if len(entries) > 0 && !hasPositiveWeight {
		return domain.ErrCaseNoLoot
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
	guaranteedCashoutNanoton int64,
) (*domain.InventoryItem, bool, error) {
	floor := entry.FloorPriceNanoton
	if floor <= 0 {
		floor = s.quoteLootFloor(ctx, entry)
	}
	txRef := domain.CaseClaimTxRefPrefix + openID.String()
	imageURL := entry.ImageURL
	if imageURL == "" {
		imageURL = giftimage.FragmentURL(entry.CollectionSlug)
	}
	modelName := strings.TrimSpace(entry.ModelName)
	backdrop := domain.NormalizeCaseLootBackdrop(entry.Backdrop)

	// Best-effort: take a real gift from bot house stock.
	if s.bot != nil {
		if botUser, err := s.bot.EnsureBotUser(ctx); err == nil && botUser != nil {
			var house *domain.InventoryItem
			var takeErr error
			if modelName != "" {
				house, takeErr = s.inventory.TakeHouseGiftForModel(ctx, botUser.ID, userID, entry.CollectionSlug, modelName, backdrop)
			} else {
				house, takeErr = s.inventory.TakeHouseGiftForCollection(ctx, botUser.ID, userID, entry.CollectionSlug, backdrop)
			}
			if takeErr == nil && house != nil {
				metaMap := map[string]any{
					domain.CaseClaimMetaFulfillment:    domain.CaseFulfillmentBacked,
					domain.CaseClaimMetaCaseID:         c.ID.String(),
					domain.CaseClaimMetaCaseSlug:       c.Slug,
					domain.CaseClaimMetaLootEntryID:    entry.ID.String(),
					domain.CaseClaimMetaCollection:     entry.CollectionSlug,
					domain.CaseClaimMetaCashoutNanoton: guaranteedCashoutNanoton,
				}
				// Keep the real NFT traits from house stock; loot model/backdrop only override when set.
				houseAttrs := gifts.ItemAttributes(house.Metadata)
				if modelName != "" {
					metaMap[domain.CaseClaimMetaModel] = modelName
				} else if houseAttrs.Model != "" {
					metaMap[domain.CaseClaimMetaModel] = houseAttrs.Model
				}
				if backdrop != "" {
					metaMap[domain.CaseClaimMetaBackdrop] = backdrop
				} else if houseAttrs.Backdrop != "" {
					metaMap[domain.CaseClaimMetaBackdrop] = houseAttrs.Backdrop
				}
				if houseAttrs.Symbol != "" {
					metaMap[domain.CaseClaimMetaSymbol] = houseAttrs.Symbol
				}
				meta, _ := json.Marshal(metaMap)
				if err := s.inventory.BindTelegramGift(ctx, house.ID, house.TelegramGiftID, house.ImageURL, meta, domain.CaseFulfillmentBacked, txRef); err != nil {
					return nil, false, err
				}
				house.Metadata = datatypes.JSON(meta)
				house.TelegramTxRef = txRef
				return house, true, nil
			}
		}
	}

	metaMap := map[string]any{
		domain.CaseClaimMetaFulfillment:    domain.CaseFulfillmentUnbacked,
		domain.CaseClaimMetaCaseID:         c.ID.String(),
		domain.CaseClaimMetaCaseSlug:       c.Slug,
		domain.CaseClaimMetaLootEntryID:    entry.ID.String(),
		domain.CaseClaimMetaCollection:     entry.CollectionSlug,
		domain.CaseClaimMetaCashoutNanoton: guaranteedCashoutNanoton,
	}
	if modelName != "" {
		metaMap[domain.CaseClaimMetaModel] = modelName
	}
	if backdrop != "" {
		metaMap[domain.CaseClaimMetaBackdrop] = backdrop
	}
	meta, _ := json.Marshal(metaMap)
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

func (s *Service) quoteLootFloor(ctx context.Context, entry domain.CaseLootEntry) int64 {
	modelName := strings.TrimSpace(entry.ModelName)
	backdrop := domain.NormalizeCaseLootBackdrop(entry.Backdrop)
	if (modelName != "" || backdrop != "") && s.valuator != nil {
		sg := gifts.ScannedGiftFromItem(domain.InventoryItem{
			CollectionSlug: entry.CollectionSlug,
			Name:           entry.DisplayName,
			Metadata: datatypes.JSON(gifts.ItemMetadata(telegram.GiftAttributes{
				Model:    modelName,
				Backdrop: backdrop,
			})),
		})
		if price, _ := s.valuator.QuoteBuyback(ctx, sg); price > 0 {
			return price
		}
	}
	return s.quoteCollectionFloor(ctx, entry.CollectionSlug)
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
	now := time.Now().UTC()
	var nextCandidates []time.Time

	open, err := s.cases.FindLatestOpenByUserCase(ctx, userID, caseID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil, err
	}
	if err == nil {
		next := open.CreatedAt.UTC().Add(caseOpenCooldown)
		if now.Before(next) {
			nextCandidates = append(nextCandidates, next)
		}
	}
	claim, err := s.cases.FindCaseCooldownClaim(ctx, userID, caseID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil, err
	}
	if err == nil {
		next := claim.LastClaimedAt.UTC().Add(caseOpenCooldown)
		if now.Before(next) {
			nextCandidates = append(nextCandidates, next)
		}
	}
	if len(nextCandidates) == 0 {
		return true, nil, nil
	}
	next := nextCandidates[0]
	for _, t := range nextCandidates[1:] {
		if t.After(next) {
			next = t
		}
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

func (s *Service) toCaseView(ctx context.Context, c domain.Case, withLoot bool, locale string) CaseView {
	view := CaseView{
		ID:              c.ID,
		Slug:            c.Slug,
		Title:           c.LocalizedTitle(locale),
		ImageURL:        c.ImageURL,
		AccentColor:     c.AccentColor,
		PriceNanoton:    c.PriceNanoton,
		Kind:            c.Kind,
		SortOrder:       c.SortOrder,
		RequireChannel:  c.RequireChannel,
		RequiredNameTag: strings.TrimSpace(c.RequiredNameTag),
		RequireShare:    c.RequireShare,
	}
	if c.RequireChannel && s.requiredChannel != "" {
		view.RequiredChannel = s.requiredChannel
	}
	if withLoot {
		if loot, err := s.cases.ListLootByCase(ctx, c.ID); err == nil {
			cfg := s.liveFeedSettings(ctx)
			view.Loot = make([]LootPreview, 0, len(loot))
			for _, e := range loot {
				preview := toLootPreview(e)
				if preview.PrizeType != domain.CasePrizeTypeTon && preview.FloorPriceNanoton <= 0 {
					preview.FloorPriceNanoton = s.quoteLootFloor(ctx, e)
				}
				preview.RarityLabel = rarityFromValue(cfg, preview.FloorPriceNanoton)
				view.Loot = append(view.Loot, preview)
			}
		}
	}
	return view
}

func (s *Service) userLocale(ctx context.Context, userID uuid.UUID) string {
	if s.users == nil || userID == uuid.Nil {
		return domain.DefaultLocale
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil || u == nil {
		return domain.DefaultLocale
	}
	return u.LocalizedLocale()
}

// availableFreeOpenCaseIDs returns case IDs with at least one unused quest entitlement.
func (s *Service) availableFreeOpenCaseIDs(ctx context.Context, userID uuid.UUID) map[uuid.UUID]struct{} {
	out := make(map[uuid.UUID]struct{})
	if userID == uuid.Nil || s.entitlements == nil {
		return out
	}
	rows, err := s.entitlements.ListAvailableEntitlements(ctx, userID)
	if err != nil {
		return out
	}
	for _, row := range rows {
		out[row.CaseID] = struct{}{}
	}
	return out
}

func (s *Service) attachQuestStatus(ctx context.Context, view *CaseView, userID uuid.UUID) {
	if view == nil {
		return
	}
	hasNameQuest := strings.TrimSpace(view.RequiredNameTag) != ""
	hasShareQuest := view.RequireShare
	if !hasNameQuest && !hasShareQuest {
		return
	}
	if userID == uuid.Nil {
		return
	}
	if hasNameQuest {
		ok := false
		if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
			ok = nameContainsTag(user.FirstName, user.LastName, view.RequiredNameTag)
		}
		view.NameTagOK = &ok
	}
	if hasShareQuest {
		done, err := s.freshShareDone(ctx, userID, view.ID)
		if err != nil {
			done = false
		}
		view.ShareDone = &done
	}
}

func (s *Service) ensureCaseQuestsDone(ctx context.Context, userID uuid.UUID, c *domain.Case) error {
	if c == nil {
		return nil
	}
	// Share first, then name tag — matches client popup order.
	if c.RequireShare {
		ok, err := s.freshShareDone(ctx, userID, c.ID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCaseShareRequired
		}
	}
	tag := strings.TrimSpace(c.RequiredNameTag)
	if tag != "" {
		user, err := s.users.FindByID(ctx, userID)
		if err != nil {
			return err
		}
		if !nameContainsTag(user.FirstName, user.LastName, tag) {
			return domain.ErrCaseNameTagRequired
		}
	}
	return nil
}

// freshShareDone — share is valid only for the current open cycle:
// must be recorded after the previous open, and if the 24h cooldown already
// elapsed, after the moment the case became available again (open+24h).
func (s *Service) freshShareDone(ctx context.Context, userID, caseID uuid.UUID) (bool, error) {
	share, err := s.cases.GetCaseQuestShare(ctx, userID, caseID)
	if err != nil {
		return false, err
	}
	if share == nil || share.ShareCount < 1 {
		return false, nil
	}
	open, err := s.cases.FindLatestOpenByUserCase(ctx, userID, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true, nil
		}
		return false, err
	}
	shareAt := share.UpdatedAt.UTC()
	openAt := open.CreatedAt.UTC()
	if !shareAt.After(openAt) {
		// Share was before/at the last open — already consumed.
		return false, nil
	}
	nextAvailable := openAt.Add(caseOpenCooldown)
	now := time.Now().UTC()
	if now.Before(nextAvailable) {
		// Still in cooldown; share after last open counts for the upcoming cycle.
		return true, nil
	}
	// New cycle: share must be at/after the moment the case became available again.
	return !shareAt.Before(nextAvailable), nil
}

func nameContainsTag(firstName, lastName, tag string) bool {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return true
	}
	needle := strings.ToLower(tag)
	return strings.Contains(strings.ToLower(firstName), needle) ||
		strings.Contains(strings.ToLower(lastName), needle)
}

// PrepareShareResult is returned to the Mini App for WebApp.shareMessage.
type PrepareShareResult struct {
	PreparedMessageID string `json:"prepared_message_id"`
	ResultID          string `json:"result_id"`
	ExpirationDate    int64  `json:"expiration_date,omitempty"`
}

// PrepareShare creates a Telegram prepared inline message for the case quest share.
func (s *Service) PrepareShare(ctx context.Context, userID uuid.UUID, telegramID int64, idOrSlug string) (*PrepareShareResult, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
	if userID == uuid.Nil || telegramID == 0 {
		return nil, domain.ErrForbidden
	}
	if s.botAPI == nil || !s.botAPI.Enabled() {
		return nil, domain.ErrCasesDisabled
	}
	if s.botUsername == "" || s.webAppShortName == "" {
		return nil, domain.ErrCasesDisabled
	}
	c, err := s.findCase(ctx, idOrSlug)
	if err != nil {
		return nil, err
	}
	if !c.Active {
		return nil, domain.ErrCaseUnavailable
	}
	if !c.RequireShare {
		return nil, domain.ErrInvalidAmount
	}

	resultID := "cqs_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	startPayload := referralStartPayload(telegramID)
	shareURL := fmt.Sprintf(
		"https://t.me/%s/%s?startapp=%s",
		s.botUsername,
		s.webAppShortName,
		url.QueryEscape(startPayload),
	)
	title := "Flipo"
	if strings.TrimSpace(c.Title) != "" {
		title = strings.TrimSpace(c.Title)
	}
	description := "Заходи в Flipo — получи бесплатный кейс и забирай подарки!"
	caption := description + "\n\n" + shareURL
	replyMarkup := map[string]any{
		"inline_keyboard": [][]map[string]any{{
			{"text": "🎁 Открыть бесплатный кейс", "url": shareURL},
		}},
	}

	var inlineResult map[string]any
	photoURL := caseQuestSharePromoURL(s.webAppURL)
	if photoURL != "" {
		// Photo result embeds the promo art in the shared message.
		inlineResult = map[string]any{
			"type":          "photo",
			"id":            resultID,
			"photo_url":     photoURL,
			"thumbnail_url": photoURL,
			"photo_width":   1024,
			"photo_height":  1024,
			"title":         title,
			"description":   description,
			"caption":       caption,
			"reply_markup":  replyMarkup,
		}
	} else {
		inlineResult = map[string]any{
			"type":        "article",
			"id":          resultID,
			"title":       title,
			"description": description,
			"input_message_content": map[string]any{
				"message_text": caption,
				"link_preview_options": map[string]any{
					"is_disabled": false,
				},
			},
			"reply_markup": replyMarkup,
		}
	}

	prepared, err := s.botAPI.SavePreparedInlineMessage(ctx, telegram.SavePreparedInlineMessageRequest{
		UserID:            telegramID,
		Result:            inlineResult,
		AllowUserChats:    true,
		AllowBotChats:     false,
		AllowGroupChats:   true,
		AllowChannelChats: false,
	})
	if err != nil {
		return nil, fmt.Errorf("prepare share: %w", err)
	}

	row := &domain.CaseQuestSharePrepared{
		ResultID:          resultID,
		UserID:            userID,
		CaseID:            c.ID,
		PreparedMessageID: prepared.ID,
		CreatedAt:         time.Now().UTC(),
	}
	if err := s.cases.CreateCaseQuestSharePrepared(ctx, row); err != nil {
		return nil, err
	}
	return &PrepareShareResult{
		PreparedMessageID: prepared.ID,
		ResultID:          resultID,
		ExpirationDate:    prepared.ExpirationDate,
	}, nil
}

// ConfirmShare credits the case quest after a successful shareMessage / chosen_inline_result.
func (s *Service) ConfirmShare(ctx context.Context, userID uuid.UUID, telegramID int64, resultID string) (*CaseView, error) {
	if err := s.ensureCasesEnabled(ctx, telegramID); err != nil {
		return nil, err
	}
	resultID = strings.TrimSpace(resultID)
	if resultID == "" {
		return nil, domain.ErrInvalidAmount
	}
	if userID == uuid.Nil {
		return nil, domain.ErrForbidden
	}

	first, row, err := s.cases.ConfirmCaseQuestSharePrepared(ctx, resultID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, domain.ErrNotFound
	}
	if row.UserID != userID {
		return nil, domain.ErrForbidden
	}
	if first {
		if _, err := s.cases.IncrementCaseQuestShare(ctx, row.UserID, row.CaseID); err != nil {
			return nil, err
		}
	}

	c, err := s.cases.FindByID(ctx, row.CaseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	view := s.toCaseView(ctx, *c, true, s.userLocale(ctx, userID))
	if c.Kind == domain.CaseKindDaily || isFreeChannelCase(*c) {
		avail, next, _ := s.caseOpenCooldownAvailability(ctx, userID, c.ID)
		view.DailyAvailable = &avail
		if !avail {
			view.NextAvailableAt = next
		}
	}
	s.attachChannelStatus(ctx, &view, userID)
	s.attachQuestStatus(ctx, &view, userID)
	return &view, nil
}

// ConfirmPreparedShareByTelegramID is used by the bot webhook (chosen_inline_result).
func (s *Service) ConfirmPreparedShareByTelegramID(ctx context.Context, telegramID int64, resultID string) error {
	resultID = strings.TrimSpace(resultID)
	if telegramID == 0 || resultID == "" {
		return nil
	}
	if !strings.HasPrefix(resultID, "cqs_") {
		return nil
	}
	user, err := s.users.FindByTelegramID(ctx, telegramID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	_, err = s.ConfirmShare(ctx, user.ID, telegramID, resultID)
	if err == nil {
		return nil
	}
	if errors.Is(err, domain.ErrNotFound) ||
		errors.Is(err, domain.ErrForbidden) ||
		errors.Is(err, domain.ErrCasesDisabled) ||
		errors.Is(err, domain.ErrInvalidAmount) {
		return nil
	}
	return err
}

func referralStartPayload(telegramID int64) string {
	if telegramID <= 0 {
		return "ref"
	}
	return "ref_" + strings.ToLower(strconv.FormatInt(telegramID, 36))
}

// caseQuestSharePromoURL is the public HTTPS image used in prepared share messages.
func caseQuestSharePromoURL(webAppURL string) string {
	base := strings.TrimRight(strings.TrimSpace(webAppURL), "/")
	if base == "" {
		return ""
	}
	if !strings.HasPrefix(base, "https://") && !strings.HasPrefix(base, "http://") {
		return ""
	}
	// Cache-bust so Telegram re-fetches after art updates.
	return base + "/share/case-quest-promo.jpg?v=2"
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
				preview.RarityLabel = rarityFromValue(s.liveFeedSettings(ctx), domain.CaseLootPrizeValueNanoton(e))
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
	result.GuaranteedCashoutNanoton = domain.CaseClaimCashoutNanoton(item.Metadata)
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
	collectionName := strings.TrimSpace(e.CollectionName)
	if collectionName == "" && prizeType != domain.CasePrizeTypeTon {
		// Legacy rows: display_name held the collection title when no model was set.
		if name != "" && !strings.EqualFold(name, e.CollectionSlug) && name != strings.TrimSpace(e.ModelName) {
			collectionName = name
		}
	}
	if collectionName != "" && (name == "" || name == strings.TrimSpace(e.ModelName) || strings.EqualFold(name, e.CollectionSlug)) {
		name = collectionName
	}
	return LootPreview{
		ID:                  e.ID,
		PrizeType:           prizeType,
		CollectionSlug:      e.CollectionSlug,
		CollectionName:      collectionName,
		ModelName:           strings.TrimSpace(e.ModelName),
		Backdrop:            domain.NormalizeCaseLootBackdrop(e.Backdrop),
		DisplayName:         name,
		ImageURL:            img,
		RarityLabel:         e.RarityLabel,
		TileBackgroundColor: e.TileBackgroundColor,
		SortOrder:           e.SortOrder,
		FloorPriceNanoton:   floor,
		AmountNanoton:       e.AmountNanoton,
	}
}

func (s *Service) liveFeedSettings(ctx context.Context) domain.CaseLiveFeedSettings {
	cfg, err := s.cases.GetLiveFeedSettings(ctx)
	if err != nil || cfg == nil {
		return DefaultLiveFeedSettings()
	}
	NormalizeLiveFeedSettings(cfg)
	return *cfg
}

func liveDropFromEntry(openID uuid.UUID, entry domain.CaseLootEntry, createdAt time.Time, cfg domain.CaseLiveFeedSettings) domain.CaseLiveDrop {
	preview := toLootPreview(entry)
	value := domain.CaseLootPrizeValueNanoton(entry)
	return domain.CaseLiveDrop{
		OpenID:              openID,
		PrizeType:           preview.PrizeType,
		CollectionSlug:      preview.CollectionSlug,
		DisplayName:         preview.DisplayName,
		ImageURL:            preview.ImageURL,
		RarityLabel:         rarityFromValue(cfg, value),
		TileBackgroundColor: preview.TileBackgroundColor,
		Backdrop:            preview.Backdrop,
		FloorPriceNanoton:   value,
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
