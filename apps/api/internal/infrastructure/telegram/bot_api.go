package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
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
	return b.sendMessage(ctx, chatID, text, nil, "")
}

func (b *BotAPI) SendMessageWithMarkup(ctx context.Context, chatID int64, text string, replyMarkup any) error {
	return b.sendMessage(ctx, chatID, text, replyMarkup, "")
}

// SendPhotoWithMarkup sends a photo with optional caption and inline keyboard.
// photo may be a Telegram file_id, https URL, or absolute local filesystem path.
// On success returns a reusable file_id for subsequent sends.
func (b *BotAPI) SendPhotoWithMarkup(ctx context.Context, chatID int64, photo, caption string, replyMarkup any) (string, error) {
	if !b.Enabled() || chatID == 0 {
		return "", nil
	}
	photo = strings.TrimSpace(photo)
	if photo == "" {
		return "", fmt.Errorf("photo is required")
	}

	if isLocalPhotoFile(photo) {
		return b.sendPhotoMultipart(ctx, chatID, photo, caption, replyMarkup)
	}

	payload := map[string]any{
		"chat_id": chatID,
		"photo":   photo,
	}
	if caption != "" {
		payload["caption"] = caption
	}
	if replyMarkup != nil {
		payload["reply_markup"] = replyMarkup
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	return b.doSendPhoto(req, chatID)
}

func isLocalPhotoFile(photo string) bool {
	if strings.HasPrefix(photo, "http://") || strings.HasPrefix(photo, "https://") {
		return false
	}
	info, err := os.Stat(photo)
	return err == nil && !info.IsDir()
}

func (b *BotAPI) sendPhotoMultipart(ctx context.Context, chatID int64, filePath, caption string, replyMarkup any) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("open photo: %w", err)
	}
	defer file.Close()

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))
	if caption != "" {
		_ = w.WriteField("caption", caption)
	}
	if replyMarkup != nil {
		raw, err := json.Marshal(replyMarkup)
		if err != nil {
			return "", err
		}
		_ = w.WriteField("reply_markup", string(raw))
	}
	part, err := w.CreateFormFile("photo", filepath.Base(filePath))
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}

	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	return b.doSendPhoto(req, chatID)
}

