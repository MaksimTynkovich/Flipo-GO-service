package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type BotNotifier struct {
	token      string
	httpClient *http.Client
}

func NewBotNotifier(token string) *BotNotifier {
	return &BotNotifier{
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (n *BotNotifier) Enabled() bool {
	return n.token != ""
}

func (n *BotNotifier) SendGiftDeposited(ctx context.Context, telegramUserID int64, giftName string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	text := fmt.Sprintf("🎁 Подарок «%s» зачислен в инвентарь!", giftName)
	return n.sendMessage(ctx, telegramUserID, text)
}

func (n *BotNotifier) sendMessage(ctx context.Context, chatID int64, text string) error {
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.token)
	form := url.Values{}
	form.Set("chat_id", fmt.Sprintf("%d", chatID))
	form.Set("text", text)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram sendMessage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var body struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if strings.Contains(strings.ToLower(body.Description), "chat not found") ||
			strings.Contains(strings.ToLower(body.Description), "bot was blocked") {
			slog.Warn("telegram notify skipped", "chat_id", chatID, "reason", body.Description)
			return nil
		}
		return fmt.Errorf("telegram sendMessage status %d: %s", resp.StatusCode, body.Description)
	}
	return nil
}
