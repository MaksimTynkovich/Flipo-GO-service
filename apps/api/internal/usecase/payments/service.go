package payments

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/cryptopay"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Config struct {
	MinDepositNanoton int64
	DepositTTL        time.Duration
	StarsUSDRate      float64 // USD per 1 Telegram Star (market-ish list price)
	WebAppURL         string
	BotUsername       string
}

type Service struct {
	users     domain.UserRepository
	intents   domain.PaymentIntentRepository
	crypto    *cryptopay.Client
	bot       *telegram.BotAPI
	cfg       Config
	notifier  balance.BalanceNotifier
	admin     AdminNotifier
	analytics *analyticsuc.Service
}

type AdminNotifier interface {
	NotifyAltDepositAttempt(ctx context.Context, actor telegram.AdminActor, amountNanoton int64, provider string, providerAmount string)
	NotifyAltDepositConfirmed(ctx context.Context, actor telegram.AdminActor, amountNanoton int64, provider string)
}

func NewService(
	users domain.UserRepository,
	intents domain.PaymentIntentRepository,
	crypto *cryptopay.Client,
	bot *telegram.BotAPI,
	cfg Config,
) *Service {
	if cfg.DepositTTL <= 0 {
		cfg.DepositTTL = 30 * time.Minute
	}
	if cfg.StarsUSDRate <= 0 {
		cfg.StarsUSDRate = 0.013 // ~Telegram Stars list price in USD
	}
	if cfg.MinDepositNanoton <= 0 {
		cfg.MinDepositNanoton = 100_000_000
	}
	return &Service{users: users, intents: intents, crypto: crypto, bot: bot, cfg: cfg}
}

func (s *Service) SetBalanceNotifier(n balance.BalanceNotifier) { s.notifier = n }
func (s *Service) SetAdminNotifier(n AdminNotifier)             { s.admin = n }
func (s *Service) SetAnalytics(a *analyticsuc.Service)          { s.analytics = a }

func (s *Service) CryptoBotEnabled() bool { return s.crypto != nil && s.crypto.Enabled() }
func (s *Service) StarsEnabled() bool     { return s.bot != nil && s.bot.Enabled() }

type FeaturesView struct {
	CryptoBotEnabled  bool    `json:"cryptobot_enabled"`
	StarsEnabled      bool    `json:"stars_enabled"`
	MinDepositNanoton int64   `json:"min_deposit_nanoton"`
	StarsUSDRate      float64 `json:"stars_usd_rate"`
	TonUSDRate        float64 `json:"ton_usd_rate,omitempty"`
}

type IntentView struct {
	ID               string `json:"id"`
	Provider         string `json:"provider"`
	Status           string `json:"status"`
	AmountNanoton    int64  `json:"amount_nanoton"`
	ProviderAmount   string `json:"provider_amount"`
	ProviderCurrency string `json:"provider_currency"`
	PayURL           string `json:"pay_url,omitempty"`
	StarsCount       int64  `json:"stars_count,omitempty"`
	TonUSDRate       string `json:"ton_usd_rate,omitempty"`
	StarsUSDRate     string `json:"stars_usd_rate,omitempty"`
	ExpiresAt        string `json:"expires_at,omitempty"`
}

type StarsQuoteView struct {
	AmountNanoton int64   `json:"amount_nanoton"`
	StarsCount    int64   `json:"stars_count"`
	TonUSDRate    float64 `json:"ton_usd_rate"`
	StarsUSDRate  float64 `json:"stars_usd_rate"`
	USDValue      float64 `json:"usd_value"`
}

func (s *Service) Features(ctx context.Context) FeaturesView {
	out := FeaturesView{
		CryptoBotEnabled:  s.CryptoBotEnabled(),
		StarsEnabled:      s.StarsEnabled(),
		MinDepositNanoton: s.cfg.MinDepositNanoton,
		StarsUSDRate:      s.cfg.StarsUSDRate,
	}
	if s.CryptoBotEnabled() {
		if rate, err := s.crypto.TonUSDRate(ctx); err == nil {
			out.TonUSDRate = rate
		}
	}
	return out
}

func (s *Service) QuoteStars(ctx context.Context, amountNanoton, starsCount int64) (*StarsQuoteView, error) {
	tonUSD, err := s.tonUSDRate(ctx)
	if err != nil {
		return nil, err
	}
	if starsCount > 0 {
		if starsCount < 1 {
			return nil, domain.ErrInvalidAmount
		}
		nanoton := s.nanotonFromStars(starsCount, tonUSD)
		usd := float64(starsCount) * s.cfg.StarsUSDRate
		return &StarsQuoteView{
			AmountNanoton: nanoton,
			StarsCount:    starsCount,
			TonUSDRate:    tonUSD,
			StarsUSDRate:  s.cfg.StarsUSDRate,
			USDValue:      usd,
		}, nil
	}
	if amountNanoton < s.cfg.MinDepositNanoton {
		return nil, domain.ErrInvalidAmount
	}
	stars, usd := s.starsForNanoton(amountNanoton, tonUSD)
	return &StarsQuoteView{
		AmountNanoton: amountNanoton,
		StarsCount:    stars,
		TonUSDRate:    tonUSD,
		StarsUSDRate:  s.cfg.StarsUSDRate,
		USDValue:      usd,
	}, nil
}

