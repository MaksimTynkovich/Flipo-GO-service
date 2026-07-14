CREATE TABLE IF NOT EXISTS gift_trait_prices (
    collection_slug VARCHAR(128) NOT NULL,
    model           VARCHAR(128) NOT NULL,
    backdrop        VARCHAR(128) NOT NULL DEFAULT '',
    price_nanoton   BIGINT NOT NULL,
    source          VARCHAR(64) NOT NULL DEFAULT '',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection_slug, model, backdrop)
);

CREATE INDEX IF NOT EXISTS idx_gift_trait_prices_fetched_at ON gift_trait_prices(fetched_at);
