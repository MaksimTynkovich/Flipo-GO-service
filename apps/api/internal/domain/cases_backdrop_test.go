package domain

import "testing"

func TestNormalizeCaseLootBackdrop(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"  ", ""},
		{"Black", "Black"},
		{"black", "Black"},
		{" BLACK ", "Black"},
		{"Onyx Black", "Onyx Black"},
		{"onyx black", "Onyx Black"},
		{"Mexican Pink", ""},
		{"random", ""},
	}
	for _, tc := range cases {
		if got := NormalizeCaseLootBackdrop(tc.in); got != tc.want {
			t.Fatalf("NormalizeCaseLootBackdrop(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeLootTileBackgroundColor(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"#F77091", "#f77091"},
		{"#aabbcc", "#aabbcc"},
		{"#abc", ""},
		{"red", ""},
		{" #12AbCd ", "#12abcd"},
	}
	for _, tc := range cases {
		if got := NormalizeLootTileBackgroundColor(tc.in); got != tc.want {
			t.Fatalf("NormalizeLootTileBackgroundColor(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}
