package campaign

import (
	"strings"

	"github.com/google/uuid"
)

const (
	KindNone      = ""
	KindReferral  = "referral"
	KindCampaign  = "campaign"
	KindOther     = "other"
	payloadPrefix = "c_"
)

type ParsedPayload struct {
	Raw          string
	Kind         string
	CampaignCode string
}

func ParseStartPayload(raw string) ParsedPayload {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ParsedPayload{}
	}
	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, payloadPrefix) {
		code := strings.TrimPrefix(lower, payloadPrefix)
		if !ValidCode(code) {
			return ParsedPayload{Raw: raw, Kind: KindOther}
		}
		return ParsedPayload{Raw: raw, Kind: KindCampaign, CampaignCode: code}
	}
	if strings.HasPrefix(lower, "ref_") {
		return ParsedPayload{Raw: raw, Kind: KindReferral}
	}
	if _, err := uuid.Parse(raw); err == nil {
		return ParsedPayload{Raw: raw, Kind: KindReferral}
	}
	return ParsedPayload{Raw: raw, Kind: KindOther}
}

func StartPayload(code string) string {
	code = NormalizeCode(code)
	if code == "" {
		return ""
	}
	return payloadPrefix + code
}

func NormalizeCode(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

func ValidCode(code string) bool {
	code = NormalizeCode(code)
	if len(code) < 2 || len(code) > 24 {
		return false
	}
	for _, c := range code {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' {
			return false
		}
	}
	return true
}
