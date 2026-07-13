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

const FragmentBase = "https://nft.fragment.com/gift/"

var fileNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*-[0-9]+\.medium\.jpg$`)

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
	return "/static/gifts/" + slug + ".medium.jpg"
}

func FragmentURL(slug string) string {
	return FragmentBase + slug + ".medium.jpg"
}

func FragmentURLFromFile(file string) string {
	return FragmentBase + file
}

func SlugFromImageURL(imageURL string) string {
	if !strings.Contains(imageURL, "nft.fragment.com/gift/") {
		return ""
	}
	rest := strings.TrimPrefix(imageURL, FragmentBase)
	return strings.TrimSuffix(rest, ".medium.jpg")
}

func (p *Proxy) Serve(file string, w http.ResponseWriter) error {
	if !fileNameRe.MatchString(file) {
		http.Error(w, "invalid gift image", http.StatusBadRequest)
		return fmt.Errorf("invalid gift image file: %s", file)
	}

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
	client := p.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Get(FragmentURLFromFile(file))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fragment returned %d", resp.StatusCode)
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
