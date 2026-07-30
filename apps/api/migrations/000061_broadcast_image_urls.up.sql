ALTER TABLE telegram_broadcasts
    ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]';

UPDATE telegram_broadcasts
SET image_urls = jsonb_build_array(image_url)
WHERE COALESCE(image_url, '') <> ''
  AND (image_urls IS NULL OR image_urls = '[]'::jsonb);

ALTER TABLE telegram_broadcasts
    DROP COLUMN IF EXISTS image_url;
