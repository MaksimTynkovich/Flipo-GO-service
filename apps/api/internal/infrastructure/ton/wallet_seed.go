package ton

import (
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	tonapi "github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

func ResolveWalletVersion(api tonapi.APIClientWrapped, seedPhrase, versionHint, depositAddress string) (wallet.VersionConfig, error) {
	words := strings.Fields(strings.TrimSpace(seedPhrase))
	if len(words) == 0 {
		return nil, fmt.Errorf("hot wallet seed phrase not configured")
	}

	candidates := versionCandidates(versionHint)
	if depositAddress != "" {
		target, err := ParseAnyAddress(depositAddress)
		if err != nil {
			return nil, fmt.Errorf("invalid deposit address: %w", err)
		}
		for _, ver := range candidates {
			w, err := wallet.FromSeed(api, words, ver)
			if err != nil {
				continue
			}
			if addressesEqual(w.WalletAddress(), target) {
				return ver, nil
			}
		}
		return nil, fmt.Errorf("TON_DEPOSIT_ADDRESS does not match TON_HOT_WALLET_MNEMONIC (Tonkeeper wallets usually need TON_HOT_WALLET_VERSION=V5R1)")
	}

	if len(candidates) > 0 {
		if _, err := wallet.FromSeed(api, words, candidates[0]); err != nil {
			return nil, fmt.Errorf("init hot wallet from seed: %w", err)
		}
		return candidates[0], nil
	}
	return wallet.V3R2, nil
}

func DerivedWalletAddress(api tonapi.APIClientWrapped, seedPhrase string, ver wallet.VersionConfig) (string, error) {
	words := strings.Fields(strings.TrimSpace(seedPhrase))
	w, err := wallet.FromSeed(api, words, ver)
	if err != nil {
		return "", err
	}
	return w.WalletAddress().String(), nil
}

func versionCandidates(versionHint string) []wallet.VersionConfig {
	seen := make(map[string]struct{})
	var out []wallet.VersionConfig

	add := func(key string, ver wallet.VersionConfig) {
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, ver)
	}

	switch strings.ToUpper(strings.TrimSpace(versionHint)) {
	case "V5R1", "V5", "V5R1FINAL":
		add("v5r1", wallet.ConfigV5R1Final{NetworkGlobalID: wallet.MainnetGlobalID, Workchain: 0})
	case "V4R2":
		add("v4r2", wallet.V4R2)
	case "V3":
		add("v3", wallet.V3)
	case "", "V3R2":
		add("v3r2", wallet.V3R2)
	default:
		add("hint:"+versionHint, wallet.V3R2)
	}

	// Common fallbacks for Tonkeeper / modern wallets.
	add("v5r1", wallet.ConfigV5R1Final{NetworkGlobalID: wallet.MainnetGlobalID, Workchain: 0})
	add("v4r2", wallet.V4R2)
	add("v3r2", wallet.V3R2)
	add("v3", wallet.V3)

	return out
}

func addressesEqual(a, b *address.Address) bool {
	if a == nil || b == nil {
		return false
	}
	return a.String() == b.String() || bytesEqual(a.Data(), b.Data())
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
