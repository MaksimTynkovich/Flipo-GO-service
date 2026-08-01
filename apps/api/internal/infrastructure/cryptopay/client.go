package cryptopay

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const defaultBaseURL = "https://pay.crypt.bot/api"

type Client struct {
	token      string
	baseURL    string
	httpClient *http.Client
}

func NewClient(token, baseURL string) *Client {
	token = strings.TrimSpace(token)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{
		token:   token,
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.token != ""
}

type apiResponse[T any] struct {
	OK     bool            `json:"ok"`
	Result T               `json:"result"`
	Error  json.RawMessage `json:"error"`
}

type Invoice struct {
	InvoiceID         int64  `json:"invoice_id"`
	Hash              string `json:"hash"`
	CurrencyType      string `json:"currency_type"`
	Asset             string `json:"asset"`
	Amount            string `json:"amount"`
	BotInvoiceURL     string `json:"bot_invoice_url"`
	MiniAppInvoiceURL string `json:"mini_app_invoice_url"`
	WebAppInvoiceURL  string `json:"web_app_invoice_url"`
	Description       string `json:"description"`
	Status            string `json:"status"`
	Payload           string `json:"payload"`
	PaidAt            string `json:"paid_at"`
}

type ExchangeRate struct {
	IsValid  bool   `json:"is_valid"`
	IsCrypto bool   `json:"is_crypto"`
	IsFiat   bool   `json:"is_fiat"`
	Source   string `json:"source"`
	Target   string `json:"target"`
	Rate     string `json:"rate"`
}

type CreateInvoiceRequest struct {
	CurrencyType string `json:"currency_type,omitempty"`
	Asset        string `json:"asset,omitempty"`
	Amount       string `json:"amount"`
	Description  string `json:"description,omitempty"`
	Payload      string `json:"payload,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	PaidBtnName  string `json:"paid_btn_name,omitempty"`
	PaidBtnURL   string `json:"paid_btn_url,omitempty"`
	SwapTo       string `json:"swap_to,omitempty"`
}

type WebhookUpdate struct {
	UpdateID   int64           `json:"update_id"`
	UpdateType string          `json:"update_type"`
	RequestDate string         `json:"request_date"`
	Payload    json.RawMessage `json:"payload"`
}

func (c *Client) CreateInvoice(ctx context.Context, req CreateInvoiceRequest) (*Invoice, error) {
	var out Invoice
	if err := c.post(ctx, "createInvoice", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetInvoices(ctx context.Context, invoiceIDs string) ([]Invoice, error) {
	var out []Invoice
	body := map[string]any{}
	if invoiceIDs != "" {
		body["invoice_ids"] = invoiceIDs
	}
	if err := c.post(ctx, "getInvoices", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) GetExchangeRates(ctx context.Context) ([]ExchangeRate, error) {
	var out []ExchangeRate
	if err := c.post(ctx, "getExchangeRates", map[string]any{}, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// TonUSDRate returns TON priced in USD from Crypto Pay rates.
func (c *Client) TonUSDRate(ctx context.Context) (float64, error) {
	rates, err := c.GetExchangeRates(ctx)
	if err != nil {
		return 0, err
	}
	for _, r := range rates {
		if !r.IsValid {
			continue
		}
		if strings.EqualFold(r.Source, "TON") && strings.EqualFold(r.Target, "USD") {
			v, err := strconv.ParseFloat(strings.TrimSpace(r.Rate), 64)
			if err != nil || v <= 0 {
				return 0, fmt.Errorf("invalid TON/USD rate %q", r.Rate)
			}
			return v, nil
		}
	}
	return 0, fmt.Errorf("TON/USD rate not found")
}

func (c *Client) VerifyWebhookSignature(body []byte, signatureHeader string) bool {
	if !c.Enabled() || signatureHeader == "" {
		return false
	}
	secret := sha256.Sum256([]byte(c.token))
	mac := hmac.New(sha256.New, secret[:])
	_, _ = mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(expected)), []byte(strings.ToLower(strings.TrimSpace(signatureHeader))))
}

func (c *Client) post(ctx context.Context, method string, payload any, dest any) error {
	if !c.Enabled() {
		return fmt.Errorf("crypto pay disabled")
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/"+method, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Crypto-Pay-API-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	var parsed apiResponse[json.RawMessage]
	if err := json.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("cryptopay %s: decode: %w (%s)", method, err, truncate(string(body), 200))
	}
	if !parsed.OK {
		return fmt.Errorf("cryptopay %s: %s", method, truncate(string(parsed.Error), 200))
	}
	if dest == nil || len(parsed.Result) == 0 || string(parsed.Result) == "null" {
		return nil
	}
	if err := json.Unmarshal(parsed.Result, dest); err != nil {
		return fmt.Errorf("cryptopay %s: result: %w", method, err)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// PayURL prefers Telegram bot deep-link (opens inside Telegram clients).
func (inv *Invoice) PayURL() string {
	if inv == nil {
		return ""
	}
	for _, u := range []string{inv.BotInvoiceURL, inv.MiniAppInvoiceURL, inv.WebAppInvoiceURL} {
		if strings.TrimSpace(u) != "" {
			return u
		}
	}
	return ""
}
