package gifts

import "strings"

// IsBlackBackdrop reports whether the backdrop is a price-sensitive black variant.
// Only these are stored separately; other backdrops share the collection+model row.
func IsBlackBackdrop(backdrop string) bool {
	switch strings.ToLower(strings.TrimSpace(backdrop)) {
	case "black", "onyx black":
		return true
	default:
		return false
	}
}

// NormalizeBackdropForStorage returns the backdrop column value for gift_trait_prices.
// Non-black backdrops collapse to "" (model-only row).
func NormalizeBackdropForStorage(backdrop string) string {
	backdrop = strings.TrimSpace(backdrop)
	if IsBlackBackdrop(backdrop) {
		return backdrop
	}
	return ""
}

// StorageKey returns the DB primary key components for a gift valuation.
func StorageKey(collectionSlug, model, backdrop string) (string, string, string) {
	return strings.TrimSpace(collectionSlug), strings.TrimSpace(model), NormalizeBackdropForStorage(backdrop)
}
