ALTER TABLE daily_quest_board_settings
    ADD COLUMN IF NOT EXISTS promo_slides JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE daily_quest_board_settings
SET promo_slides = '[
  {
    "id": "duo",
    "tone": "duo",
    "eyebrow": "Супер-акция",
    "title": "1+1 на кейсы",
    "subtitle": "Открой кейс — второй бесплатно",
    "cta": "К заданиям",
    "cover_url": "/cases/covers/quest-promo-2x.webp",
    "active": true
  },
  {
    "id": "open",
    "tone": "open",
    "eyebrow": "Задание дня",
    "title": "Открой кейс",
    "subtitle": "Выполни цель и забери награду",
    "cta": "Смотреть",
    "cover_url": "/cases/covers/quest-promo-open.webp",
    "active": true
  }
]'::jsonb
WHERE id = 1
  AND (promo_slides IS NULL OR promo_slides = '[]'::jsonb);
