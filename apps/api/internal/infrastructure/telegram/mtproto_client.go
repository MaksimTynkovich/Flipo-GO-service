package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

var ErrMTProtoNotConfigured = errors.New("mtproto gift scanner not configured")
var ErrMTProtoUnauthorized = errors.New("mtproto session is not authorized")

type MTProtoConfig struct {
	AppID       int
	AppHash     string
	SessionPath string
}

func MTProtoConfigFromEnv(appID int, appHash, sessionPath string) MTProtoConfig {
	return MTProtoConfig{
		AppID:       appID,
		AppHash:     appHash,
		SessionPath: sessionPath,
	}
}

func (c MTProtoConfig) Enabled() bool {
	return c.AppID > 0 && c.AppHash != "" && c.SessionPath != ""
}

type ScanLog func(step string, detail string)

type ScanOptions struct {
	Log            ScanLog
	IncludeRegular bool
}

// ScanTarget identifies whose profile gifts to fetch.
// Prefer Username when available — Telegram requires access_hash for users.getUsers.
type ScanTarget struct {
	UserID     int64
	AccessHash int64
	Username   string
}

func ScanTargetByID(userID int64) ScanTarget {
	return ScanTarget{UserID: userID}
}

func ScanTargetByUsername(username string) ScanTarget {
	return ScanTarget{Username: strings.TrimPrefix(strings.TrimSpace(username), "@")}
}

type RawGiftEntry struct {
	Kind           string         `json:"kind"`
	Slug           string         `json:"slug,omitempty"`
	Title          string         `json:"title,omitempty"`
	Num            int            `json:"num,omitempty"`
	Unsaved        bool           `json:"unsaved,omitempty"`
	PinnedToTop    bool           `json:"pinned_to_top,omitempty"`
	Attributes     GiftAttributes `json:"attributes,omitempty"`
	PriceNanoton   int64          `json:"price_nanoton,omitempty"`
	PriceSource    string         `json:"price_source,omitempty"`
	CollectionSlug string         `json:"collection_slug,omitempty"`
	TokenID        string         `json:"token_id,omitempty"`
	ImageURL       string         `json:"image_url,omitempty"`
}

type ScanResult struct {
	TelegramUserID int64          `json:"telegram_user_id"`
	TotalFetched   int            `json:"total_fetched"`
	Collectible    int            `json:"collectible_count"`
	Gifts          []ScannedGift  `json:"gifts"`
	Raw            []RawGiftEntry `json:"raw,omitempty"`
}

