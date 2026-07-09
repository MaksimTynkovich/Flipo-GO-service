package telegram

import "testing"

func TestNormalizeChannelChatID(t *testing.T) {
	tests := map[string]string{
		"@flipo":                  "@flipo",
		"flipo":                   "@flipo",
		"https://t.me/flipo":      "@flipo",
		"https://t.me/flipo/":     "@flipo",
		"-1001234567890":          "-1001234567890",
		"  @my_channel  ":         "@my_channel",
	}

	for input, want := range tests {
		if got := normalizeChannelChatID(input); got != want {
			t.Fatalf("normalizeChannelChatID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestIsActiveChannelMember(t *testing.T) {
	if !isActiveChannelMember("member", false) {
		t.Fatal("member should be active")
	}
	if isActiveChannelMember("left", false) {
		t.Fatal("left should not be active")
	}
	if !isActiveChannelMember("restricted", true) {
		t.Fatal("restricted member should be active")
	}
	if isActiveChannelMember("restricted", false) {
		t.Fatal("restricted non-member should not be active")
	}
}
