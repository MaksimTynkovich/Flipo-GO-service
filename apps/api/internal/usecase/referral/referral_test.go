package referral

import "testing"

func TestBonusFromYield(t *testing.T) {
	tests := []struct {
		yield int64
		want  int64
	}{
		{0, 0},
		{1_000_000_000, 50_000_000},      // 1 TON yield -> 0.05 TON bonus
		{3_000_000_000, 150_000_000},     // 3 TON monthly -> 0.15 TON bonus
	}
	for _, tt := range tests {
		if got := BonusFromYield(tt.yield, DefaultSharePercent); got != tt.want {
			t.Fatalf("BonusFromYield(%d) = %d, want %d", tt.yield, got, tt.want)
		}
	}
}

func TestWeeklyBonusFromMonthlyYield(t *testing.T) {
	// 3 TON/month referral yield -> 0.15 TON/month bonus -> 0.035 TON/week
	const monthlyYield = 3_000_000_000
	got := WeeklyBonusFromMonthlyYield(monthlyYield, DefaultSharePercent)
	want := int64(35_000_000)
	if got != want {
		t.Fatalf("WeeklyBonusFromMonthlyYield = %d, want %d", got, want)
	}
}

func TestParseReferrerID(t *testing.T) {
	id := "550e8400-e29b-41d4-a716-446655440000"
	parsed, ok := ParseReferrerID("ref_" + id)
	if !ok || parsed.String() != id {
		t.Fatalf("parse ref_ prefix failed")
	}
	parsed, ok = ParseReferrerID(id)
	if !ok || parsed.String() != id {
		t.Fatalf("parse bare uuid failed")
	}
	_, ok = ParseReferrerID("invalid")
	if ok {
		t.Fatal("expected invalid code to fail")
	}
}
