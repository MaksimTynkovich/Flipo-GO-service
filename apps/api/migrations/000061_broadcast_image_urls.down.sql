ALTER TABLE telegram_broadcasts
    ADD COLUMN IF NOT EXISTS image_url TEXT;

UPDATE telegram_broadcasts
SET image_url = image_urls->>0
WHERE image_url IS NULL
  AND jsonb_typeof(image_urls) = 'array'
  AND jsonb_array_length(image_urls) > 0;

ALTER TABLE telegram_broadcasts
    DROP COLUMN IF EXISTS image_urls;
