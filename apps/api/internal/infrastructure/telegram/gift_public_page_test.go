package telegram

import "testing"

func TestParseNFTPageDescription(t *testing.T) {
	attrs, err := parseNFTPageDescription("Model: Blåhaj\nBackdrop: Mexican Pink\nSymbol: Alarm")
	if err != nil {
		t.Fatal(err)
	}
	if attrs.Model != "Blåhaj" || attrs.Backdrop != "Mexican Pink" || attrs.Symbol != "Alarm" {
		t.Fatalf("attrs = %+v", attrs)
	}
}

func TestParseGiftSlugExported(t *testing.T) {
	collection, token := ParseGiftSlug("surgeBoard-1081")
	if collection != "surgeBoard" || token != "1081" {
		t.Fatalf("ParseGiftSlug = %q %q", collection, token)
	}
}
