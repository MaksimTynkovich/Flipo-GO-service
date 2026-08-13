package campaign

import "testing"

func TestParseStartPayload(t *testing.T) {
	tests := []struct {
		in   string
		kind string
		code string
	}{
		{"", KindNone, ""},
		{"ref_21i3v9", KindReferral, ""},
		{"550e8400-e29b-41d4-a716-446655440000", KindReferral, ""},
		{"c_tgads_a", KindCampaign, "tgads_a"},
		{"C_TGADS_A", KindCampaign, "tgads_a"},
		{"c_", KindOther, ""},
		{"c_X", KindOther, ""},
		{"cases", KindOther, ""},
		{"crash", KindOther, ""},
		{"case_foo", KindOther, ""},
	}
	for _, tt := range tests {
		got := ParseStartPayload(tt.in)
		if got.Kind != tt.kind || got.CampaignCode != tt.code {
			t.Fatalf("ParseStartPayload(%q) = kind=%q code=%q, want kind=%q code=%q",
				tt.in, got.Kind, got.CampaignCode, tt.kind, tt.code)
		}
	}
}

func TestValidCode(t *testing.T) {
	if !ValidCode("tgads_a") {
		t.Fatal("expected tgads_a valid")
	}
	if !ValidCode("ab") {
		t.Fatal("expected ab valid")
	}
	if ValidCode("A") || ValidCode("has-dash") || ValidCode("") {
		t.Fatal("expected invalid codes to fail")
	}
}
