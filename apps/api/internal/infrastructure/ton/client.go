package ton

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	tonapi "github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type IncomingTransfer struct {
	TxHash  string
	LT      int64
	Amount  int64
	Comment string
	From    string
}

type Verifier interface {
	FindDepositByComment(ctx context.Context, depositAddress, comment string, minAmount int64) (*IncomingTransfer, error)
	VerifyTxHash(ctx context.Context, txHash string) (bool, error)
}

type Sender interface {
	SendTON(ctx context.Context, toAddress string, amountNanoton int64, comment string) (txHash string, lt int64, err error)
	Enabled() bool
}

type Client struct {
	baseURL        string
	apiKey         string
	depositAddress string
	httpClient     *http.Client
	devMode        bool
	liteConfigURL  string
	seedPhrase     string
	walletVersion  string

	initOnce  sync.Once
	initErr   error
	api       *tonapi.APIClient
	hotWallet *wallet.Wallet
}

func NewClient(baseURL, apiKey, depositAddress string, devMode bool, liteConfigURL, seedPhrase, walletVersion string) *Client {
	return &Client{
		baseURL:        strings.TrimRight(baseURL, "/"),
		apiKey:         apiKey,
		depositAddress: depositAddress,
		devMode:        devMode,
		httpClient:     &http.Client{Timeout: 15 * time.Second},
		liteConfigURL:  liteConfigURL,
		seedPhrase:     strings.TrimSpace(seedPhrase),
		walletVersion:  strings.TrimSpace(walletVersion),
	}
}

func (c *Client) DepositAddress() string {
	return c.depositAddress
}

func (c *Client) Enabled() bool {
	return c.depositAddress != ""
}

func (c *Client) CanSend() bool {
	if c.devMode {
		return true
	}
	return c.seedPhrase != "" && c.liteConfigURL != ""
}

func (c *Client) FindDepositByComment(ctx context.Context, depositAddress, comment string, minAmount int64) (*IncomingTransfer, error) {
	if c.devMode {
		return nil, nil
	}
	if depositAddress == "" {
		return nil, errors.New("deposit address not configured")
	}

	txs, err := c.getTransactions(ctx, depositAddress, 40)
	if err != nil {
		return nil, err
	}
	for _, tx := range txs {
		if tx.Comment != comment {
			continue
		}
		if tx.Amount < minAmount {
			continue
		}
		return &tx, nil
	}
	return nil, nil
}

func (c *Client) VerifyTxHash(ctx context.Context, txHash string) (bool, error) {
	if c.devMode {
		return txHash != "", nil
	}
	txs, err := c.getTransactions(ctx, c.depositAddress, 80)
	if err != nil {
		return false, err
	}
	for _, tx := range txs {
		if tx.TxHash == txHash {
			return true, nil
		}
	}
	return false, nil
}

func (c *Client) SendTON(ctx context.Context, toAddress string, amountNanoton int64, comment string) (string, int64, error) {
	if c.devMode {
		return fmt.Sprintf("dev-withdraw-%d", time.Now().UnixNano()), time.Now().UnixNano(), nil
	}
	if amountNanoton <= 0 {
		return "", 0, errors.New("invalid withdrawal amount")
	}
	if err := c.ensureWallet(ctx); err != nil {
		return "", 0, err
	}

	addr, err := address.ParseAddr(toAddress)
	if err != nil {
		return "", 0, fmt.Errorf("parse destination address: %w", err)
	}

	transfer, err := c.hotWallet.BuildTransfer(addr, nanotonsToCoins(amountNanoton), false, comment)
	if err != nil {
		return "", 0, fmt.Errorf("build transfer: %w", err)
	}
	tx, _, err := c.hotWallet.SendWaitTransaction(ctx, transfer)
	if err != nil {
		return "", 0, fmt.Errorf("send transaction: %w", err)
	}

	txHash := base64.StdEncoding.EncodeToString(tx.Hash)
	var lt int64
	if tx.LT != 0 {
		lt = int64(tx.LT)
	}
	return txHash, lt, nil
}

