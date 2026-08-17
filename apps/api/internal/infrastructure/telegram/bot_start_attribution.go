package telegram

import (
	"context"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/campaign"
)

// CampaignResolver looks up an ad campaign by short code from start_param.
type CampaignResolver interface {
	FindByCode(ctx context.Context, code string) (*domain.Campaign, error)
}

// ResolveBotStartAttribution maps a /start or startapp payload to admin notice fields.
func ResolveBotStartAttribution(ctx context.Context, campaigns CampaignResolver, payload string) BotStartAttribution {
	parsed := campaign.ParseStartPayload(payload)
	attr := BotStartAttribution{Payload: parsed.Raw, Kind: parsed.Kind}
	if parsed.Kind != campaign.KindCampaign {
		return attr
	}
	attr.Code = parsed.CampaignCode
	if campaigns == nil {
		return attr
	}
	found, err := campaigns.FindByCode(ctx, parsed.CampaignCode)
	if err != nil || found == nil {
		return attr
	}
	attr.Name = found.Name
	attr.Code = found.Code
	attr.Source = found.Source
	attr.Content = found.Content
	return attr
}
