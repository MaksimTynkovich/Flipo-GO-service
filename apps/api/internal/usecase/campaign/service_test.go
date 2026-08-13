package campaign

import "testing"

func TestNormalizeSourceAndLanding(t *testing.T) {
	if got, ok := normalizeSource(""); !ok || got != "other" {
		t.Fatalf("empty source: got %q ok=%v", got, ok)
	}
	if _, ok := normalizeSource("billboard"); ok {
		t.Fatal("expected invalid source")
	}
	if got, ok := normalizeLanding("crash"); !ok || got != "crash" {
		t.Fatalf("landing crash: got %q ok=%v", got, ok)
	}
	if _, ok := normalizeLanding("market"); ok {
		t.Fatal("expected invalid landing")
	}
}

func TestRate(t *testing.T) {
	if rate(5, 10) != 50 {
		t.Fatalf("rate 5/10 = %v", rate(5, 10))
	}
	if rate(1, 0) != 0 {
		t.Fatal("expected 0 for zero denominator")
	}
}

func TestStartPayload(t *testing.T) {
	if StartPayload("tgads_a") != "c_tgads_a" {
		t.Fatalf("got %q", StartPayload("tgads_a"))
	}
}
