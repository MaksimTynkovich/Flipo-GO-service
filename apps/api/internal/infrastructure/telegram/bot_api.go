package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type BotAPI struct {
	token      string
	httpClient *http.Client
}

func NewBotAPI(token string) *BotAPI {
	return &BotAPI{
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (b *BotAPI) Enabled() bool {
	return b.token != ""
}

func (b *BotAPI) SendMessage(ctx context.Context, chatID int64, text string) error {
	return b.sendMessage(ctx, chatID, text, nil)
}

func (b *BotAPI) sendMessage(ctx context.Context, chatID int64, text string, replyMarkup any) error {
	if !b.Enabled() || chatID == 0 {
		return nil
	}

	payload := map[string]any{
		"chat_id": chatID,
		"text":    text,
	}
	if replyMarkup != nil {
		payload["reply_markup"] = replyMarkup
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram sendMessage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var result struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		if strings.Contains(strings.ToLower(result.Description), "chat not found") ||
			strings.Contains(strings.ToLower(result.Description), "bot was blocked") {
			slog.Warn("telegram sendMessage skipped", "chat_id", chatID, "reason", result.Description)
			return nil
		}
		return fmt.Errorf("telegram sendMessage status %d: %s", resp.StatusCode, result.Description)
	}
	return nil
}

func (b *BotAPI) SetWebhook(ctx context.Context, webhookURL, secret string) error {
	if !b.Enabled() || webhookURL == "" {
		return nil
	}

	form := url.Values{}
	form.Set("url", webhookURL)
	form.Set("allowed_updates", `["message"]`)
	if secret != "" {
		form.Set("secret_token", secret)
	}

	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram setWebhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var result struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		return fmt.Errorf("telegram setWebhook status %d: %s", resp.StatusCode, result.Description)
	}
	return nil
}