func (s *Service) CreateCryptoBotIntent(ctx context.Context, userID uuid.UUID, amountNanoton int64) (*IntentView, error) {
	if !s.CryptoBotEnabled() {
		return nil, fmt.Errorf("crypto bot deposits disabled")
	}
	if amountNanoton < s.cfg.MinDepositNanoton {
		return nil, domain.ErrInvalidAmount
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	intentID := uuid.New()
	payload := fmt.Sprintf("cb:%s", strings.ReplaceAll(intentID.String(), "-", ""))
	tonAmount := formatTONAmount(amountNanoton)
	expiresAt := time.Now().UTC().Add(s.cfg.DepositTTL)

	inv, err := s.crypto.CreateInvoice(ctx, cryptopay.CreateInvoiceRequest{
		CurrencyType: "crypto",
		Asset:        "TON",
		Amount:       tonAmount,
		Description:  fmt.Sprintf("Flipo deposit · %s TON", tonAmount),
		Payload:      payload,
		ExpiresIn:    int(s.cfg.DepositTTL.Seconds()),
		PaidBtnName:  "openBot",
		PaidBtnURL:   firstNonEmpty(s.cfg.WebAppURL, "https://t.me/"+strings.TrimPrefix(s.cfg.BotUsername, "@")),
	})
	if err != nil {
		return nil, err
	}

	intent := &domain.PaymentIntent{
		ID:                intentID,
		UserID:            userID,
		Provider:          domain.PaymentProviderCryptoBot,
		Status:            domain.PaymentStatusAwaiting,
		AmountNanoton:     amountNanoton,
		ProviderAmount:    tonAmount,
		ProviderCurrency:  "TON",
		ProviderInvoiceID: strconv.FormatInt(inv.InvoiceID, 10),
		PayURL:            inv.PayURL(),
		Payload:           payload,
		ExpiresAt:         &expiresAt,
	}
	if err := s.intents.Create(ctx, intent); err != nil {
		return nil, err
	}
	if s.admin != nil {
		s.admin.NotifyAltDepositAttempt(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, amountNanoton, domain.PaymentProviderCryptoBot, tonAmount)
	}
	return toIntentView(intent), nil
}

func (s *Service) CreateStarsIntent(ctx context.Context, userID uuid.UUID, amountNanoton, starsCount int64) (*IntentView, error) {
	if !s.StarsEnabled() {
		return nil, fmt.Errorf("stars deposits disabled")
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user.TelegramID <= 0 {
		return nil, domain.ErrForbidden
	}

	tonUSD, err := s.tonUSDRate(ctx)
	if err != nil {
		return nil, err
	}

	var stars int64
	if starsCount > 0 {
		stars = starsCount
		amountNanoton = s.nanotonFromStars(stars, tonUSD)
	} else {
		if amountNanoton < s.cfg.MinDepositNanoton {
			return nil, domain.ErrInvalidAmount
		}
		stars, _ = s.starsForNanoton(amountNanoton, tonUSD)
	}
	if stars < 1 {
		return nil, domain.ErrInvalidAmount
	}
	if amountNanoton < s.cfg.MinDepositNanoton {
		return nil, domain.ErrInvalidAmount
	}

	intentID := uuid.New()
	payload := fmt.Sprintf("st:%s", strings.ReplaceAll(intentID.String(), "-", ""))
	expiresAt := time.Now().UTC().Add(s.cfg.DepositTTL)

	title := "пополнение баланса"
	description := fmt.Sprintf("Пополнение баланса на %s TON", formatTONAmount(amountNanoton))
	prices := []telegram.LabeledPrice{{Label: description, Amount: stars}}

	link, err := s.bot.CreateInvoiceLink(ctx, telegram.CreateInvoiceLinkRequest{
		Title:         title,
		Description:   description,
		Payload:       payload,
		Currency:      "XTR",
		Prices:        prices,
		ProviderToken: "", // empty for Telegram Stars
	})
	if err != nil {
		return nil, err
	}

	intent := &domain.PaymentIntent{
		ID:                intentID,
		UserID:            userID,
		Provider:          domain.PaymentProviderStars,
		Status:            domain.PaymentStatusAwaiting,
		AmountNanoton:     amountNanoton,
		ProviderAmount:    strconv.FormatInt(stars, 10),
		ProviderCurrency:  "XTR",
		ProviderInvoiceID: payload, // unique placeholder until telegram_payment_charge_id arrives
		PayURL:            link,
		Payload:           payload,
		TonUSDRate:        formatFloat(tonUSD),
		StarsUSDRate:      formatFloat(s.cfg.StarsUSDRate),
		ExpiresAt:         &expiresAt,
	}
	if err := s.intents.Create(ctx, intent); err != nil {
		return nil, err
	}
	if s.admin != nil {
		s.admin.NotifyAltDepositAttempt(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, amountNanoton, domain.PaymentProviderStars, strconv.FormatInt(stars, 10))
	}
	view := toIntentView(intent)
	view.StarsCount = stars
	return view, nil
}

func (s *Service) GetIntent(ctx context.Context, userID, intentID uuid.UUID) (*IntentView, error) {
	intent, err := s.intents.FindByIDForUser(ctx, intentID, userID)
	if err != nil {
		return nil, err
	}
	view := toIntentView(intent)
	if intent.Provider == domain.PaymentProviderStars {
		if n, err := strconv.ParseInt(intent.ProviderAmount, 10, 64); err == nil {
			view.StarsCount = n
		}
	}
	return view, nil
}

func (s *Service) HandleCryptoBotWebhook(ctx context.Context, body []byte, signature string) error {
	if !s.CryptoBotEnabled() {
		return fmt.Errorf("crypto bot disabled")
	}
	if signature != "" && !s.crypto.VerifyWebhookSignature(body, signature) {
		return domain.ErrForbidden
	}
	var update cryptopay.WebhookUpdate
	if err := json.Unmarshal(body, &update); err != nil {
		return err
	}
	if !strings.EqualFold(update.UpdateType, "invoice_paid") {
		return nil
	}
	var inv cryptopay.Invoice
	if err := json.Unmarshal(update.Payload, &inv); err != nil {
		return err
	}
	return s.completeCryptoBotInvoice(ctx, &inv)
}

func (s *Service) completeCryptoBotInvoice(ctx context.Context, inv *cryptopay.Invoice) error {
	if inv == nil || !strings.EqualFold(inv.Status, "paid") {
		return nil
	}
	var intent *domain.PaymentIntent
	var err error
	if payload := strings.TrimSpace(inv.Payload); payload != "" {
		intent, err = s.intents.FindByPayload(ctx, payload)
	}
	if err != nil || intent == nil {
		invoiceID := strconv.FormatInt(inv.InvoiceID, 10)
		intent, err = s.intents.FindByProviderInvoiceID(ctx, domain.PaymentProviderCryptoBot, invoiceID)
	}
	if err != nil {
		return err
	}
	return s.creditIntent(ctx, intent.ID)
}

func (s *Service) HandlePreCheckout(ctx context.Context, queryID, payload string) error {
	if queryID == "" {
		return nil
	}
	intent, err := s.intents.FindByPayload(ctx, strings.TrimSpace(payload))
	if err != nil || intent == nil || intent.Provider != domain.PaymentProviderStars {
		return s.bot.AnswerPreCheckoutQuery(ctx, queryID, false, "Счёт не найден или устарел")
	}
	if intent.Status != domain.PaymentStatusAwaiting {
		return s.bot.AnswerPreCheckoutQuery(ctx, queryID, false, "Счёт уже оплачен или недействителен")
	}
	if intent.ExpiresAt != nil && time.Now().UTC().After(*intent.ExpiresAt) {
		return s.bot.AnswerPreCheckoutQuery(ctx, queryID, false, "Счёт истёк")
	}
	return s.bot.AnswerPreCheckoutQuery(ctx, queryID, true, "")
}

func (s *Service) HandleSuccessfulPayment(ctx context.Context, telegramID int64, payload string, totalAmount int64, currency, telegramChargeID string) error {
	slog.Info("stars successful_payment received",
		"telegram_id", telegramID,
		"payload", strings.TrimSpace(payload),
		"total_amount", totalAmount,
		"currency", currency,
		"charge_id", telegramChargeID,
	)
	intent, err := s.intents.FindByPayload(ctx, strings.TrimSpace(payload))
	if err != nil {
		slog.Warn("stars payment intent not found", "payload", payload, "error", err)
		return err
	}
	if intent.Provider != domain.PaymentProviderStars {
		return nil
	}
	user, err := s.users.FindByID(ctx, intent.UserID)
	if err != nil {
		return err
	}
	if telegramID > 0 && user.TelegramID != telegramID {
		slog.Warn("stars payment telegram mismatch", "intent", intent.ID, "expected", user.TelegramID, "got", telegramID)
		return domain.ErrForbidden
	}
	if currency != "" && !strings.EqualFold(currency, "XTR") {
		return fmt.Errorf("unexpected stars currency %s", currency)
	}
	expected, _ := strconv.ParseInt(intent.ProviderAmount, 10, 64)
	if expected > 0 && totalAmount > 0 && totalAmount != expected {
		slog.Warn("stars amount mismatch", "intent", intent.ID, "expected", expected, "got", totalAmount)
	}
	if telegramChargeID != "" {
		intent.ProviderInvoiceID = telegramChargeID
		if err := s.intents.Update(ctx, intent); err != nil {
			slog.Warn("stars charge id update failed", "intent", intent.ID, "error", err)
		}
	}
	return s.creditIntent(ctx, intent.ID)
}

func (s *Service) creditIntent(ctx context.Context, intentID uuid.UUID) error {
	balanceAfter, credited, err := s.intents.CompleteAtomic(ctx, intentID)
	if err != nil {
		return err
	}
	if !credited {
		return nil
	}
	intent, err := s.intents.FindByID(ctx, intentID)
	if err != nil {
		return err
	}
	if s.notifier != nil {
		s.notifier.BalanceUpdated(intent.UserID, balanceAfter, intent.AmountNanoton, domain.LedgerDeposit)
	}
	user, userErr := s.users.FindByID(ctx, intent.UserID)
	if s.admin != nil && userErr == nil && user != nil {
		s.admin.NotifyAltDepositConfirmed(ctx, telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}, intent.AmountNanoton, intent.Provider)
	}
	if s.analytics != nil && userErr == nil && user != nil {
		uid := intent.UserID
		tgID := user.TelegramID
		s.analytics.Track(ctx, analyticsuc.EventInput{
			UserID:        &uid,
			ReferrerID:    user.ReferrerID,
			TelegramID:    &tgID,
			Source:        "api",
			EventName:     "deposit_confirmed",
			EventCategory: "wallet",
			Status:        "success",
			StakingTier:   string(user.StakingTier),
			Properties: map[string]any{
				"amount_nanoton":    intent.AmountNanoton,
				"provider":          intent.Provider,
				"provider_amount":   intent.ProviderAmount,
				"provider_currency": intent.ProviderCurrency,
				"intent_id":         intent.ID.String(),
			},
		})
	}
	slog.Info("alt deposit credited",
		"provider", intent.Provider,
		"intent_id", intent.ID,
		"user_id", intent.UserID,
		"amount_nanoton", intent.AmountNanoton,
	)
	return nil
}

func (s *Service) tonUSDRate(ctx context.Context) (float64, error) {
	if s.CryptoBotEnabled() {
		return s.crypto.TonUSDRate(ctx)
	}
	// Fallback if Crypto Bot is off — still allow Stars with a conservative default.
	return 5.0, nil
}

func (s *Service) starsForNanoton(amountNanoton int64, tonUSD float64) (stars int64, usd float64) {
	ton := float64(amountNanoton) / 1e9
	usd = ton * tonUSD
	if s.cfg.StarsUSDRate <= 0 {
		return int64(math.Ceil(usd)), usd
	}
	stars = int64(math.Ceil(usd / s.cfg.StarsUSDRate))
	if stars < 1 {
		stars = 1
	}
	return stars, usd
}

func (s *Service) nanotonFromStars(stars int64, tonUSD float64) int64 {
	if stars < 1 || tonUSD <= 0 || s.cfg.StarsUSDRate <= 0 {
		return 0
	}
	usd := float64(stars) * s.cfg.StarsUSDRate
	ton := usd / tonUSD
	nanoton := int64(math.Floor(ton*1e9 + 1e-9))
	if nanoton < 0 {
		return 0
	}
	return nanoton
}

func toIntentView(intent *domain.PaymentIntent) *IntentView {
	view := &IntentView{
		ID:               intent.ID.String(),
		Provider:         intent.Provider,
		Status:           intent.Status,
		AmountNanoton:    intent.AmountNanoton,
		ProviderAmount:   intent.ProviderAmount,
		ProviderCurrency: intent.ProviderCurrency,
		PayURL:           intent.PayURL,
		TonUSDRate:       intent.TonUSDRate,
		StarsUSDRate:     intent.StarsUSDRate,
	}
	if intent.ExpiresAt != nil {
		view.ExpiresAt = intent.ExpiresAt.UTC().Format(time.RFC3339)
	}
	return view
}

func formatTONAmount(nanoton int64) string {
	ton := float64(nanoton) / 1e9
	s := strconv.FormatFloat(ton, 'f', 9, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" {
		return "0"
	}
	return s
}

func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', 8, 64)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
