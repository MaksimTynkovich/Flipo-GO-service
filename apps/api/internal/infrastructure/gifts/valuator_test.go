package gifts

import "testing"

func TestApplyPercentAdjust(t *testing.T) {
	got := ApplyPercentAdjust(2_520_000_000, -12)
	want := int64(float64(2_520_000_000) * 0.88)
	if got != want {
		t.Fatalf("ApplyPercentAdjust(2.52 TON, -12) = %d, want %d", got, want)
	}
	if ApplyPercentAdjust(1_000_000_000, 10) != 1_100_000_000 {
		t.Fatal("expected +10% markup")
	}
	if ApplyPercentAdjust(0, -12) != 0 {
		t.Fatal("zero stays zero")
	}
	if ApplyPercentAdjust(1_000_000_000, 0) != 1_000_000_000 {
		t.Fatal("0% should keep price")
	}
}