func ScanProfileGiftsOnce(ctx context.Context, cfg MTProtoConfig, target ScanTarget, opts ScanOptions) (*ScanResult, error) {
	if !cfg.Enabled() {
		return nil, ErrMTProtoNotConfigured
	}

	var result *ScanResult
	err := WithMTProtoAPI(ctx, cfg, func(ctx context.Context, api *tg.Client) error {
		resolved, err := resolveScanTarget(ctx, api, target)
		if err != nil {
			return err
		}
		var scanErr error
		result, scanErr = fetchProfileGifts(ctx, api, resolved, opts)
		return scanErr
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func WithMTProtoAPI(ctx context.Context, cfg MTProtoConfig, fn func(context.Context, *tg.Client) error) error {
	if !cfg.Enabled() {
		return ErrMTProtoNotConfigured
	}

	client := telegram.NewClient(cfg.AppID, cfg.AppHash, telegram.Options{
		SessionStorage: &telegram.FileSessionStorage{Path: cfg.SessionPath},
	})

	return client.Run(ctx, func(ctx context.Context) error {
		if err := ensureAuthorized(ctx, client); err != nil {
			return err
		}
		return fn(ctx, client.API())
	})
}

func SelfScanTarget(ctx context.Context, cfg MTProtoConfig) (ScanTarget, error) {
	var target ScanTarget
	err := WithMTProtoAPI(ctx, cfg, func(ctx context.Context, api *tg.Client) error {
		users, err := api.UsersGetUsers(ctx, []tg.InputUserClass{&tg.InputUserSelf{}})
		if err != nil {
			return fmt.Errorf("users.getUsers self: %w", err)
		}
		if len(users) == 0 {
			return errors.New("self user not returned")
		}
		user, ok := users[0].(*tg.User)
		if !ok {
			return fmt.Errorf("unexpected self user type %T", users[0])
		}
		target = ScanTarget{UserID: user.ID, AccessHash: user.AccessHash}
		return nil
	})
	return target, err
}

func SelfTelegramUserID(ctx context.Context, cfg MTProtoConfig) (int64, error) {
	target, err := SelfScanTarget(ctx, cfg)
	if err != nil {
		return 0, err
	}
	return target.UserID, nil
}

func ResolveTelegramUserByUsername(ctx context.Context, api *tg.Client, username string) (ScanTarget, error) {
	username = strings.TrimPrefix(strings.TrimSpace(username), "@")
	if username == "" {
		return ScanTarget{}, fmt.Errorf("empty username")
	}

	resolved, err := api.ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{
		Username: username,
	})
	if err != nil {
		return ScanTarget{}, fmt.Errorf("contacts.resolveUsername: %w", err)
	}

	for _, user := range resolved.Users {
		if u, ok := user.(*tg.User); ok {
			return ScanTarget{
				UserID:     u.ID,
				AccessHash: u.AccessHash,
				Username:   username,
			}, nil
		}
	}
	return ScanTarget{}, fmt.Errorf("username @%s not found", username)
}

// ResolveTelegramUserID resolves username to telegram user id.
func ResolveTelegramUserID(ctx context.Context, api *tg.Client, username string) (int64, error) {
	target, err := ResolveTelegramUserByUsername(ctx, api, username)
	if err != nil {
		return 0, err
	}
	return target.UserID, nil
}

func resolveScanTarget(ctx context.Context, api *tg.Client, target ScanTarget) (ScanTarget, error) {
	if target.Username != "" {
		return ResolveTelegramUserByUsername(ctx, api, target.Username)
	}
	if target.UserID == 0 {
		return ScanTarget{}, fmt.Errorf("scan target is empty")
	}
	if target.AccessHash != 0 {
		return target, nil
	}

	users, err := api.UsersGetUsers(ctx, []tg.InputUserClass{
		&tg.InputUser{UserID: target.UserID, AccessHash: target.AccessHash},
	})
	if err != nil {
		return ScanTarget{}, fmt.Errorf("users.getUsers: %w", err)
	}
	if len(users) == 0 {
		return ScanTarget{}, fmt.Errorf("telegram user %d not found; use -username if the profile has a public @username", target.UserID)
	}

	switch u := users[0].(type) {
	case *tg.User:
		return ScanTarget{UserID: u.ID, AccessHash: u.AccessHash}, nil
	case *tg.UserEmpty:
		return ScanTarget{}, fmt.Errorf("telegram user %d not found; use -username if the profile has a public @username", target.UserID)
	default:
		return ScanTarget{}, fmt.Errorf("unexpected user type %T", users[0])
	}
}

func fetchProfileGifts(ctx context.Context, api *tg.Client, target ScanTarget, opts ScanOptions) (*ScanResult, error) {
	logStep(opts.Log, "resolve", fmt.Sprintf("looking up telegram user id=%d access_hash=%d", target.UserID, target.AccessHash))
	peer, err := userPeer(target)
	if err != nil {
		return nil, err
	}
	logStep(opts.Log, "resolve", "peer resolved")

	result := &ScanResult{
		TelegramUserID: target.UserID,
		Gifts:          []ScannedGift{},
	}
	if opts.Log != nil || opts.IncludeRegular {
		result.Raw = []RawGiftEntry{}
	}

	offset := ""
	page := 0
	for {
		page++
		logStep(opts.Log, "api", fmt.Sprintf("payments.getSavedStarGifts page=%d offset=%q", page, offset))

		req := &tg.PaymentsGetSavedStarGiftsRequest{
			Peer:   peer,
			Offset: offset,
			Limit:  100,
		}
		resp, err := api.PaymentsGetSavedStarGifts(ctx, req)
		if err != nil {
			return nil, fmt.Errorf("payments.getSavedStarGifts: %w", err)
		}

		logStep(opts.Log, "api", fmt.Sprintf("page=%d count=%d gifts=%d next=%q", page, resp.Count, len(resp.Gifts), rawNextOffset(resp)))

		for _, saved := range resp.Gifts {
			result.TotalFetched++
			entry := rawGiftEntry(saved)

			switch gift := saved.Gift.(type) {
			case *tg.StarGiftUnique:
				if gift.Slug == "" {
					continue
				}
				mapped := mapUniqueGift(gift)
				result.Gifts = append(result.Gifts, mapped)
				result.Collectible++
				entry.Kind = "unique"
				entry.Slug = mapped.Slug
				entry.Title = mapped.Name
				entry.Num = gift.Num
				entry.Attributes = mapped.Attributes
				entry.PriceNanoton = mapped.PriceNanoton
				entry.CollectionSlug = mapped.CollectionSlug
				entry.TokenID = mapped.TokenID
				entry.ImageURL = mapped.ImageURL
			default:
				entry.Kind = fmt.Sprintf("%T", saved.Gift)
			}

			if opts.Log != nil || opts.IncludeRegular {
				result.Raw = append(result.Raw, entry)
			}
		}

		nextOffset, ok := resp.GetNextOffset()
		if !ok || nextOffset == "" {
			break
		}
		offset = nextOffset
	}

	logStep(opts.Log, "done", fmt.Sprintf("fetched=%d collectible=%d", result.TotalFetched, result.Collectible))
	return result, nil
}

func userPeer(target ScanTarget) (tg.InputPeerClass, error) {
	if target.UserID == 0 {
		return nil, fmt.Errorf("telegram user id is required")
	}
	if target.AccessHash == 0 {
		return nil, fmt.Errorf("telegram user %d: missing access_hash; use -username if the profile has a public @username", target.UserID)
	}
	return &tg.InputPeerUser{
		UserID:     target.UserID,
		AccessHash: target.AccessHash,
	}, nil
}

func ensureAuthorized(ctx context.Context, client *telegram.Client) error {
	status, err := client.Auth().Status(ctx)
	if err != nil {
		return fmt.Errorf("telegram auth status: %w", err)
	}
	if status.Authorized {
		return nil
	}
	return fmt.Errorf("%w; run: make tg-auth", ErrMTProtoUnauthorized)
}

func rawGiftEntry(saved tg.SavedStarGift) RawGiftEntry {
	entry := RawGiftEntry{
		Unsaved:     saved.Unsaved,
		PinnedToTop: saved.PinnedToTop,
	}
	if unique, ok := saved.Gift.(*tg.StarGiftUnique); ok {
		entry.Kind = "unique"
		entry.Slug = unique.Slug
		entry.Title = unique.Title
		entry.Num = unique.Num
		entry.Attributes = extractGiftAttributes(unique.Attributes)
		entry.PriceNanoton = giftPriceNanoton(unique)
	}
	return entry
}

func rawNextOffset(resp *tg.PaymentsSavedStarGifts) string {
	if offset, ok := resp.GetNextOffset(); ok {
		return offset
	}
	return ""
}

func logStep(log ScanLog, step, detail string) {
	if log != nil {
		log(step, detail)
	}
}

func mapUniqueGift(g *tg.StarGiftUnique) ScannedGift {
	collection, tokenID := parseGiftSlug(g.Slug)
	name := g.Title
	if g.Num > 0 {
		name = fmt.Sprintf("%s #%d", g.Title, g.Num)
	}

	return ScannedGift{
		Slug:           g.Slug,
		Name:           name,
		CollectionSlug: collection,
		TokenID:        tokenID,
		ImageURL:       fragmentGiftImageURL(g.Slug),
		Attributes:     extractGiftAttributes(g.Attributes),
		PriceNanoton:   giftPriceNanoton(g),
	}
}

func extractGiftAttributes(attrs []tg.StarGiftAttributeClass) GiftAttributes {
	var out GiftAttributes
	for _, attr := range attrs {
		switch v := attr.(type) {
		case *tg.StarGiftAttributeModel:
			out.Model = v.Name
		case *tg.StarGiftAttributeBackdrop:
			out.Backdrop = v.Name
		case *tg.StarGiftAttributePattern:
			out.Symbol = v.Name
		}
	}
	return out
}

func parseGiftSlug(slug string) (collection, tokenID string) {
	idx := strings.LastIndex(slug, "-")
	if idx <= 0 {
		return slug, ""
	}
	return slug[:idx], slug[idx+1:]
}

func fragmentGiftImageURL(slug string) string {
	return giftimage.ProxyPath(slug)
}

func giftPriceNanoton(g *tg.StarGiftUnique) int64 {
	if amount, ok := g.GetValueAmount(); ok && amount > 0 {
		if cur, hasCur := g.GetValueCurrency(); !hasCur || strings.EqualFold(cur, "TON") {
			return amount
		}
	}

	if amounts, ok := g.GetResellAmount(); ok {
		for _, amount := range amounts {
			if ton, ok := amount.(*tg.StarsTonAmount); ok && ton.Amount > 0 {
				return ton.Amount
			}
		}
	}

	return 0
}

func ParseTelegramAppID(raw string) int {
	if raw == "" {
		return 0
	}
	id, err := strconv.Atoi(raw)
	if err != nil {
		return 0
	}
	return id
}

func (r *ScanResult) JSON(pretty bool) ([]byte, error) {
	if pretty {
		return json.MarshalIndent(r, "", "  ")
	}
	return json.Marshal(r)
}
