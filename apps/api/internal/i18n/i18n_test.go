package i18n

import "testing"

func TestTFallsBackToEnglish(t *testing.T) {
	if got := T("de", "bot.openApp"); got != "🚀 Open app" {
		t.Fatalf("expected english fallback, got %q", got)
	}
}

func TestTRussian(t *testing.T) {
	if got := T("ru", "bot.openApp"); got != "🚀 Открыть приложение" {
		t.Fatalf("unexpected russian text: %q", got)
	}
}

func TestTFormatsArgs(t *testing.T) {
	got := T("en", "bot.giftDeposited", "Plush Pepe")
	if got != "🎁 Gift “Plush Pepe” has been added to your inventory!" {
		t.Fatalf("unexpected formatted text: %q", got)
	}
}

func TestAppendLangQuery(t *testing.T) {
	if got := AppendLangQuery("https://example.com/terms", "ru"); got != "https://example.com/terms?lang=ru" {
		t.Fatalf("unexpected url: %q", got)
	}
	if got := AppendLangQuery("https://example.com/terms?x=1", "en"); got != "https://example.com/terms?x=1&lang=en" {
		t.Fatalf("unexpected url with query: %q", got)
	}
}
