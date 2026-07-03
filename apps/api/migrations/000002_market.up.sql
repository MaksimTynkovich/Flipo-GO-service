-- Market listings for gift marketplace
CREATE TABLE IF NOT EXISTS market_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    price_nanoton BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    source VARCHAR(16) NOT NULL,
    buyer_id UUID REFERENCES users(id),
    sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
