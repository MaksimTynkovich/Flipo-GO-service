package telegram

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var nftPageDescriptionPattern = regexp.MustCompile(`property="og:description"\s+content="([^"]+)"`)

// ParseGiftSlug splits a collectible slug like "surgeBoard-1081" into collection and token id.
func ParseGiftSlug(slug string) (collection, tokenID string) {
	return parseGiftSlug(slug)
}

// FetchNFTPageTraits loads model/backdrop/symbol from the public t.me/nft page.
func FetchNFTPageTraits(ctx context.Context, slug string) (GiftAttributes, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return GiftAttributes{}, fmt.Errorf("gift slug is required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://t.me/nft/"+slug, nil)
	if err != nil {
		return GiftAttributes{}, err
	}
	req.Header.Set("User-Agent", "flipo-gift-quote/1.0")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return GiftAttributes{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return GiftAttributes{}, fmt.Errorf("t.me/nft/%s: status %d", slug, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return GiftAttributes{}, err
	}

	match := nftPageDescriptionPattern.FindSubmatch(body)
	if len(match) < 2 {
		return GiftAttributes{}, fmt.Errorf("traits not found on t.me/nft/%s", slug)
	}

	return parseNFTPageDescription(string(match[1]))
}

func parseNFTPageDescription(description string) (GiftAttributes, error) {
	var attrs GiftAttributes
	for _, line := range strings.Split(description, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Model:"):
			attrs.Model = strings.TrimSpace(strings.TrimPrefix(line, "Model:"))
		case strings.HasPrefix(line, "Backdrop:"):
			attrs.Backdrop = strings.TrimSpace(strings.TrimPrefix(line, "Backdrop:"))
		case strings.HasPrefix(line, "Symbol:"):
			attrs.Symbol = strings.TrimSpace(strings.TrimPrefix(line, "Symbol:"))
		}
	}
	if attrs.Model == "" && attrs.Backdrop == "" && attrs.Symbol == "" {
		return GiftAttributes{}, fmt.Errorf("no traits in page description")
	}
	return attrs, nil
}
