ALTER TABLE users
    ADD COLUMN referrer_id UUID REFERENCES users(id);

CREATE INDEX idx_users_referrer_id ON users(referrer_id);
