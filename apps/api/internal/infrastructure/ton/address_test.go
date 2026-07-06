package ton

import "testing"

func TestNormalizeAddress(t *testing.T) {
	raw := "0:2aff80d116270867a8b1d6c709107c8d6c5b20b29f48bcfb25a9226f602f94f0"
	got, err := NormalizeAddress(raw)
	if err != nil {
		t.Fatalf("normalize raw address: %v", err)
	}
	if !stringsHasPrefix(got, "UQ") && !stringsHasPrefix(got, "EQ") {
		t.Fatalf("expected user-friendly address, got %q", got)
	}

	friendly, err := NormalizeAddress(got)
	if err != nil {
		t.Fatalf("normalize friendly address: %v", err)
	}
	if friendly != got {
		t.Fatalf("expected stable normalization, got %q want %q", friendly, got)
	}
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
