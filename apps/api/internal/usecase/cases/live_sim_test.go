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

func TestRarityFromValueIntervals(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cases := []struct {
		value int64
		want  string
	}{
		{0, "common"},
		{499_999_999, "common"},
		{500_000_000, "uncommon"},
		{1_499_999_999, "uncommon"},
		{1_500_000_000, "rare"},
		{2_999_999_999, "rare"},
		{3_000_000_000, "epic"},
		{4_999_999_999, "epic"},
		{5_000_000_000, "legendary"},
		{50_000_000_000, "legendary"},
	}
	for _, tc := range cases {
		got := rarityFromValue(cfg, tc.value)
		if got != tc.want {
			t.Fatalf("value %d: got %q want %q", tc.value, got, tc.want)
		}
	}
}

func TestNormalizeLiveFeedSettingsSortsIntervals(t *testing.T) {
	cfg := DefaultLiveFeedSettings()
	cfg.CommonMaxNanoton = 5_000_000_000
	cfg.UncommonMaxNanoton = 1_000_000_000
	cfg.RareMaxNanoton = 2_000_000_000
	cfg.EpicMaxNanoton = 500_000_000
	NormalizeLiveFeedSettings(&cfg)
	if !(cfg.CommonMaxNanoton <= cfg.UncommonMaxNanoton &&
		cfg.UncommonMaxNanoton <= cfg.RareMaxNanoton &&
		cfg.RareMaxNanoton <= cfg.EpicMaxNanoton) {
		t.Fatalf("intervals not non-decreasing: %+v", cfg)
	}
}
