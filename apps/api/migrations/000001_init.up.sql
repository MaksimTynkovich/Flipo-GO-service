CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL UNIQUE,
    username VARCHAR(64),
    first_name VARCHAR(128),
    last_name VARCHAR(128),
    photo_url VARCHAR(512),
    ton_wallet VARCHAR(66),
    betting_balance BIGINT NOT NULL DEFAULT 0 CHECK (betting_balance >= 0),
    staking_tier VARCHAR(16) NOT NULL DEFAULT 'base',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_users_ton_wallet ON users(ton_wallet);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    source VARCHAR(32) NOT NULL,
    telegram_gift_id VARCHAR(128) UNIQUE,
    collection_slug VARCHAR(128),
    token_id VARCHAR(128),
    name VARCHAR(256),
    image_url VARCHAR(512),
    metadata JSONB,
    floor_price_nanoton BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    deposited_at TIMESTAMPTZ NOT NULL,
    liquidated_at TIMESTAMPTZ,
    telegram_tx_ref VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inventory_user_id ON inventory_items(user_id);
CREATE INDEX idx_inventory_status ON inventory_items(status);

CREATE TABLE nft_floor_prices (
    collection_slug VARCHAR(128) PRIMARY KEY,
    price_nanoton BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE staking_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    inventory_item_id UUID NOT NULL UNIQUE REFERENCES inventory_items(id),
    tier_at_stake VARCHAR(16) NOT NULL,
    principal_nanoton BIGINT NOT NULL,
    accrued_yield_nanoton BIGINT NOT NULL DEFAULT 0,
    last_accrual_at TIMESTAMPTZ,
    staked_at TIMESTAMPTZ NOT NULL,
    unstaked_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_staking_user_id ON staking_positions(user_id);
CREATE INDEX idx_staking_is_active ON staking_positions(is_active);

CREATE TABLE user_staking_snapshots (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    rolling_7day_roulette_wager BIGINT NOT NULL DEFAULT 0,
    boost_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    last_roulette_bet_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE game_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_type VARCHAR(16) NOT NULL,
    round_number BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    result_payload JSONB,
    server_seed_hash VARCHAR(64),
    server_seed VARCHAR(128),
    client_seed VARCHAR(128),
    nonce BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_game_rounds_type ON game_rounds(game_type);
CREATE INDEX idx_game_rounds_number ON game_rounds(round_number);

CREATE TABLE game_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES game_rounds(id),
    user_id UUID NOT NULL REFERENCES users(id),
    game_type VARCHAR(16) NOT NULL,
    amount_nanoton BIGINT NOT NULL,
    selection JSONB,
    payout_nanoton BIGINT DEFAULT 0,
    platform_fee BIGINT DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    cashout_multiplier DECIMAL(10,4),
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);
CREATE INDEX idx_game_bets_round_id ON game_bets(round_id);
CREATE INDEX idx_game_bets_user_id ON game_bets(user_id);
CREATE INDEX idx_game_bets_game_type ON game_bets(game_type);
CREATE INDEX idx_game_bets_status ON game_bets(status);
CREATE INDEX idx_game_bets_created_at ON game_bets(created_at);

CREATE TABLE pvp_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id),
    bet_amount_nanoton BIGINT NOT NULL,
    max_players INT NOT NULL DEFAULT 2,
    status VARCHAR(32) NOT NULL,
    winner_id UUID REFERENCES users(id),
    platform_fee_bps INT NOT NULL DEFAULT 500,
    game_round_id UUID REFERENCES game_rounds(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX idx_pvp_rooms_creator ON pvp_rooms(creator_id);
CREATE INDEX idx_pvp_rooms_status ON pvp_rooms(status);

CREATE TABLE pvp_room_players (
    room_id UUID NOT NULL REFERENCES pvp_rooms(id),
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_winner BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE balance_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(32) NOT NULL,
    amount_nanoton BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reference_type VARCHAR(32),
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_balance_ledgers_user_id ON balance_ledgers(user_id);
CREATE INDEX idx_balance_ledgers_created_at ON balance_ledgers(created_at);
