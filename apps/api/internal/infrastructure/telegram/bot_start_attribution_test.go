package telegram

import (
	"context"
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

type stubCampaignResolver struct {
	byCode map[string]*domain.Campaign
}

func (s stubCampaignResolver) FindByCode(_ context.Context, code string) (*domain.Campaign, error) {
	return s.byCode[code], nil
}

func TestResolveBotStartAttributionCampaign(t *testing.T) {
	campaigns := stubCampaignResolver{byCode: map[string]*domain.Campaign{
		"richads_a": {
			Name:    "RichAds A",
			Code:    "richads_a",
			Source:  domain.CampaignSourceOther,
			Content: "A",
		},
	}}
	attr := ResolveBotStartAttribution(context.Background(), campaigns, "c_richads_a")
	if attr.Kind != "campaign" || attr.Code != "richads_a" || attr.Name != "RichAds A" {
		t.Fatalf("attr = %+v", attr)
	}
}

func TestResolveBotStartAttributionReferral(t *testing.T) {
	attr := ResolveBotStartAttribution(context.Background(), nil, "ref_abc")
	if attr.Kind != "referral" || attr.Payload != "ref_abc" || attr.Code != "" {
		t.Fatalf("attr = %+v", attr)
	}
}
