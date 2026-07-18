package giftimage

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	FragmentBase   = "https://nft.fragment.com/gift/"
	fragmentUserUA = "Mozilla/5.0 (compatible; flipo-gift-image/1.0)"
)

var ogImagePattern = regexp.MustCompile(`property="og:image"\s+content="([^"]+)"`)

type Proxy struct {
	CacheDir   string
	HTTPClient *http.Client
}

func NewProxy(cacheDir string) *Proxy {
	return &Proxy{
		CacheDir: cacheDir,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func ProxyPath(slug string) string {
	return "/static/gifts/" + canonicalGiftSlug(slug) + ".medium.jpg"
}

func FragmentURL(slug string) string {
	return FragmentBase + canonicalGiftSlug(slug) + ".medium.jpg"
}

func FragmentURLFromFile(file string) string {
	return FragmentBase + canonicalGiftImageFile(file)
}

func SlugFromImageURL(imageURL string) string {
	if strings.Contains(imageURL, "nft.fragment.com/gift/") {
		rest := strings.TrimPrefix(imageURL, FragmentBase)
		return strings.TrimSuffix(rest, ".medium.jpg")
	}
	if strings.HasPrefix(imageURL, "/static/gifts/") {
		return slugFromGiftImageFile(strings.TrimPrefix(imageURL, "/static/gifts/"))
	}
	return ""
}

func canonicalGiftSlug(slug string) string {
	return strings.ToLower(strings.TrimSpace(slug))
}

func canonicalGiftImageFile(file string) string {
	if !strings.HasSuffix(file, ".medium.jpg") {
		return file
	}
	return canonicalGiftSlug(slugFromGiftImageFile(file)) + ".medium.jpg"
}

func slugFromGiftImageFile(file string) string {
	return strings.TrimSuffix(file, ".medium.jpg")
}

func validGiftImageFile(file string) bool {
	if file == "" || len(file) > 256 {
		return false
	}
	if strings.Contains(file, "/") || strings.Contains(file, "\\") || strings.Contains(file, "..") {
		return false
	}
	return strings.HasSuffix(strings.ToLower(file), ".medium.jpg")
}

func (p *Proxy) Serve(file string, w http.ResponseWriter) error {
	if !validGiftImageFile(file) {
		http.Error(w, "invalid gift image", http.StatusBadRequest)
		return fmt.Errorf("invalid gift image file: %s", file)
	}

	file = canonicalGiftImageFile(file)

	if data, err := p.readCache(file); err == nil {
		writeImage(w, data)
		return nil
	}

	data, err := p.fetchUpstream(file)
	if err != nil {
		http.Error(w, "gift image unavailable", http.StatusBadGateway)
		return err
	}

	_ = p.writeCache(file, data)
	writeImage(w, data)
	return nil
}

func (p *Proxy) readCache(file string) ([]byte, error) {
	if p.CacheDir == "" {
		return nil, os.ErrNotExist
	}
	return os.ReadFile(filepath.Join(p.CacheDir, file))
}

func (p *Proxy) writeCache(file string, data []byte) error {
	if p.CacheDir == "" {
		return nil
	}
	if err := os.MkdirAll(p.CacheDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(p.CacheDir, file), data, 0o644)
}

func (p *Proxy) fetchUpstream(file string) ([]byte, error) {
	file = canonicalGiftImageFile(file)
	slug := slugFromGiftImageFile(file)

	// Fragment often blocks datacenter IPs; t.me preview is the reliable source.
	if data, err := p.fetchFromTMeNFTPage(slug); err == nil {
		return data, nil
	}

	candidates := []string{
		FragmentBase + file,
		FragmentBase + slug + ".large.jpg",
	}
	for _, rawURL := range candidates {
		if data, err := p.fetchBytes(rawURL, fragmentUserUA, "image/jpeg,image/*,*/*"); err == nil {
			return data, nil
		}
	}

	return nil, fmt.Errorf("gift image unavailable for %s", slug)
}

func (p *Proxy) fetchFromTMeNFTPage(slug string) ([]byte, error) {
	pageURL := "https://t.me/nft/" + slug
	body, err := p.fetchBytes(pageURL, fragmentUserUA, "text/html,*/*")
	if err != nil {
		return nil, err
	}

	match := ogImagePattern.FindSubmatch(body)
	if len(match) < 2 {
		return nil, fmt.Errorf("og:image not found for %s", slug)
	}

	imageURL := string(match[1])
	return p.fetchBytes(imageURL, fragmentUserUA, "image/jpeg,image/*,*/*", map[string]string{
		"Referer": "https://t.me/",
	})
}

func (p *Proxy) fetchBytes(rawURL, userAgent, accept string, extraHeaders ...map[string]string) ([]byte, error) {
	client := p.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	for _, headers := range extraHeaders {
		for key, value := range headers {
			req.Header.Set(key, value)
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %d", rawURL, resp.StatusCode)
	}

	const maxBytes = 4 << 20
	return io.ReadAll(io.LimitReader(resp.Body, maxBytes))
}

func writeImage(w http.ResponseWriter, data []byte) {
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("Content-Type", "image/jpeg")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
