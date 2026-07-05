package gifts

import "testing"

func TestCollectionAssetKey(t *testing.T) {
	tests := map[string]string{
		"SnakeBox":     "snake_box",
		"vintagecigar": "vintagecigar",
		"PlushPepe":    "plush_pepe",
		"":             "",
	}
	for in, want := range tests {
		if got := collectionAssetKey(in); got != want {
			t.Fatalf("collectionAssetKey(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTonToNanoton(t *testing.T) {
	if got := tonToNanoton(2.47); got != 2_470_000_000 {
		t.Fatalf("tonToNanoton(2.47) = %d", got)
	}
}
