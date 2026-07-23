package domain

// MarketEnabled gates the player market and related admin listing tools.
// Keep false while the market product surface is retired.
const MarketEnabled = false

func EnsureMarketEnabled() error {
	if MarketEnabled {
		return nil
	}
	return ErrMarketDisabled
}
