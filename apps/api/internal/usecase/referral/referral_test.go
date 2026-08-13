package referral

import "testing"

func TestBonusFromYield(t *testing.T) {
	tests := []struct {
		yield int64
		want  int64
	}{
		{0, 0},
		{1_000_000_000, 50_000_000},  // 1 TON yield -> 0.05 TON bonus
		{3_000_000_000, 150_000_000}, // 3 TON monthly -> 0.15 TON bonus
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

func TestParseReferrerTelegramID(t *testing.T) {
	const id int64 = 123456789
	payload := StartPayloadForTelegramID(id)
	parsed, ok := ParseReferrerTelegramID(payload)
	if !ok || parsed != id {
		t.Fatalf("round-trip StartPayload/Parse failed: payload=%q got=%d ok=%v", payload, parsed, ok)
	}
	if StartPayloadForTelegramID(0) != "ref" {
		t.Fatalf("expected empty payload for zero id")
	}
	for _, raw := range []string{"cases", "crash", "c_tgads_a", "case_foo"} {
		if _, ok := ParseReferrerTelegramID(raw); ok {
			t.Fatalf("payload %q must not parse as referral telegram id", raw)
		}
	}
}
