package gifts

import "testing"

func TestCombineCatalogTraitTON(t *testing.T) {
	collectionFloor := 6.93

	t.Run("cheap backdrop ignored", func(t *testing.T) {
		got := combineCatalogTraitTON(7.79, 2.6, 7.94, collectionFloor)
		if got != 7.79 {
			t.Fatalf("got %.2f want 7.79", got)
		}
	})

	t.Run("premium black backdrop", func(t *testing.T) {
		got := combineCatalogTraitTON(7.79, 64.09, 7.0, collectionFloor)
		if got != 64.09 {
			t.Fatalf("got %.2f want 64.09", got)
		}
	})

	t.Run("onyx black backdrop", func(t *testing.T) {
		got := combineCatalogTraitTON(12.0, 19.5, 0, collectionFloor)
		if got != 19.5 {
			t.Fatalf("got %.2f want 19.5", got)
		}
	})
}

func TestIsPremiumTraitPrice(t *testing.T) {
	if !isPremiumTraitPrice(64.09, 7.79, 6.93) {
		t.Fatal("Black backdrop should be premium")
	}
	if isPremiumTraitPrice(2.6, 7.79, 6.93) {
		t.Fatal("Mexican Pink should not be premium")
	}
}