func (c *Client) getTransactions(ctx context.Context, address string, limit int) ([]IncomingTransfer, error) {
	endpoint := fmt.Sprintf("%s/getTransactions", c.baseURL)
	q := url.Values{}
	q.Set("address", address)
	q.Set("limit", fmt.Sprintf("%d", limit))
	q.Set("archival", "true")
	if c.apiKey != "" {
		q.Set("api_key", c.apiKey)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ton api status %d", resp.StatusCode)
	}

	var payload struct {
		OK     bool `json:"ok"`
		Result []struct {
			TransactionID struct {
				Hash string `json:"hash"`
				LT   string `json:"lt"`
			} `json:"transaction_id"`
			InMsg struct {
				Source      string `json:"source"`
				Value       string `json:"value"`
				Message     string `json:"message"`
				MsgData     struct {
					Text string `json:"text"`
					Body string `json:"body"`
				} `json:"msg_data"`
			} `json:"in_msg"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if !payload.OK {
		return nil, errors.New("ton api returned not ok")
	}

	out := make([]IncomingTransfer, 0, len(payload.Result))
	for _, item := range payload.Result {
		comment := decodeComment(item.InMsg.Message, item.InMsg.MsgData.Text, item.InMsg.MsgData.Body)
		amount, _ := parseAmount(item.InMsg.Value)
		lt, _ := parseLT(item.TransactionID.LT)
		out = append(out, IncomingTransfer{
			TxHash:  item.TransactionID.Hash,
			LT:      lt,
			Amount:  amount,
			Comment: comment,
			From:    item.InMsg.Source,
		})
	}
	return out, nil
}

func decodeComment(parts ...string) string {
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.HasPrefix(part, "flipo:") {
			return part
		}
		if decoded, err := base64.StdEncoding.DecodeString(part); err == nil {
			text := strings.TrimSpace(string(decoded))
			if strings.HasPrefix(text, "flipo:") {
				return text
			}
		}
		if decoded, err := base64.RawStdEncoding.DecodeString(part); err == nil {
			text := strings.TrimSpace(string(decoded))
			if strings.HasPrefix(text, "flipo:") {
				return text
			}
		}
	}
	return ""
}

func parseAmount(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	var value int64
	_, err := fmt.Sscan(raw, &value)
	return value, err
}

func parseLT(raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	var value int64
	_, err := fmt.Sscan(raw, &value)
	return value, err
}

func nanotonsToCoins(amount int64) tlb.Coins {
	return tlb.MustFromTON(formatTonAmount(amount))
}

func formatTonAmount(nanoton int64) string {
	if nanoton == 0 {
		return "0"
	}
	whole := nanoton / 1_000_000_000
	frac := nanoton % 1_000_000_000
	if frac == 0 {
		return fmt.Sprintf("%d", whole)
	}
	fracStr := fmt.Sprintf("%09d", frac)
	fracStr = strings.TrimRight(fracStr, "0")
	return fmt.Sprintf("%d.%s", whole, fracStr)
}

func (c *Client) ensureWallet(ctx context.Context) error {
	c.initOnce.Do(func() {
		if c.seedPhrase == "" {
			c.initErr = errors.New("hot wallet seed phrase not configured")
			return
		}
		if c.liteConfigURL == "" {
			c.initErr = errors.New("TON lite config URL not configured")
			return
		}

		pool := liteclient.NewConnectionPool()
		if err := pool.AddConnectionsFromConfigUrl(ctx, c.liteConfigURL); err != nil {
			c.initErr = fmt.Errorf("connect lite servers: %w", err)
			return
		}

		api := tonapi.NewAPIClient(pool)
		version := wallet.V3R2
		switch strings.ToUpper(c.walletVersion) {
		case "", "V3R2":
			version = wallet.V3R2
		case "V3":
			version = wallet.V3
		case "V4R2":
			version = wallet.V4R2
		default:
			c.initErr = fmt.Errorf("unsupported TON wallet version: %s", c.walletVersion)
			return
		}

		words := strings.Fields(c.seedPhrase)
		w, err := wallet.FromSeed(api, words, version)
		if err != nil {
			c.initErr = fmt.Errorf("init hot wallet from seed: %w", err)
			return
		}

		c.api = api
		c.hotWallet = w
	})
	return c.initErr
}
