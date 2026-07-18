package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func normalizeChannelChatID(channel string) string {
	channel = strings.TrimSpace(channel)
	if channel == "" {
		return ""
	}
	if strings.HasPrefix(channel, "https://telegram.me/") {
		channel = strings.TrimPrefix(channel, "https://telegram.me/")
		channel = strings.Trim(strings.TrimSuffix(channel, "/"), "/")
	}
	if strings.HasPrefix(channel, "@") {
		return channel
	}
	if _, err := strconv.ParseInt(channel, 10, 64); err == nil {
		return channel
	}
	return "@" + strings.TrimPrefix(channel, "@")
}

func isActiveChannelMember(status string, isMember bool) bool {
	switch status {
	case "creator", "administrator", "member":
		return true
	case "restricted":
		return isMember
	default:
		return false
	}
}

func (b *BotAPI) IsChannelMember(ctx context.Context, channel string, userID int64) (bool, error) {
	if !b.Enabled() {
		return false, fmt.Errorf("telegram bot is not configured")
	}
	chatID := normalizeChannelChatID(channel)
	if chatID == "" || userID == 0 {
		return false, fmt.Errorf("не удалось проверить подписку на канал")
	}

	endpoint := fmt.Sprintf(
		"https://api.telegram.org/bot%s/getChatMember?chat_id=%s&user_id=%d",
		b.token,
		url.QueryEscape(chatID),
		userID,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false, err
	}

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("telegram getChatMember: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			Status   string `json:"status"`
			IsMember bool   `json:"is_member"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("telegram getChatMember decode: %w", err)
	}
	if !result.OK {
		desc := strings.ToLower(result.Description)
		// Treat "cannot verify" / not-a-member responses as unsubscribed, not as hard failures.
		// Mini App pages that check subscription on load must not 500 when the bot lacks
		// admin rights ("member list is inaccessible") or the user isn't in the channel.
		if strings.Contains(desc, "user not found") ||
			strings.Contains(desc, "not a member") ||
			strings.Contains(desc, "member list is inaccessible") ||
			strings.Contains(desc, "chat not found") ||
			strings.Contains(desc, "bot is not a member") {
			return false, nil
		}
		return false, fmt.Errorf("telegram getChatMember: %s", result.Description)
	}

	return isActiveChannelMember(result.Result.Status, result.Result.IsMember), nil
}