func (b *BotAPI) doSendPhoto(req *http.Request, chatID int64) (string, error) {
	client := b.uploadClient()
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("telegram sendPhoto: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			Photo []struct {
				FileID string `json:"file_id"`
			} `json:"photo"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("telegram sendPhoto decode: %w", err)
	}
	if resp.StatusCode != http.StatusOK || !result.OK {
		if strings.Contains(strings.ToLower(result.Description), "chat not found") ||
			strings.Contains(strings.ToLower(result.Description), "bot was blocked") {
			slog.Warn("telegram sendPhoto skipped", "chat_id", chatID, "reason", result.Description)
			return "", nil
		}
		return "", fmt.Errorf("telegram sendPhoto status %d: %s", resp.StatusCode, result.Description)
	}
	fileID := ""
	if n := len(result.Result.Photo); n > 0 {
		fileID = result.Result.Photo[n-1].FileID
	}
	return fileID, nil
}

func (b *BotAPI) uploadClient() *http.Client {
	if b.httpClient != nil && b.httpClient.Timeout >= 60*time.Second {
		return b.httpClient
	}
	return &http.Client{Timeout: 60 * time.Second}
}

// SendMediaGroup sends 2–10 photos as an album. Caption is attached to the first photo.
// photo may be file_id, https URL, or local filesystem path. Returns reusable file_ids.
func (b *BotAPI) SendMediaGroup(ctx context.Context, chatID int64, photos []string, caption string) ([]string, error) {
	if !b.Enabled() || chatID == 0 {
		return nil, nil
	}
	if len(photos) < 2 {
		return nil, fmt.Errorf("sendMediaGroup requires at least 2 photos")
	}
	if len(photos) > 10 {
		return nil, fmt.Errorf("sendMediaGroup supports at most 10 photos")
	}

	needsMultipart := false
	for _, photo := range photos {
		if isLocalPhotoFile(strings.TrimSpace(photo)) {
			needsMultipart = true
			break
		}
	}
	if needsMultipart {
		return b.sendMediaGroupMultipart(ctx, chatID, photos, caption)
	}

	media := make([]map[string]any, 0, len(photos))
	for i, photo := range photos {
		item := map[string]any{
			"type":  "photo",
			"media": strings.TrimSpace(photo),
		}
		if i == 0 && caption != "" {
			item["caption"] = caption
		}
		media = append(media, item)
	}
	payload := map[string]any{
		"chat_id": chatID,
		"media":   media,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMediaGroup", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return b.doSendMediaGroup(req, chatID, len(photos))
}

func (b *BotAPI) sendMediaGroupMultipart(ctx context.Context, chatID int64, photos []string, caption string) ([]string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("chat_id", fmt.Sprintf("%d", chatID))

	media := make([]map[string]any, 0, len(photos))
	files := make([]*os.File, 0, len(photos))
	defer func() {
		for _, f := range files {
			_ = f.Close()
		}
	}()

	for i, photo := range photos {
		photo = strings.TrimSpace(photo)
		item := map[string]any{"type": "photo"}
		if i == 0 && caption != "" {
			item["caption"] = caption
		}
		if isLocalPhotoFile(photo) {
			attach := fmt.Sprintf("photo_%d", i)
			item["media"] = "attach://" + attach
			f, err := os.Open(photo)
			if err != nil {
				return nil, fmt.Errorf("open photo: %w", err)
			}
			files = append(files, f)
			part, err := w.CreateFormFile(attach, filepath.Base(photo))
			if err != nil {
				return nil, err
			}
			if _, err := io.Copy(part, f); err != nil {
				return nil, err
			}
		} else {
			item["media"] = photo
		}
		media = append(media, item)
	}

	raw, err := json.Marshal(media)
	if err != nil {
		return nil, err
	}
	if err := w.WriteField("media", string(raw)); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMediaGroup", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	return b.doSendMediaGroup(req, chatID, len(photos))
}

func (b *BotAPI) doSendMediaGroup(req *http.Request, chatID int64, expected int) ([]string, error) {
	resp, err := b.uploadClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("telegram sendMediaGroup: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      []struct {
			Photo []struct {
				FileID string `json:"file_id"`
			} `json:"photo"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("telegram sendMediaGroup decode: %w", err)
	}
	if resp.StatusCode != http.StatusOK || !result.OK {
		if strings.Contains(strings.ToLower(result.Description), "chat not found") ||
			strings.Contains(strings.ToLower(result.Description), "bot was blocked") {
			slog.Warn("telegram sendMediaGroup skipped", "chat_id", chatID, "reason", result.Description)
			return nil, nil
		}
		return nil, fmt.Errorf("telegram sendMediaGroup status %d: %s", resp.StatusCode, result.Description)
	}

	fileIDs := make([]string, 0, len(result.Result))
	for _, msg := range result.Result {
		if n := len(msg.Photo); n > 0 {
			fileIDs = append(fileIDs, msg.Photo[n-1].FileID)
		}
	}
	if len(fileIDs) != expected {
		return fileIDs, nil
	}
	return fileIDs, nil
}

func (b *BotAPI) AnswerCallbackQuery(ctx context.Context, callbackQueryID, text string, showAlert bool) error {
	if !b.Enabled() || callbackQueryID == "" {
		return nil
	}
	payload := map[string]any{
		"callback_query_id": callbackQueryID,
	}
	if text != "" {
		payload["text"] = text
	}
	if showAlert {
		payload["show_alert"] = true
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram answerCallbackQuery: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var result struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		return fmt.Errorf("telegram answerCallbackQuery status %d: %s", resp.StatusCode, result.Description)
	}
	return nil
}

func (b *BotAPI) EditMessageText(ctx context.Context, chatID int64, messageID int64, text string, replyMarkup any) error {
	if !b.Enabled() || chatID == 0 || messageID == 0 {
		return nil
	}
	payload := map[string]any{
		"chat_id":    chatID,
		"message_id": messageID,
		"text":       text,
	}
	if replyMarkup != nil {
		payload["reply_markup"] = replyMarkup
	} else {
		payload["reply_markup"] = InlineKeyboardMarkup{InlineKeyboard: [][]InlineKeyboardButton{}}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/editMessageText", b.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram editMessageText: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var result struct {
			Description string `json:"description"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		return fmt.Errorf("telegram editMessageText status %d: %s", resp.StatusCode, result.Description)
	}
	return nil
}

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

func (b *BotAPI) sendMessage(ctx context.Context, chatID int64, text string, replyMarkup any, parseMode string) error {
	if !b.Enabled() || chatID == 0 {
		return nil
	}

	payload := map[string]any{
		"chat_id": chatID,
		"text":    text,
	}
	if parseMode != "" {
		payload["parse_mode"] = parseMode
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
	form.Set("allowed_updates", `["message","callback_query"]`)
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
