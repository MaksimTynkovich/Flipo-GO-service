package cases

import "testing"

func TestShouldInjectFakeDropIgnoresFakeBufferSaturation(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.Enabled = true
	cfg.FillWhenSparse = true
	cfg.MinVisible = 6

	// Sparse real activity → keep dripping fakes even if the UI buffer is already full.
	if !shouldInjectFakeDrop(cfg, 0) {
		t.Fatal("expected fake drops while real feed is empty")
	}
	if !shouldInjectFakeDrop(cfg, 5) {
		t.Fatal("expected fake drops while real opens are below min_visible")
	}
	if shouldInjectFakeDrop(cfg, 6) {
		t.Fatal("expected no fake drops when real opens already meet min_visible")
	}

	cfg.FillWhenSparse = false
	if !shouldInjectFakeDrop(cfg, 100) {
		t.Fatal("without fill_when_sparse, fakes should always inject when enabled")
	}

	cfg.Enabled = false
	if shouldInjectFakeDrop(cfg, 0) {
		t.Fatal("disabled sim must not inject")
	}
}
