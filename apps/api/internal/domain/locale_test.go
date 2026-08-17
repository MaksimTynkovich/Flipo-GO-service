package domain

import "testing"

func TestPickLocalized(t *testing.T) {
	if got := PickLocalized("en", "Hello", "Привет", "Hi"); got != "Hello" {
		t.Fatalf("en: got %q", got)
	}
	if got := PickLocalized("ru", "Hello", "Привет", "Hi"); got != "Привет" {
		t.Fatalf("ru: got %q", got)
	}
	if got := PickLocalized("en", "", "Привет", "Hi"); got != "Привет" {
		t.Fatalf("en fallback to ru: got %q", got)
	}
	if got := PickLocalized("ru", "Hello", "", "Hi"); got != "Hello" {
		t.Fatalf("ru fallback to en: got %q", got)
	}
	if got := PickLocalized("en", "", "", "Hi"); got != "Hi" {
		t.Fatalf("legacy fallback: got %q", got)
	}
}

func TestSyncLocalized(t *testing.T) {
	en, ru, canonical := SyncLocalized("Open", "", "Открыть")
	if en != "Open" || ru != "Open" || canonical != "Open" {
		t.Fatalf("got en=%q ru=%q canonical=%q", en, ru, canonical)
	}
	en, ru, canonical = SyncLocalized("", "Кейс", "")
	if en != "Кейс" || ru != "Кейс" || canonical != "Кейс" {
		t.Fatalf("got en=%q ru=%q canonical=%q", en, ru, canonical)
	}
}
