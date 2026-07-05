package gifts

import "testing"

func TestApplyBuybackHaircut(t *testing.T) {
	got := ApplyBuybackHaircut(2_520_000_000)
	want := int64(2_520_000_000 * 88 / 100)
	if got != want {
		t.Fatalf("applyBuybackHaircut(2.52 TON) = %d, want %d", got, want)
	}
	if ApplyBuybackHaircut(0) != 0 {
		t.Fatal("zero price should stay zero")
	}
}

func TestStakingQuoteAppliesHaircut(t *testing.T) {
	price, source := finalizeQuote(2_520_000_000, PriceSourceTraits, true)
	if price != 2_217_600_000 {
		t.Fatalf("staking quote should apply haircut, got %d", price)
	}
	if source != PriceSourceTraits {
		t.Fatalf("unexpected source %q", source)
	}
}

func TestBuybackQuoteAppliesHaircut(t *testing.T) {
	price, _ := finalizeQuote(2_520_000_000, PriceSourceTraits, true)
	if price != 2_217_600_000 {
		t.Fatalf("buyback quote = %d, want 2217600000", price)
	}
}
