package telegram

import (
	"errors"
	"fmt"
	"testing"
)

func TestNormalizeGiftSlug(t *testing.T) {
	if got := normalizeGiftSlug("  easteregg-109337  "); got != "easteregg-109337" {
		t.Fatalf("normalizeGiftSlug() = %q", got)
	}
}

func TestGiftSlugEqual(t *testing.T) {
	if !giftSlugEqual("EasterEgg-109337", "easteregg-109337") {
		t.Fatal("expected case-insensitive slug match")
	}
	if giftSlugEqual("easteregg-109337", "easteregg-109338") {
		t.Fatal("expected different slugs to not match")
	}
}

func TestIsGiftNotOnAccountRPC(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{fmt.Errorf("rpc error 400: STARGIFT_OWNER_INVALID"), true},
		{fmt.Errorf("rpc error 400: STARGIFT_NOT_FOUND"), true},
		{errors.New("connection reset"), false},
		{ErrInsufficientStars, false},
	}
	for _, tc := range cases {
		if got := isGiftNotOnAccountRPC(tc.err); got != tc.want {
			t.Fatalf("isGiftNotOnAccountRPC(%v) = %v, want %v", tc.err, got, tc.want)
		}
	}
}

func TestMapGiftTransferRPCErrorMapsOwnerErrors(t *testing.T) {
	err := mapGiftTransferRPCError(fmt.Errorf("rpc error 400: STARGIFT_OWNER_INVALID"))
	if !errors.Is(err, ErrGiftNotOnAccount) {
		t.Fatalf("expected ErrGiftNotOnAccount, got %v", err)
	}
}
