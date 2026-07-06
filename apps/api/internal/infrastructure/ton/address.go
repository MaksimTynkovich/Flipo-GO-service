package ton

import (
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/address"
)

func ParseAnyAddress(raw string) (*address.Address, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("empty address")
	}
	if isRawAddress(raw) {
		return address.ParseRawAddr(raw)
	}
	return address.ParseAddr(raw)
}

func NormalizeAddress(raw string) (string, error) {
	addr, err := ParseAnyAddress(raw)
	if err != nil {
		return "", err
	}
	return addr.Bounce(false).String(), nil
}

func isRawAddress(raw string) bool {
	if strings.HasPrefix(raw, "EQ") || strings.HasPrefix(raw, "UQ") || strings.HasPrefix(raw, "kQ") {
		return false
	}
	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 {
		return false
	}
	_, err := fmt.Sscanf(parts[0], "%d", new(int))
	return err == nil
}
