package gifts

import (
	"encoding/json"
	"testing"
)

func TestParseMRKTGiftPrice(t *testing.T) {
	raw := json.RawMessage(`{"salePrice":66000000000,"title":"Diamond"}`)
	ton, err := parseMRKTGiftPrice(raw)
	if err != nil {
		t.Fatalf("parseMRKTGiftPrice: %v", err)
	}
	if ton != 66 {
		t.Fatalf("ton = %.2f, want 66", ton)
	}
}

func TestPickMinQuoteAcrossMarkets(t *testing.T) {
	ton, source, ok := pickMinQuote(
		marketQuote{ton: 109, source: PriceSourcePortalsTraits},
		marketQuote{ton: 66, source: PriceSourceMRKTTraits},
	)
	if !ok || ton != 66 || source != PriceSourceMRKTTraits {
		t.Fatalf("got %.2f %s ok=%v", ton, source, ok)
	}
}

func TestCollectionDisplayName(t *testing.T) {
	if got := collectionDisplayName("LibertyFigure"); got != "Liberty Figure" {
		t.Fatalf("got %q", got)
	}
}
