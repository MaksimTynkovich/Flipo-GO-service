package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gotd/td/tg"
)

const mrktAuthURL = "https://api.tgmrkt.io/api/v1/auth"

// FetchMRKTAuthToken obtains a fresh MRKT API token using the configured MTProto session.
func FetchMRKTAuthToken(ctx context.Context, cfg MTProtoConfig) (string, error) {
	if !cfg.Enabled() {
		return "", ErrMTProtoNotConfigured
	}

	var initData string
	err := WithMTProtoAPI(ctx, cfg, func(ctx context.Context, api *tg.Client) error {
		bot, err := ResolveTelegramUserByUsername(ctx, api, "mrkt")
		if err != nil {
			return fmt.Errorf("resolve @mrkt: %w", err)
		}

		inputApp := &tg.InputBotAppShortName{
			BotID: &tg.InputUser{
				UserID:     bot.UserID,
				AccessHash: bot.AccessHash,
			},
			ShortName: "app",
		}

		if _, err := api.MessagesGetBotApp(ctx, &tg.MessagesGetBotAppRequest{App: inputApp}); err != nil {
			return fmt.Errorf("messages.getBotApp: %w", err)
		}

		webView, err := api.MessagesRequestAppWebView(ctx, &tg.MessagesRequestAppWebViewRequest{
			Peer: &tg.InputPeerUser{
				UserID:     bot.UserID,
				AccessHash: bot.AccessHash,
			},
			App:      inputApp,
			Platform: "android",
		})
		if err != nil {
			return fmt.Errorf("messages.requestAppWebView: %w", err)
		}
		if webView == nil || webView.URL == "" {
			return fmt.Errorf("empty webview url")
		}

		parsed, err := extractTgWebAppData(webView.URL)
		if err != nil {
			return err
		}
		initData = parsed
		return nil
	})
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	body, err := json.Marshal(map[string]string{"data": initData})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, mrktAuthURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("mrkt auth: status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var payload struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", fmt.Errorf("decode mrkt auth: %w", err)
	}
	if strings.TrimSpace(payload.Token) == "" {
		return "", fmt.Errorf("mrkt auth: empty token")
	}
	return payload.Token, nil
}

func extractTgWebAppData(webViewURL string) (string, error) {
	const marker = "tgWebAppData="
	idx := strings.Index(webViewURL, marker)
	if idx < 0 {
		return "", fmt.Errorf("tgWebAppData missing in webview url")
	}
	rest := webViewURL[idx+len(marker):]
	if cut := strings.Index(rest, "&tgWebAppVersion"); cut >= 0 {
		rest = rest[:cut]
	}
	decoded, err := url.QueryUnescape(rest)
	if err != nil {
		return "", fmt.Errorf("decode tgWebAppData: %w", err)
	}
	// Telegram encodes tgWebAppData twice in the webview fragment (#tgWebAppData=user%3D%257B...).
	if twice, err := url.QueryUnescape(decoded); err == nil && twice != "" {
		decoded = twice
	}
	if decoded == "" {
		return "", fmt.Errorf("tgWebAppData empty")
	}
	return decoded, nil
}
