package giftimage

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidGiftImageFile(t *testing.T) {
	valid := []string{
		"plushpepe-1984.medium.jpg",
		"TrappedHeart-18189.medium.jpg",
		"MoodPack-72457.medium.jpg",
	}
	for _, file := range valid {
		if !validGiftImageFile(file) {
			t.Fatalf("expected valid: %s", file)
		}
	}

	invalid := []string{
		"",
		"../etc/passwd",
		"evil/malicious.medium.jpg",
		"no-suffix.jpg",
		"TrappedHeart-18189.png",
	}
	for _, file := range invalid {
		if validGiftImageFile(file) {
			t.Fatalf("expected invalid: %s", file)
		}
	}
}

func TestSlugFromImageURL(t *testing.T) {
	got := SlugFromImageURL("https://nft.fragment.com/gift/TrappedHeart-18189.medium.jpg")
	if got != "TrappedHeart-18189" {
		t.Fatalf("got %q", got)
	}

	got = SlugFromImageURL("/static/gifts/TrappedHeart-18189.medium.jpg")
	if got != "TrappedHeart-18189" {
		t.Fatalf("proxy path got %q", got)
	}
}

func TestCanonicalGiftImageFile(t *testing.T) {
	if got := canonicalGiftImageFile("TrappedHeart-18189.medium.jpg"); got != "trappedheart-18189.medium.jpg" {
		t.Fatalf("got %q", got)
	}
	if got := ProxyPath("TrappedHeart-18189"); got != "/static/gifts/trappedheart-18189.medium.jpg" {
		t.Fatalf("ProxyPath got %q", got)
	}
}

type hostRewriteTransport struct {
	testBase string
	inner    http.RoundTripper
}

func (t *hostRewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	switch {
	case strings.Contains(req.URL.Host, "nft.fragment.com"):
		clone.URL.Scheme = "http"
		clone.URL.Host = strings.TrimPrefix(strings.TrimPrefix(t.testBase, "https://"), "http://")
	case strings.Contains(req.URL.Host, "t.me"):
		clone.URL.Scheme = "http"
		clone.URL.Host = strings.TrimPrefix(strings.TrimPrefix(t.testBase, "https://"), "http://")
	}
	if t.inner == nil {
		t.inner = http.DefaultTransport
	}
	return t.inner.RoundTrip(clone)
}

func TestServeFallsBackToTMePreview(t *testing.T) {
	const imageBody = "telegram-preview"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/gift/trappedheart-18189.medium.jpg", "/gift/trappedheart-18189.large.jpg":
			http.NotFound(w, r)
		case "/nft/trappedheart-18189":
			_, _ = w.Write([]byte(`<meta property="og:image" content="http://` + r.Host + `/preview.jpg">`))
		case "/preview.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte(imageBody))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cacheDir := t.TempDir()
	p := NewProxy(cacheDir)
	p.HTTPClient = &http.Client{
		Transport: &hostRewriteTransport{testBase: srv.URL},
		Timeout:   p.HTTPClient.Timeout,
	}

	rec := httptest.NewRecorder()
	if err := p.Serve("TrappedHeart-18189.medium.jpg", rec); err != nil {
		t.Fatalf("Serve: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Body.String(); got != imageBody {
		t.Fatalf("body = %q", got)
	}

	cached, err := p.readCache("trappedheart-18189.medium.jpg")
	if err != nil {
		t.Fatalf("readCache: %v", err)
	}
	if string(cached) != imageBody {
		t.Fatalf("cached body = %q", string(cached))
	}
}

func TestServeUsesFragmentWhenTMeUnavailable(t *testing.T) {
	var requested string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/nft/libertyfigure-58345":
			http.NotFound(w, r)
		case "/gift/libertyfigure-58345.medium.jpg":
			requested = r.URL.Path
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte("jpeg-bytes"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	p := NewProxy(t.TempDir())
	p.HTTPClient = &http.Client{
		Transport: &hostRewriteTransport{testBase: srv.URL},
		Timeout:   p.HTTPClient.Timeout,
	}

	rec := httptest.NewRecorder()
	if err := p.Serve("LibertyFigure-58345.medium.jpg", rec); err != nil {
		t.Fatalf("Serve: %v", err)
	}
	if requested != "/gift/libertyfigure-58345.medium.jpg" {
		t.Fatalf("requested %q", requested)
	}
}
