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

func (n *BotNotifier) SendDailyStakingYield(ctx context.Context, telegramUserID int64, yieldNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 || yieldNanoton <= 0 {
		return nil
	}
	text := fmt.Sprintf("📈 За вчера стейкинг принёс %s TON", formatTON(yieldNanoton))
	return n.sendMessage(ctx, telegramUserID, text)
}

func (n *BotNotifier) SendWeeklyStakingComplete(ctx context.Context, telegramUserID int64, totalYieldNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}
	text := "✅ Недельный стейкинг завершён!\n\n"
	if totalYieldNanoton > 0 {
		text += fmt.Sprintf("Доход за неделю: %s TON — зачислен на баланс.\n\n", formatTON(totalYieldNanoton))
	} else {
		text += "Доход за неделю: 0 TON.\n\n"
	}
	text += "Пора добавить подарки в новый стейкинг."
	return n.sendMessage(ctx, telegramUserID, text)
}

func formatTON(nanoton int64) string {
	if nanoton <= 0 {
		return "0"
	}
	ton := float64(nanoton) / 1_000_000_000
	prec := 2
	if ton < 0.01 {
		prec = 6
	} else if ton < 1 {
		prec = 4
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.*f", prec, ton), "0"), ".")
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
