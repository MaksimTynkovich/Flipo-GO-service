package telegram

import "testing"

func TestFormatTON(t *testing.T) {
	tests := []struct {
		nanoton int64
		want    string
	}{
		{0, "0"},
		{1_500_000_000, "1.5"},
		{30_000_000, "0.03"},
		{4_280_000, "0.00428"},
		{1_000_000, "0.001"},
		{10_000, "0.00001"},
	}
	for _, tt := range tests {
		if got := formatTON(tt.nanoton); got != tt.want {
			t.Errorf("formatTON(%d) = %q, want %q", tt.nanoton, got, tt.want)
		}
	}
}

func TestDailyYieldMessageParts(t *testing.T) {
	yield := int64(100_000_000)
	bonus := int64(3_000_000)

	var parts []string
	if yield > 0 {
		parts = append(parts, "staking:"+formatTON(yield))
	}
	if bonus > 0 {
		parts = append(parts, "referral:"+formatTON(bonus))
	}
	if len(parts) != 2 {
		t.Fatalf("expected 2 parts, got %v", parts)
	}
	if parts[0] != "staking:0.1" {
		t.Fatalf("unexpected staking part: %s", parts[0])
	}
	if parts[1] != "referral:0.003" {
		t.Fatalf("unexpected referral part: %s", parts[1])
	}
}
