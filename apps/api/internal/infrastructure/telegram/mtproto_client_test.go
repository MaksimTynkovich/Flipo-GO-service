package telegram

import "testing"

func TestMTProtoConfigEnabled(t *testing.T) {
	t.Parallel()

	configured := MTProtoConfigFromEnv(1, "hash", "session.json", true)
	if !configured.Enabled() {
		t.Fatal("expected enabled when credentials present and flag true")
	}

	disabled := MTProtoConfigFromEnv(1, "hash", "session.json", false)
	if disabled.Enabled() {
		t.Fatal("expected disabled when TELEGRAM_MTPROTO_ENABLED=false")
	}

	empty := MTProtoConfigFromEnv(0, "", "", true)
	if empty.Enabled() {
		t.Fatal("expected disabled when credentials missing")
	}
}
