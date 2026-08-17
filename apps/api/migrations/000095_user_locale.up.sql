ALTER TABLE users
    ADD COLUMN locale VARCHAR(8) NOT NULL DEFAULT 'en';

ALTER TABLE users
    ADD CONSTRAINT users_locale_check CHECK (locale IN ('en', 'ru'));

-- Existing accounts were created when the product was Russian-only.
UPDATE users SET locale = 'ru';
