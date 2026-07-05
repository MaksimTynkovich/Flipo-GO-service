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
