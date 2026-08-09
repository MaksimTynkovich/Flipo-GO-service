-- Seed: production cases catalog (flipo.rest snapshot)
-- Generated: 2026-08-09 08:29:31Z
-- Content: cases + loot + live-feed settings + promo codes (used_count reset).
-- Safe for local/dev. Do NOT run blindly on production.
BEGIN;

-- Clear dependent local rows (dev opens/history).
DO $$ BEGIN
  IF to_regclass('public.case_quest_share_prepared') IS NOT NULL THEN DELETE FROM case_quest_share_prepared; END IF;
  IF to_regclass('public.case_quest_shares') IS NOT NULL THEN DELETE FROM case_quest_shares; END IF;
  IF to_regclass('public.case_promo_redemptions') IS NOT NULL THEN DELETE FROM case_promo_redemptions; END IF;
  IF to_regclass('public.case_promo_codes') IS NOT NULL THEN DELETE FROM case_promo_codes; END IF;
  IF to_regclass('public.case_opens') IS NOT NULL THEN DELETE FROM case_opens; END IF;
  IF to_regclass('public.user_case_cooldowns') IS NOT NULL THEN DELETE FROM user_case_cooldowns; END IF;
  IF to_regclass('public.user_case_entitlements') IS NOT NULL THEN DELETE FROM user_case_entitlements; END IF;
  IF to_regclass('public.case_loot_entries') IS NOT NULL THEN DELETE FROM case_loot_entries; END IF;
  IF to_regclass('public.cases') IS NOT NULL THEN DELETE FROM cases; END IF;
END $$;

-- cases (14)
INSERT INTO cases (
  id, slug, title, image_url, accent_color, price_nanoton, kind, sort_order,
  active, require_channel, target_rtp_bps, created_at, updated_at,
  deleted_at, required_name_tag, require_share
) VALUES
  ('75804c99-c6c2-47a4-a170-8803b31b931a', 'daily', 'Daily', '/static/cases/219bef31-5b9b-4e5e-b1c3-6914b14b19c4.jpg', '#111a2e', 0, 'daily', 0, TRUE, TRUE, 9000, '2026-07-27 18:06:41.310049+00', '2026-08-02 12:28:38.424002+00', NULL, '', TRUE),
  ('a60c3cd9-addc-4781-abb6-cc9b12531d41', 'promo', 'Promo', '/static/cases/51da2c96-7746-4d82-8f23-57001360fd88.jpg', '#ff8e72', 0, 'promo', 1, TRUE, TRUE, 9000, '2026-07-27 20:17:06.936053+00', '2026-07-29 18:23:39.6926+00', NULL, '', FALSE),
  ('63a524d7-0ec3-4590-8136-88f806bc9237', 'farim', 'Farm', '/static/cases/73799f80-1607-45cb-aff7-f5e0513bf269.jpg', '#1a2642', 100000000, 'catalog', 2, TRUE, FALSE, 9000, '2026-07-27 20:27:34.423842+00', '2026-08-02 15:01:55.14069+00', NULL, '', FALSE),
  ('2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'farm2', 'Farm x5', '/static/cases/37ca9207-110d-4f96-924c-6ae563c88479.jpg', '#ff6b8b', 500000000, 'catalog', 3, TRUE, FALSE, 9000, '2026-07-27 20:42:33.333257+00', '2026-07-29 19:00:44.502589+00', NULL, '', FALSE),
  ('6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'stan', 'Start', '/static/cases/8623663a-95f6-405a-8408-2c065d62939d.jpg', '#111a2e', 1000000000, 'catalog', 4, TRUE, FALSE, 9000, '2026-07-27 20:51:38.782111+00', '2026-07-29 18:56:57.60989+00', NULL, '', FALSE),
  ('237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'rare', 'Collection', '/static/cases/c85cbe31-2457-4e08-93fb-a3a7324b5059.jpg', '#1a2642', 2500000000, 'catalog', 5, TRUE, FALSE, 9000, '2026-07-27 21:17:06.195727+00', '2026-07-29 11:29:07.511482+00', NULL, '', FALSE),
  ('ff435c45-c1e6-4693-8145-a303c217e735', 'average', 'Vanguard', '/static/cases/508add77-9f44-441b-bcc3-5a781775543b.jpg', '#a0c4ff', 5000000000, 'catalog', 6, TRUE, FALSE, 9000, '2026-07-28 22:26:07.148338+00', '2026-07-29 18:59:59.264206+00', NULL, '', FALSE),
  ('8223eb45-8c68-448e-8f60-d0399e54674b', 'big', 'Rare Edition', '/static/cases/5f331054-b45b-4a1d-86a1-b697810c15ca.jpg', '#e8b730', 7000000000, 'catalog', 7, TRUE, FALSE, 9000, '2026-07-28 22:25:27.567715+00', '2026-07-29 18:46:05.149439+00', NULL, '', FALSE),
  ('0b270a97-a309-4ff0-a716-c162cf8f01b1', 'magnat', 'Luxury', '/static/cases/b143bd02-7b68-4350-b168-e62ca9abc1c9.jpg', '#ff8e72', 25000000000, 'catalog', 8, TRUE, FALSE, 9000, '2026-07-27 21:24:59.420168+00', '2026-07-29 18:38:49.646024+00', NULL, '', FALSE),
  ('58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'major', 'Rich', '/static/cases/6e012948-7168-4bde-a7d1-be7500dde63a.jpg', '#424748', 50000000000, 'catalog', 9, TRUE, FALSE, 9000, '2026-07-27 21:29:14.182167+00', '2026-07-29 11:29:41.047425+00', NULL, '', FALSE),
  ('e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'black-case', 'Dark Mode', '/static/cases/989f78b9-d55b-4d46-9f27-7e84d1ce0976.jpg', '#ff6b8b', 15000000000, 'catalog', 10, TRUE, FALSE, 9000, '2026-07-28 20:32:44.277982+00', '2026-07-29 19:00:14.467046+00', NULL, '', FALSE),
  ('0f2167a5-560a-4ccd-80c5-25aadaa1d141', '50-na-50', '50 / 50', '/static/cases/e1d6335d-5855-4039-8a20-47cbd780c94b.jpg', '#70d6ff', 30000000000, 'catalog', 11, TRUE, FALSE, 9000, '2026-07-28 20:30:08.5826+00', '2026-07-29 18:10:10.973561+00', NULL, '', FALSE),
  ('2f634640-cfb4-4027-a5a5-18c70e31200d', 'wad', 'Plush Pepe', '/static/cases/b0a3c6e8-ea55-4654-b0b1-d292eea4e200.jpg', '#aee4aa', 5000000000, 'catalog', 12, TRUE, FALSE, 9000, '2026-07-27 11:18:21.153089+00', '2026-07-29 13:38:33.31018+00', NULL, '', FALSE),
  ('53064528-2347-4538-acdf-769866bcf84b', 'starter', 'Redo', '/static/cases/f38c1f82-4834-4641-97e3-b632b1d84567.jpg', '#424748', 5000000000, 'catalog', 13, TRUE, FALSE, 9000, '2026-07-27 10:55:24.456804+00', '2026-07-29 18:25:35.198097+00', NULL, '', FALSE);

-- case_loot_entries (170)
INSERT INTO case_loot_entries (
  id, case_id, prize_type, collection_slug, weight, display_name, image_url,
  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,
  created_at, model_name, collection_name, backdrop
) VALUES
  ('5f1e7eb4-13b5-4799-a76e-22abaaa2716e', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'lootbag', 35, 'Loot Bag', 'https://api.changes.tg/original/Loot%20Bag.png?size=256', 'legendary', '#151616', 0, 450000000000, 0, '2026-07-30 16:58:49.980074+00', '', 'Loot Bag', 'Black'),
  ('c65e947d-d561-4158-8e9d-9bfbd63230c9', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'artisanbrick', 52, 'Artisan Brick', 'https://api.changes.tg/original/Artisan%20Brick.png?size=256', 'legendary', '#151616', 1, 365000000000, 0, '2026-07-30 16:58:49.980431+00', '', 'Artisan Brick', 'Black'),
  ('5d26d5aa-9d1d-46b9-8488-5f701d7dc49f', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'preciouspeach', 88, 'Precious Peach', 'https://api.changes.tg/original/Precious%20Peach.png?size=256', 'legendary', '#ff8e72', 2, 248990000000, 0, '2026-07-30 16:58:49.980589+00', '', 'Precious Peach', ''),
  ('5d6334b7-4ce3-47c9-a0c4-2061ef43f36e', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'heroichelmet', 122, 'Heroic Helmet', 'https://api.changes.tg/original/Heroic%20Helmet.png?size=256', 'legendary', '#ff8e72', 3, 172410000000, 0, '2026-07-30 16:58:49.980735+00', '', 'Heroic Helmet', ''),
  ('a173db43-c22a-4ab9-890a-362ec1e9c2be', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'scaredcat', 122, 'Scared Cat', 'https://api.changes.tg/original/Scared%20Cat.png?size=256', 'legendary', '#ff8e72', 4, 167240000000, 0, '2026-07-30 16:58:49.980883+00', '', 'Scared Cat', ''),
  ('302f33bd-6790-449a-91d9-932229eae741', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'astralshard', 166, 'Astral Shard', 'https://api.changes.tg/original/Astral%20Shard.png?size=256', 'legendary', '#ff8e72', 5, 120000000000, 0, '2026-07-30 16:58:49.980988+00', '', 'Astral Shard', ''),
  ('504d8179-8eeb-4824-a7a4-ac0d31817150', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'westsidesign', 251, 'Westside Sign', 'https://api.changes.tg/original/Westside%20Sign.png?size=256', 'legendary', '#ff8e72', 6, 81420000000, 0, '2026-07-30 16:58:49.981086+00', '', 'Westside Sign', ''),
  ('e4aba707-c223-4f21-a38b-b8f2fd405d26', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'swisswatch', 428, 'Swiss Watch', 'https://api.changes.tg/original/Swiss%20Watch.png?size=256', 'legendary', '#ff8e72', 7, 43860000000, 0, '2026-07-30 16:58:49.981156+00', '', 'Swiss Watch', ''),
  ('1070e867-efcd-42c9-b1fa-3de4365af2a0', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'vintagecigar', 436, 'Vintage Cigar', 'https://api.changes.tg/original/Vintage%20Cigar.png?size=256', 'legendary', '#ff8e72', 8, 31060000000, 0, '2026-07-30 16:58:49.981224+00', '', 'Vintage Cigar', ''),
  ('f6f44a86-236b-4405-8f93-b9c240b9d9d3', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'genielamp', 2807, 'Genie Lamp', 'https://api.changes.tg/original/Genie%20Lamp.png?size=256', 'legendary', '#ff8e72', 9, 30070000000, 0, '2026-07-30 16:58:49.981276+00', '', 'Genie Lamp', ''),
  ('22a663c1-824e-486a-a67e-97e8bd45761d', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'ionicdryer', 1500, 'Ionic Dryer', 'https://api.changes.tg/original/Ionic%20Dryer.png?size=256', 'epic', '#ff8e72', 10, 13680000000, 0, '2026-07-30 16:58:49.98135+00', '', 'Ionic Dryer', ''),
  ('0d4e15cc-8460-4669-b04e-8eaca21f14cd', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'crystalball', 1387, 'Crystal Ball', 'https://api.changes.tg/original/Crystal%20Ball.png?size=256', 'epic', '#ff8e72', 11, 10100000000, 0, '2026-07-30 16:58:49.981431+00', '', 'Crystal Ball', ''),
  ('52e50298-2486-42f6-a634-4aaf700561c4', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'madpumpkin', 1335, 'Mad Pumpkin', 'https://api.changes.tg/original/Mad%20Pumpkin.png?size=256', 'rare', '#ff8e72', 12, 8870000000, 0, '2026-07-30 16:58:49.981506+00', '', 'Mad Pumpkin', ''),
  ('b94afe32-8981-4722-8da8-f9fde2861ccf', '0b270a97-a309-4ff0-a716-c162cf8f01b1', 'gift', 'skullflower', 1271, 'Skull Flower', 'https://api.changes.tg/original/Skull%20Flower.png?size=256', 'rare', '#ff8e72', 13, 8720000000, 0, '2026-07-30 16:58:49.981561+00', '', 'Skull Flower', ''),
  ('c7197afe-dedf-4192-8302-c2d901d6f9bd', '0f2167a5-560a-4ccd-80c5-25aadaa1d141', 'gift', 'iongem', 5000, 'Ion Gem', 'https://api.changes.tg/original/Ion%20Gem.png?size=256', '', '#70d6ff', 0, 60000000000, 0, '2026-08-01 23:07:47.545894+00', '', 'Ion Gem', ''),
  ('a8aa7bea-2219-4b68-8c06-4cc864c5f686', '0f2167a5-560a-4ccd-80c5-25aadaa1d141', 'ton', '', 5000, 'TON', '', '', '#70d6ff', 1, 15000000000, 15000000000, '2026-08-01 23:07:47.546894+00', '', '', ''),
  ('c1269ece-b710-4a8c-87b4-ab4b54c7dbf9', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'iongem', 1, 'Ion Gem', 'https://api.changes.tg/original/Ion%20Gem.png?size=256', 'legendary', '#1a2642', 0, 60150000000, 0, '2026-07-30 17:00:16.12598+00', '', 'Ion Gem', ''),
  ('733574a0-1bc4-4146-866e-c6c628a6d89d', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'perfumebottle', 1, 'Perfume Bottle', 'https://api.changes.tg/original/Perfume%20Bottle.png?size=256', 'legendary', '#111a2e', 1, 56340000000, 0, '2026-07-30 17:00:16.126259+00', '', 'Perfume Bottle', ''),
  ('26305531-dd9a-40e0-88c2-9c0866e4d79a', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'rarebird', 1, 'Rare Bird', 'https://api.changes.tg/original/Rare%20Bird.png?size=256', 'rare', '#111a2e', 2, 20710000000, 0, '2026-07-30 17:00:16.126348+00', '', 'Rare Bird', ''),
  ('0e9630e4-4113-4627-9f5d-cb45ff3b4c82', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'snoopcigar', 1, 'Snoop Cigar', 'https://api.changes.tg/original/Snoop%20Cigar.png?size=256', 'rare', '#1a2642', 3, 11870000000, 0, '2026-07-30 17:00:16.126439+00', '', 'Snoop Cigar', ''),
  ('1dad509a-3fb1-45ca-8b92-d53a6417f6e6', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'jollychimp', 1, 'Jolly Chimp', 'https://api.changes.tg/original/Jolly%20Chimp.png?size=256', 'rare', '#1a2642', 4, 5980000000, 0, '2026-07-30 17:00:16.126492+00', '', 'Jolly Chimp', ''),
  ('dce629a4-2565-4108-8caa-276de6cfd699', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'stellarrocket', 1, 'Stellar Rocket', 'https://api.changes.tg/original/Stellar%20Rocket.png?size=256', 'rare', '#111a2e', 5, 4250000000, 0, '2026-07-30 17:00:16.126587+00', '', 'Stellar Rocket', ''),
  ('2e6bd362-4443-4aee-aaf4-9a0ddbb9b2aa', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'moodpack', 1, 'Mood Pack', 'https://api.changes.tg/original/Mood%20Pack.png?size=256', 'uncommon', '#111a2e', 6, 3270000000, 0, '2026-07-30 17:00:16.126653+00', '', 'Mood Pack', ''),
  ('c8783cf4-7d35-43e6-b289-c36169ba018d', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'easteregg', 1, 'Easter Egg', 'https://api.changes.tg/original/Easter%20Egg.png?size=256', 'uncommon', '#1a2642', 7, 3080000000, 0, '2026-07-30 17:00:16.126727+00', '', 'Easter Egg', ''),
  ('3b5ad64c-2d64-4ea4-af98-968d8f389d7e', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'chillflame', 1, 'Chill Flame', 'https://api.changes.tg/original/Chill%20Flame.png?size=256', 'uncommon', '#1a2642', 8, 2800000000, 0, '2026-07-30 17:00:16.126827+00', '', 'Chill Flame', ''),
  ('ff3bb72a-13b8-4d66-b8a1-75e82ef49baf', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'gift', 'vicecream', 1, 'Vice Cream', 'https://api.changes.tg/original/Vice%20Cream.png?size=256', 'common', '#111a2e', 9, 2790000000, 0, '2026-07-30 17:00:16.126876+00', '', 'Vice Cream', ''),
  ('76a1fc3e-b8fa-4bf0-a1bf-9632440576a4', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'ton', '', 1, 'TON', '', 'common', '#111a2e', 10, 1000000000, 1000000000, '2026-07-30 17:00:16.126925+00', '', '', ''),
  ('17abd2cb-e152-4820-801c-1974b7a4fa76', '237b49e4-7f4e-4af5-a4f0-6a26e8914d78', 'ton', '', 1, 'TON', '', 'common', '#1a2642', 11, 500000000, 500000000, '2026-07-30 17:00:16.126979+00', '', '', ''),
  ('3c66b815-53dc-427f-963e-a9b557d159cf', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'durovsglasses', 0, 'Durov''s Glasses', 'https://api.changes.tg/original/Durov''s%20Glasses.png?size=256', '', '#ff9ebb', 0, 176500000000, 0, '2026-08-03 21:48:14.496613+00', '', 'Durov''s Glasses', ''),
  ('f3229803-c0f3-4cb6-add4-412f72b7b0da', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'scaredcat', 0, 'Scared Cat', 'https://api.changes.tg/original/Scared%20Cat.png?size=256', '', '#f77091', 1, 167000000000, 0, '2026-08-03 21:48:14.497671+00', '', 'Scared Cat', ''),
  ('0f5e5744-4807-4bcf-bc8a-83ad2d8e5569', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'astralshard', 0, 'Astral Shard', 'https://api.changes.tg/original/Astral%20Shard.png?size=256', '', '#f77091', 2, 120000000000, 0, '2026-08-03 21:48:14.497922+00', '', 'Astral Shard', ''),
  ('c6e1440e-f392-4823-99eb-72d5e7ba61a7', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'mightyarm', 0, 'Mighty Arm', 'https://api.changes.tg/original/Mighty%20Arm.png?size=256', '', '#ff9ebb', 3, 105000000000, 0, '2026-08-03 21:48:14.498075+00', '', 'Mighty Arm', ''),
  ('a4fa5ab2-5eed-499f-a699-78bc8b02de01', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'gemsignet', 0, 'Gem Signet', 'https://api.changes.tg/original/Gem%20Signet.png?size=256', '', '#ff9ebb', 4, 52000000000, 0, '2026-08-03 21:48:14.498218+00', '', 'Gem Signet', ''),
  ('df3648bb-3075-4c0f-a32a-ffc8c3516813', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'blingbinky', 0, 'Bling Binky', 'https://api.changes.tg/original/Bling%20Binky.png?size=256', '', '#f77091', 5, 21050000000, 0, '2026-08-03 21:48:14.498349+00', '', 'Bling Binky', ''),
  ('e775455e-be24-49c7-8a2d-6315cdc4f959', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'cupidcharm', 0, 'Cupid Charm', 'https://api.changes.tg/original/Cupid%20Charm.png?size=256', '', '#f77091', 6, 19040000000, 0, '2026-08-03 21:48:14.498471+00', '', 'Cupid Charm', ''),
  ('eb4f15a9-bae2-4792-b4de-6c9693361b8f', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'hangingstar', 0, 'Hanging Star', 'https://api.changes.tg/original/Hanging%20Star.png?size=256', '', '#ff9ebb', 7, 7000000000, 0, '2026-08-03 21:48:14.498558+00', '', 'Hanging Star', ''),
  ('4060faa0-40b7-4876-bf6a-70c34b7ecdf3', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'bunnymuffin', 33, 'Bunny Muffin', 'https://api.changes.tg/original/Bunny%20Muffin.png?size=256', '', '#ff9ebb', 8, 6220000000, 0, '2026-08-03 21:48:14.498645+00', '', 'Bunny Muffin', ''),
  ('c2bcc836-4019-42b9-b755-0c46ca9288a8', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'inputkey', 42, 'Input Key', 'https://api.changes.tg/original/Input%20Key.png?size=256', '', '#f77091', 9, 4930000000, 0, '2026-08-03 21:48:14.498728+00', '', 'Input Key', ''),
  ('6058f5eb-eecc-45c2-81d3-cd83e531e728', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'hexpot', 42, 'Hex Pot', 'https://api.changes.tg/original/Hex%20Pot.png?size=256', '', '#f77091', 10, 3390000000, 0, '2026-08-03 21:48:14.498787+00', '', 'Hex Pot', ''),
  ('f2214654-0b8f-408d-ab00-ba341ea28074', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'instantramen', 58, 'Instant Ramen', 'https://api.changes.tg/original/Instant%20Ramen.png?size=256', '', '#ff9ebb', 11, 2920000000, 0, '2026-08-03 21:48:14.498919+00', '', 'Instant Ramen', '');

INSERT INTO case_loot_entries (
  id, case_id, prize_type, collection_slug, weight, display_name, image_url,
  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,
  created_at, model_name, collection_name, backdrop
) VALUES
  ('08302f88-ce16-47d9-a302-17c6554906d2', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'gift', 'candycane', 157, 'Candy Cane', 'https://api.changes.tg/original/Candy%20Cane.png?size=256', '', '#ff9ebb', 12, 2870000000, 0, '2026-08-03 21:48:14.499047+00', '', 'Candy Cane', ''),
  ('5a850df5-b2cf-4d29-b47f-a2b71aad1bf4', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'ton', '', 2047, 'TON', '', '', '#f77091', 13, 800000000, 800000000, '2026-08-03 21:48:14.499134+00', '', '', ''),
  ('b61b5d9e-db46-4c65-a566-df99538e1541', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'ton', '', 3000, 'TON', '', '', '#f77091', 14, 300000000, 300000000, '2026-08-03 21:48:14.499232+00', '', '', ''),
  ('5f41fe7a-0b0b-443b-be46-18ebf053af4f', '2edee4ed-e327-4d1a-8f3f-3f82d524331e', 'ton', '', 4621, 'TON', '', '', '#ff9ebb', 15, 100000000, 100000000, '2026-08-03 21:48:14.499334+00', '', '', ''),
  ('2485c508-723a-4e0f-82d9-6704310fa5d2', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'snowglobe', 89, 'Snow Globe', 'https://api.changes.tg/model/Snow%20Globe/Pepe%20Frost.png?size=256', 'legendary', '#a8f0d3', 0, 42000000000, 0, '2026-07-30 16:57:04.443555+00', 'Pepe Frost', 'Snow Globe', ''),
  ('0feec7b0-a717-4f7a-a9a2-0c802ca34684', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'tamagadget', 119, 'Tama Gadget', 'https://api.changes.tg/model/Tama%20Gadget/Pepe%20Feels.png?size=256', 'legendary', '#a8f0d3', 1, 35000000000, 0, '2026-07-30 16:57:04.443713+00', 'Pepe Feels', 'Tama Gadget', ''),
  ('c0507aae-6412-43c6-a932-10bc94717c81', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'starnotepad', 119, 'Star Notepad', 'https://api.changes.tg/model/Star%20Notepad/Pepe%20Diary.png?size=256', 'epic', '#a8f0d3', 2, 34000000000, 0, '2026-07-30 16:57:04.443777+00', 'Pepe Diary', 'Star Notepad', ''),
  ('9da7f270-ab2b-45fb-8c7f-83a4ddf55637', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'winterwreath', 241, 'Winter Wreath', 'https://api.changes.tg/model/Winter%20Wreath/Festive%20Pepe.png?size=256', 'epic', '#a8f0d3', 3, 33000000000, 0, '2026-07-30 16:57:04.443822+00', 'Festive Pepe', 'Winter Wreath', ''),
  ('699a2177-d336-4d80-ab3e-34d13a089cec', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'bunnymuffin', 358, 'Bunny Muffin', 'https://api.changes.tg/model/Bunny%20Muffin/Froggy.png?size=256', 'epic', '#a8f0d3', 4, 33000000000, 0, '2026-07-30 16:57:04.443873+00', 'Froggy', 'Bunny Muffin', ''),
  ('81770d97-7a79-4a7a-9385-5ac4e47817a2', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'bdaycandle', 300, 'B-Day Candle', 'https://api.changes.tg/model/B-Day%20Candle/Crazy%20Frog.png?size=256', 'epic', '#a8f0d3', 5, 18000000000, 0, '2026-07-30 16:57:04.443943+00', 'Crazy Frog', 'B-Day Candle', ''),
  ('6dcd4858-6c3d-4cc1-a53d-0eeb8b921599', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'gingercookie', 565, 'Ginger Cookie', 'https://api.changes.tg/model/Ginger%20Cookie/Pepe%20Pryanik.png?size=256', 'rare', '#a8f0d3', 6, 13000000000, 0, '2026-07-30 16:57:04.443986+00', 'Pepe Pryanik', 'Ginger Cookie', ''),
  ('e3dac0de-eb09-46a5-a78a-0b9cd25e6e24', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'gift', 'valentinebox', 1543, 'Valentine Box', 'https://api.changes.tg/model/Valentine%20Box/Froggie.png?size=256', 'rare', '#a8f0d3', 7, 11000000000, 0, '2026-07-30 16:57:04.44403+00', 'Froggie', 'Valentine Box', ''),
  ('62faef22-d507-4447-a8a3-9366b636dc8c', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'ton', '', 2314, 'TON', '', 'uncommon', '#a8f0d3', 8, 1000000000, 1000000000, '2026-07-30 16:57:04.444085+00', '', '', ''),
  ('4cb55409-876a-46f4-9e23-9ac589458efd', '2f634640-cfb4-4027-a5a5-18c70e31200d', 'ton', '', 4352, 'TON', '', 'common', '#a8f0d3', 9, 500000000, 500000000, '2026-07-30 16:57:04.444127+00', '', '', ''),
  ('d6361731-000f-4710-8ad8-e9e1a267e0f3', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'tamagadget', 46, 'Tama Gadget', 'https://api.changes.tg/model/Tama%20Gadget/Underdog.png?size=256', 'legendary', '#424748', 0, 60000000000, 0, '2026-07-30 16:56:42.480092+00', 'Underdog', 'Tama Gadget', ''),
  ('db3cf8f8-fe23-4a89-9ebe-e0b33f01a7c7', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'valentinebox', 92, 'Valentine Box', 'https://api.changes.tg/model/Valentine%20Box/Resistance.png?size=256', 'legendary', '#111a2e', 1, 20000000000, 0, '2026-07-30 16:56:42.480427+00', 'Resistance', 'Valentine Box', ''),
  ('83ec4aa8-805c-450d-af39-7ff195dfbc2a', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'joyfulbundle', 186, 'Joyful Bundle', 'https://api.changes.tg/model/Joyful%20Bundle/Gem%20Stash.png?size=256', 'epic', '#111a2e', 2, 15000000000, 0, '2026-07-30 16:56:42.480547+00', 'Gem Stash', 'Joyful Bundle', ''),
  ('ce0450cb-3ef4-4659-bd74-34b03b71e40f', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'icecream', 282, 'Ice Cream', 'https://api.changes.tg/model/Ice%20Cream/Resistance.png?size=256', 'epic', '#424748', 3, 14000000000, 0, '2026-07-30 16:56:42.480644+00', 'Resistance', 'Ice Cream', ''),
  ('4e75a352-12d3-4546-9f78-09467374d99c', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'whipcupcake', 476, 'Whip Cupcake', 'https://api.changes.tg/model/Whip%20Cupcake/Resistance.png?size=256', 'epic', '#424748', 4, 9000000000, 0, '2026-07-30 16:56:42.48073+00', 'Resistance', 'Whip Cupcake', ''),
  ('a05380a0-b996-4764-8ae0-ef3b4e888a5f', '53064528-2347-4538-acdf-769866bcf84b', 'gift', 'bigyear', 4500, 'Big Year', 'https://api.changes.tg/model/Big%20Year/Pavel%20Durov.png?size=256', 'epic', '#111a2e', 5, 5500000000, 0, '2026-07-30 16:56:42.480817+00', 'Pavel Durov', 'Big Year', ''),
  ('8761e5cb-dedb-49b7-8213-52520543dd8f', '53064528-2347-4538-acdf-769866bcf84b', 'ton', '', 1954, 'TON', '', 'rare', '#111a2e', 6, 1000000000, 1000000000, '2026-07-30 16:56:42.480879+00', '', '', ''),
  ('d4f45321-5518-47d6-886d-518db5a22681', '53064528-2347-4538-acdf-769866bcf84b', 'ton', '', 2464, 'TON', '', 'rare', '#424748', 7, 500000000, 500000000, '2026-07-30 16:56:42.480912+00', '', '', ''),
  ('ad835bb8-6c76-4a6b-818c-7ec755770522', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'mightyarm', 58, 'Mighty Arm', 'https://api.changes.tg/original/Mighty%20Arm.png?size=256', 'legendary', '#151616', 0, 1500000000000, 0, '2026-07-30 16:58:02.863028+00', '', 'Mighty Arm', 'Black'),
  ('a0ac5fe7-bd37-46bf-9ff3-0c0dcf5cb0ac', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'swisswatch', 85, 'Swiss Watch', 'https://api.changes.tg/original/Swiss%20Watch.png?size=256', 'legendary', '#151616', 1, 1200000000000, 0, '2026-07-30 16:58:02.863508+00', '', 'Swiss Watch', 'Black'),
  ('64e6ee46-4fb8-4c8e-8338-e43cbcaef166', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'heartlocket', 117, 'Heart Locket', 'https://api.changes.tg/original/Heart%20Locket.png?size=256', 'legendary', '#1a2642', 2, 1000000000000, 0, '2026-07-30 16:58:02.863715+00', '', 'Heart Locket', ''),
  ('137f93ce-b24a-4670-acfa-dbcd9782b69f', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'durovscap', 124, 'Durov''s Cap', 'https://api.changes.tg/original/Durov''s%20Cap.png?size=256', 'legendary', '#1a2642', 3, 467000000000, 0, '2026-07-30 16:58:02.863869+00', '', 'Durov''s Cap', ''),
  ('06eced09-e80d-494d-a7f4-88dd0956e26c', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'lootbag', 455, 'Loot Bag', 'https://api.changes.tg/original/Loot%20Bag.png?size=256', 'legendary', '#111a2e', 4, 104000000000, 0, '2026-07-30 16:58:02.863964+00', '', 'Loot Bag', ''),
  ('a34443cd-123a-4e29-9cfa-6f86668960d9', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'nailbracelet', 1000, 'Nail Bracelet', 'https://api.changes.tg/original/Nail%20Bracelet.png?size=256', 'epic', '#111a2e', 5, 102000000000, 0, '2026-07-30 16:58:02.864036+00', '', 'Nail Bracelet', ''),
  ('4191a7f8-a6d5-4b3d-98ce-d51f4078313c', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'iongem', 1887, 'Ion Gem', 'https://api.changes.tg/original/Ion%20Gem.png?size=256', 'epic', '#1a2642', 6, 60150000000, 0, '2026-07-30 16:58:02.86411+00', '', 'Ion Gem', ''),
  ('caa629df-0350-4647-a78f-5adc7540201a', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'artisanbrick', 1616, 'Artisan Brick', 'https://api.changes.tg/original/Artisan%20Brick.png?size=256', 'epic', '#1a2642', 7, 47090000000, 0, '2026-07-30 16:58:02.864168+00', '', 'Artisan Brick', ''),
  ('453f909f-5215-4f2d-a7d5-719ea96bc93a', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'lowrider', 1746, 'Low Rider', 'https://api.changes.tg/original/Low%20Rider.png?size=256', 'epic', '#111a2e', 8, 43280000000, 0, '2026-07-30 16:58:02.864242+00', '', 'Low Rider', ''),
  ('1b0d4cd6-b1f3-4595-be6c-58ee8f7075e0', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'signetring', 856, 'Signet Ring', 'https://api.changes.tg/original/Signet%20Ring.png?size=256', 'epic', '#111a2e', 9, 28700000000, 0, '2026-07-30 16:58:02.864343+00', '', 'Signet Ring', ''),
  ('1b8412e0-2022-495a-8f61-b944328a4dbf', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'electricskull', 1097, 'Electric Skull', 'https://api.changes.tg/original/Electric%20Skull.png?size=256', 'epic', '#1a2642', 10, 21520000000, 0, '2026-07-30 16:58:02.86445+00', '', 'Electric Skull', ''),
  ('26c23a5e-adec-4d7c-808b-1a88408a3005', '58e8bcd4-7fca-4ebb-9329-e21ff1ef19dc', 'gift', 'cupidcharm', 959, 'Cupid Charm', 'https://api.changes.tg/original/Cupid%20Charm.png?size=256', 'epic', '#1a2642', 11, 20000000000, 0, '2026-07-30 16:58:02.864519+00', '', 'Cupid Charm', ''),
  ('519dbe33-83ea-46f2-8c90-d4a189439944', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'magicpotion', 0, 'Magic Potion', 'https://api.changes.tg/original/Magic%20Potion.png?size=256', '', '#ff8e72', 0, 49000000000, 0, '2026-08-02 19:59:50.769853+00', '', 'Magic Potion', ''),
  ('8264a617-97cd-4ecb-8ddc-38ebdfa78b75', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'lowrider', 0, 'Low Rider', 'https://api.changes.tg/original/Low%20Rider.png?size=256', '', '#765c37', 1, 43400000000, 0, '2026-08-02 19:59:50.770067+00', '', 'Low Rider', ''),
  ('13328d8a-2f35-44a1-8288-3f0311fb192a', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'kissedfrog', 0, 'Kissed Frog', 'https://api.changes.tg/original/Kissed%20Frog.png?size=256', '', '#cff4d2', 2, 37800000000, 0, '2026-08-02 19:59:50.77021+00', '', 'Kissed Frog', ''),
  ('9a13217f-4b7e-42b9-bebb-6daa602e22ac', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'sharptongue', 0, 'Sharp Tongue', 'https://api.changes.tg/original/Sharp%20Tongue.png?size=256', '', '#70d6ff', 3, 36500000000, 0, '2026-08-02 19:59:50.770274+00', '', 'Sharp Tongue', ''),
  ('ac27d2bd-ceb2-46a8-a827-52b8ff3cc902', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'nekohelmet', 0, 'Neko Helmet', 'https://api.changes.tg/original/Neko%20Helmet.png?size=256', '', '#f77091', 4, 32500000000, 0, '2026-08-02 19:59:50.770322+00', '', 'Neko Helmet', ''),
  ('abf23959-a23c-403c-9b73-4aed0ec79aa6', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'ionicdryer', 2, 'Ionic Dryer', 'https://api.changes.tg/original/Ionic%20Dryer.png?size=256', '', '#70d6ff', 5, 13430000000, 0, '2026-08-02 19:59:50.770441+00', '', 'Ionic Dryer', '');

INSERT INTO case_loot_entries (
  id, case_id, prize_type, collection_slug, weight, display_name, image_url,
  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,
  created_at, model_name, collection_name, backdrop
) VALUES
  ('fa2ea366-0ce4-4ee3-a352-dfcbcc5d2d53', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'lightsword', 59, 'Light Sword', 'https://api.changes.tg/original/Light%20Sword.png?size=256', '', '#bdb2ff', 6, 5200000000, 0, '2026-08-02 19:59:50.770519+00', '', 'Light Sword', ''),
  ('213504e9-12ae-4aa9-b2bd-03ae6527a6d7', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'eternalcandle', 69, 'Eternal Candle', 'https://api.changes.tg/original/Eternal%20Candle.png?size=256', '', '#ff9ebb', 7, 4180000000, 0, '2026-08-02 19:59:50.770591+00', '', 'Eternal Candle', ''),
  ('ab5a1a1c-1f3c-482d-b3e8-b88e6850152a', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'lolpop', 77, 'Lol Pop', 'https://api.changes.tg/original/Lol%20Pop.png?size=256', '', '#3d348b', 8, 2980000000, 0, '2026-08-02 19:59:50.770669+00', '', 'Lol Pop', ''),
  ('233fffe9-06b1-4f32-8632-3914e92f1d13', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'icecream', 86, 'Ice Cream', 'https://api.changes.tg/original/Ice%20Cream.png?size=256', '', '#765c37', 9, 2970000000, 0, '2026-08-02 19:59:50.770725+00', '', 'Ice Cream', ''),
  ('263510f5-5b69-4169-8c97-362b9026cb25', '63a524d7-0ec3-4590-8136-88f806bc9237', 'gift', 'lunarsnake', 11, 'Lunar Snake', 'https://api.changes.tg/original/Lunar%20Snake.png?size=256', '', '#cff4d2', 10, 2860000000, 0, '2026-08-02 19:59:50.770767+00', '', 'Lunar Snake', ''),
  ('d54dae91-b16a-49ac-b109-3669097d996b', '63a524d7-0ec3-4590-8136-88f806bc9237', 'ton', '', 2360, 'TON', '', '', '#1a2642', 11, 150000000, 150000000, '2026-08-02 19:59:50.77082+00', '', '', ''),
  ('317853f0-0c3e-45c8-921f-a82cc16274a0', '63a524d7-0ec3-4590-8136-88f806bc9237', 'ton', '', 3000, 'TON', '', '', '#1a2642', 12, 50000000, 50000000, '2026-08-02 19:59:50.770876+00', '', '', ''),
  ('da96e5d7-a459-41eb-a9e4-0bfd0598b51f', '63a524d7-0ec3-4590-8136-88f806bc9237', 'ton', '', 4336, 'TON', '', '', '#111a2e', 13, 25000000, 25000000, '2026-08-02 19:59:50.770939+00', '', '', ''),
  ('ea2a1bef-5c35-4fbf-a4c4-8d2935b5dfa4', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'diamondring', 190, 'Diamond Ring', 'https://api.changes.tg/original/Diamond%20Ring.png?size=256', 'epic', '#111a2e', 0, 26320000000, 0, '2026-07-30 17:00:34.802186+00', '', 'Diamond Ring', ''),
  ('09e6d486-12a4-46e3-a095-1e66e9b27433', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'eternalrose', 171, 'Eternal Rose', 'https://api.changes.tg/original/Eternal%20Rose.png?size=256', 'epic', '#1a2642', 1, 21130000000, 0, '2026-07-30 17:00:34.802354+00', '', 'Eternal Rose', ''),
  ('3f76136e-0035-4d9f-8272-acc9319b6da9', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'cupidcharm', 153, 'Cupid Charm', 'https://api.changes.tg/original/Cupid%20Charm.png?size=256', 'rare', '#1a2642', 2, 18610000000, 0, '2026-07-30 17:00:34.80245+00', '', 'Cupid Charm', ''),
  ('dd5a964a-cffb-470f-9b40-e69485a986b6', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'crystalball', 133, 'Crystal Ball', 'https://api.changes.tg/original/Crystal%20Ball.png?size=256', 'rare', '#111a2e', 3, 10170000000, 0, '2026-07-30 17:00:34.80251+00', '', 'Crystal Ball', ''),
  ('5c0b006f-683b-405d-a964-c337ceefd89a', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'berrybox', 112, 'Berry Box', 'https://api.changes.tg/original/Berry%20Box.png?size=256', 'rare', '#111a2e', 4, 6560000000, 0, '2026-07-30 17:00:34.802575+00', '', 'Berry Box', ''),
  ('25c2295f-a862-451e-a6de-f64808a2f32a', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'faithamulet', 300, 'Faith Amulet', 'https://api.changes.tg/original/Faith%20Amulet.png?size=256', 'rare', '#1a2642', 5, 4200000000, 0, '2026-07-30 17:00:34.802624+00', '', 'Faith Amulet', ''),
  ('3a680ae1-3480-4ffc-b8eb-78dfb79e0100', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'moneypot', 509, 'Money Pot', 'https://api.changes.tg/original/Money%20Pot.png?size=256', 'rare', '#1a2642', 6, 4100000000, 0, '2026-07-30 17:00:34.802752+00', '', 'Money Pot', ''),
  ('75b11d8a-dcfe-4301-bb24-860b1592e02b', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'gift', 'gingercookie', 210, 'Ginger Cookie', 'https://api.changes.tg/original/Ginger%20Cookie.png?size=256', 'rare', '#111a2e', 7, 3200000000, 0, '2026-07-30 17:00:34.802832+00', '', 'Ginger Cookie', ''),
  ('d71ed9be-a421-432c-aa30-4d19a4aad37e', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'ton', '', 5313, 'TON', '', 'rare', '#111a2e', 8, 250000000, 250000000, '2026-07-30 17:00:34.802911+00', '', '', ''),
  ('4c528a2a-b808-4a6a-8f41-f857816e01ce', '6cea2fb1-f9a7-4b60-8ebe-e41f8a9de4fd', 'ton', '', 2909, 'TON', '', 'common', '#1a2642', 9, 150000000, 150000000, '2026-07-30 17:00:34.803001+00', '', '', ''),
  ('77545403-8a63-43d0-bef9-51923f8b0ed3', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'flyingbroom', 0, 'Flying Broom', 'https://api.changes.tg/original/Flying%20Broom.png?size=256', '', '#f77091', 0, 10000000000, 0, '2026-08-02 12:30:21.361632+00', '', 'Flying Broom', ''),
  ('19e29bfe-0824-4b05-b1ab-51491e12515f', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'evileye', 0, 'Evil Eye', 'https://api.changes.tg/original/Evil%20Eye.png?size=256', '', '#9d8df1', 1, 6800000000, 0, '2026-08-02 12:30:21.362505+00', '', 'Evil Eye', ''),
  ('6012c999-42e5-45b2-a142-a56998bbf279', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'lightsword', 0, 'Light Sword', 'https://api.changes.tg/original/Light%20Sword.png?size=256', '', '#a0c4ff', 2, 5200000000, 0, '2026-08-02 12:30:21.362718+00', '', 'Light Sword', ''),
  ('e8ac01d2-00d9-43b3-813c-2a0b8b8becce', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'deskcalendar', 0, 'Desk Calendar', 'https://api.changes.tg/original/Desk%20Calendar.png?size=256', '', '#bdb2ff', 3, 4250000000, 0, '2026-08-02 12:30:21.36285+00', '', 'Desk Calendar', ''),
  ('90fb6442-5033-403d-8751-85b3c1e00a23', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'bowtie', 0, 'Bow Tie', 'https://api.changes.tg/original/Bow%20Tie.png?size=256', '', '#3d348b', 4, 4000000000, 0, '2026-08-02 12:30:21.362937+00', '', 'Bow Tie', ''),
  ('99f77852-adcc-4bef-9166-7ab7988fb11f', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'gingercookie', 0, 'Ginger Cookie', 'https://api.changes.tg/original/Ginger%20Cookie.png?size=256', '', '#70d6ff', 5, 3250000000, 0, '2026-08-02 12:30:21.363027+00', '', 'Ginger Cookie', ''),
  ('6ead4813-e864-4842-992c-d77b8c152905', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'libertyfigure', 0, 'Liberty Figure', 'https://api.changes.tg/original/Liberty%20Figure.png?size=256', '', '#66f0b9', 6, 3250000000, 0, '2026-08-02 12:30:21.363153+00', '', 'Liberty Figure', ''),
  ('8e994f22-2caf-405a-ab6a-410c84f51c5c', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'partysparkler', 0, 'Party Sparkler', 'https://api.changes.tg/original/Party%20Sparkler.png?size=256', '', '#cff4d2', 7, 3250000000, 0, '2026-08-02 12:30:21.363238+00', '', 'Party Sparkler', ''),
  ('2ea162c8-2907-49ff-89cc-c4470c42ced8', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'jesterhat', 0, 'Jester Hat', 'https://api.changes.tg/original/Jester%20Hat.png?size=256', '', '#ff8e72', 8, 3100000000, 0, '2026-08-02 12:30:21.363316+00', '', 'Jester Hat', ''),
  ('cb143162-c587-4084-8835-8a43db71bd15', '75804c99-c6c2-47a4-a170-8803b31b931a', 'gift', 'lolpop', 0, 'Lol Pop', 'https://api.changes.tg/original/Lol%20Pop.png?size=256', '', '#ffb7b2', 9, 3000000000, 0, '2026-08-02 12:30:21.363385+00', '', 'Lol Pop', ''),
  ('95dfa868-0715-45a4-885f-af9f48e0ae67', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 10, 'TON', '', '', '#1a2642', 10, 250000000, 250000000, '2026-08-02 12:30:21.363467+00', '', '', ''),
  ('5a2b70c4-ce70-4314-83e8-65e323c01d47', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 30, 'TON', '', '', '#1a2642', 11, 100000000, 100000000, '2026-08-02 12:30:21.36356+00', '', '', ''),
  ('cb1dc1cb-3d31-436b-84bd-a73546235ce4', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 50, 'TON', '', '', '#1a2642', 12, 50000000, 50000000, '2026-08-02 12:30:21.363641+00', '', '', ''),
  ('745af4d7-22dd-41f9-aef5-e379ed77b72f', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 540, 'TON', '', '', '#1a2642', 13, 10000000, 10000000, '2026-08-02 12:30:21.363708+00', '', '', ''),
  ('ec7fa098-ee5e-4133-a379-3354713abdd0', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 1114, 'TON', '', '', '#1a2642', 14, 5000000, 5000000, '2026-08-02 12:30:21.36377+00', '', '', ''),
  ('6e9e2e86-1335-46f8-8d0a-eeef9fb363bd', '75804c99-c6c2-47a4-a170-8803b31b931a', 'ton', '', 8256, 'TON', '', '', '#1a2642', 15, 2000000, 2000000, '2026-08-02 12:30:21.363838+00', '', '', ''),
  ('932d68b3-7695-4573-b315-6d4f6bae499a', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'scaredcat', 478, 'Scared Cat', 'https://api.changes.tg/original/Scared%20Cat.png?size=256', 'legendary', '#111a2e', 0, 173000000000, 0, '2026-07-30 16:59:22.67394+00', '', 'Scared Cat', ''),
  ('1f77396d-c8d0-425e-b544-6a65fdd79dd0', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'nailbracelet', 478, 'Nail Bracelet', 'https://api.changes.tg/original/Nail%20Bracelet.png?size=256', 'legendary', '#e8b730', 1, 100000000000, 0, '2026-07-30 16:59:22.67418+00', '', 'Nail Bracelet', ''),
  ('71805f41-7e92-413b-8c43-946c7d2e3276', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'minioscar', 478, 'Mini Oscar', 'https://api.changes.tg/original/Mini%20Oscar.png?size=256', 'epic', '#e8b730', 2, 62050000000, 0, '2026-07-30 16:59:22.674245+00', '', 'Mini Oscar', ''),
  ('391ea7d4-56d3-4b37-9724-49797a297e85', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'iongem', 478, 'Ion Gem', 'https://api.changes.tg/original/Ion%20Gem.png?size=256', 'rare', '#111a2e', 3, 60740000000, 0, '2026-07-30 16:59:22.674298+00', '', 'Ion Gem', ''),
  ('f2472197-4e9d-460b-80e1-b901249dc59c', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'kissedfrog', 478, 'Kissed Frog', 'https://api.changes.tg/original/Kissed%20Frog.png?size=256', 'rare', '#111a2e', 4, 43860000000, 0, '2026-07-30 16:59:22.674427+00', '', 'Kissed Frog', ''),
  ('27d14dd7-53eb-43bb-a43d-18b6483642f6', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'sharptongue', 320, 'Sharp Tongue', 'https://api.changes.tg/original/Sharp%20Tongue.png?size=256', 'rare', '#e8b730', 5, 36650000000, 0, '2026-07-30 16:59:22.674489+00', '', 'Sharp Tongue', '');

INSERT INTO case_loot_entries (
  id, case_id, prize_type, collection_slug, weight, display_name, image_url,
  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,
  created_at, model_name, collection_name, backdrop
) VALUES
  ('21e50a9a-4796-4254-a809-ff78e8b8f919', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'rarebird', 433, 'Rare Bird', 'https://api.changes.tg/original/Rare%20Bird.png?size=256', 'rare', '#e8b730', 6, 21260000000, 0, '2026-07-30 16:59:22.674528+00', '', 'Rare Bird', ''),
  ('4f199132-27d4-4ae5-a9d8-574718e1c845', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'khabibspapakha', 542, 'Khabib''s Papakha', 'https://api.changes.tg/original/Khabib''s%20Papakha.png?size=256', 'rare', '#111a2e', 7, 21250000000, 0, '2026-07-30 16:59:22.674568+00', '', 'Khabib''s Papakha', ''),
  ('1ff13290-5851-4413-85c7-e8ab7cce7732', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'recordplayer', 1078, 'Record Player', 'https://api.changes.tg/original/Record%20Player.png?size=256', 'rare', '#111a2e', 8, 10400000000, 0, '2026-07-30 16:59:22.674605+00', '', 'Record Player', ''),
  ('23186bb2-9705-488c-9906-3f288d6c10ca', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'jinglebells', 1528, 'Jingle Bells', 'https://api.changes.tg/original/Jingle%20Bells.png?size=256', 'rare', '#e8b730', 9, 6330000000, 0, '2026-07-30 16:59:22.674641+00', '', 'Jingle Bells', ''),
  ('fa65ec44-5617-498a-b312-5d0a08cf6a90', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'moonpendant', 913, 'Moon Pendant', 'https://api.changes.tg/original/Moon%20Pendant.png?size=256', 'uncommon', '#e8b730', 10, 5100000000, 0, '2026-07-30 16:59:22.674677+00', '', 'Moon Pendant', ''),
  ('bb9c4d15-0777-40b0-8ebb-9dc3d9a8c12c', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'faithamulet', 100, 'Faith Amulet', 'https://api.changes.tg/original/Faith%20Amulet.png?size=256', 'uncommon', '#111a2e', 11, 4260000000, 0, '2026-07-30 16:59:22.674709+00', '', 'Faith Amulet', ''),
  ('153d4f3c-5ae6-40e4-9a92-ad7442bd4000', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'restlessjar', 870, 'Restless Jar', 'https://api.changes.tg/original/Restless%20Jar.png?size=256', 'uncommon', '#111a2e', 12, 4150000000, 0, '2026-07-30 16:59:22.674744+00', '', 'Restless Jar', ''),
  ('1acb6566-6e34-441a-8484-8077c8709cbc', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'prettyposy', 830, 'Pretty Posy', 'https://api.changes.tg/original/Pretty%20Posy.png?size=256', 'uncommon', '#e8b730', 13, 4180000000, 0, '2026-07-30 16:59:22.674783+00', '', 'Pretty Posy', ''),
  ('b8b62abb-49cd-4dd3-a0ad-af39fa1c52bf', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'deskcalendar', 788, 'Desk Calendar', 'https://api.changes.tg/original/Desk%20Calendar.png?size=256', 'uncommon', '#e8b730', 14, 4100000000, 0, '2026-07-30 16:59:22.67482+00', '', 'Desk Calendar', ''),
  ('bbef3553-0a5d-4117-ac9a-b7042621738e', '8223eb45-8c68-448e-8f60-d0399e54674b', 'gift', 'moneypot', 208, 'Money Pot', 'https://api.changes.tg/original/Money%20Pot.png?size=256', 'uncommon', '#111a2e', 15, 4000000000, 0, '2026-07-30 16:59:22.674885+00', '', 'Money Pot', ''),
  ('f98b81fb-b037-479b-8e88-b1f6deb14016', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'artisanbrick', 0, 'Artisan Brick', 'https://api.changes.tg/original/Artisan%20Brick.png?size=256', '', '#ff8e72', 0, 48000000000, 0, '2026-08-03 12:14:19.669359+00', '', 'Artisan Brick', ''),
  ('b9316d2d-7169-4d9d-bbce-96284437f035', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'bondedring', 0, 'Bonded Ring', 'https://api.changes.tg/original/Bonded%20Ring.png?size=256', '', '#ffb7b2', 1, 35700000000, 0, '2026-08-03 12:14:19.669932+00', '', 'Bonded Ring', ''),
  ('6f040e59-1899-462a-a3ba-00d0adf4ad85', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'blingbinky', 0, 'Bling Binky', 'https://api.changes.tg/original/Bling%20Binky.png?size=256', '', '#ffb7b2', 2, 21100000000, 0, '2026-08-03 12:14:19.670144+00', '', 'Bling Binky', ''),
  ('462d8f9b-7eee-4ce1-9637-0920b7def2a2', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'hangingstar', 0, 'Hanging Star', 'https://api.changes.tg/original/Hanging%20Star.png?size=256', '', '#ff8e72', 3, 6800000000, 0, '2026-08-03 12:14:19.670331+00', '', 'Hanging Star', ''),
  ('798be5c6-b76e-4201-bd3f-e6fc78556e90', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'cloverpin', 0, 'Clover Pin', 'https://api.changes.tg/original/Clover%20Pin.png?size=256', '', '#ff8e72', 4, 4000000000, 0, '2026-08-03 12:14:19.670481+00', '', 'Clover Pin', ''),
  ('cc32cd34-263c-476a-87b2-004822f55895', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'cookieheart', 0, 'Cookie Heart', 'https://api.changes.tg/original/Cookie%20Heart.png?size=256', '', '#ffb7b2', 5, 4000000000, 0, '2026-08-03 12:14:19.670575+00', '', 'Cookie Heart', ''),
  ('a4cefa78-7216-4488-b3cb-923c528d1c3d', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'freshsocks', 0, 'Fresh Socks', 'https://api.changes.tg/original/Fresh%20Socks.png?size=256', '', '#ffb7b2', 6, 3500000000, 0, '2026-08-03 12:14:19.670718+00', '', 'Fresh Socks', ''),
  ('b16dacd8-e0df-4669-8840-b1931257119e', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'easteregg', 0, 'Easter Egg', 'https://api.changes.tg/original/Easter%20Egg.png?size=256', '', '#ff8e72', 7, 3080000000, 0, '2026-08-03 12:14:19.670837+00', '', 'Easter Egg', ''),
  ('ec638c46-304d-4cb8-89be-21ed06a121af', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'icecream', 0, 'Ice Cream', 'https://api.changes.tg/original/Ice%20Cream.png?size=256', '', '#ff8e72', 8, 3000000000, 0, '2026-08-03 12:14:19.670985+00', '', 'Ice Cream', ''),
  ('fbffdcd0-64aa-4102-9e00-dcd1dd9c3b02', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'gift', 'poolfloat', 0, 'Pool Float', 'https://api.changes.tg/original/Pool%20Float.png?size=256', '', '#ffb7b2', 9, 3010000000, 0, '2026-08-03 12:14:19.671113+00', '', 'Pool Float', ''),
  ('b806446b-8980-4098-8fcb-1e0f9d8d1480', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 0, 'TON', '', '', '#ffb7b2', 10, 1000000000, 1000000000, '2026-08-03 12:14:19.671249+00', '', '', ''),
  ('45a2ddd2-47ba-4393-baa6-967cf9f2d520', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 0, 'TON', '', '', '#ff8e72', 11, 500000000, 500000000, '2026-08-03 12:14:19.671404+00', '', '', ''),
  ('476f86ba-a27f-4cb0-b415-a37173a04e77', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 0, 'TON', '', '', '#ff8e72', 12, 250000000, 250000000, '2026-08-03 12:14:19.671462+00', '', '', ''),
  ('d5c25291-86b0-4a8c-9c4c-be721aa1f64f', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 10, 'TON', '', '', '#ffb7b2', 13, 150000000, 150000000, '2026-08-03 12:14:19.671526+00', '', '', ''),
  ('8a8719db-82f2-4d42-982e-c22e7aadec05', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 2000, 'TON', '', '', '#ffb7b2', 14, 100000000, 100000000, '2026-08-03 12:14:19.671581+00', '', '', ''),
  ('632ac24f-76a4-4ba7-9b03-b31e30bfb481', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 'ton', '', 7990, 'TON', '', '', '#ff8e72', 15, 50000000, 50000000, '2026-08-03 12:14:19.671632+00', '', '', ''),
  ('ee593086-851e-45c2-a269-a13a0f177f71', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'nekohelmet', 59, 'Neko Helmet', 'https://api.changes.tg/original/Neko%20Helmet.png?size=256', 'legendary', '#151616', 0, 200000000000, 0, '2026-07-30 16:57:38.509982+00', '', 'Neko Helmet', 'Black'),
  ('63482fc2-2018-43b9-adcb-2a775f5cfdd3', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'diamondring', 123, 'Diamond Ring', 'https://api.changes.tg/original/Diamond%20Ring.png?size=256', 'legendary', '#151616', 1, 120000000000, 0, '2026-07-30 16:57:38.510149+00', '', 'Diamond Ring', 'Black'),
  ('829497ee-2944-437d-a9d9-25d36747e04a', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'evileye', 150, 'Evil Eye', 'https://api.changes.tg/original/Evil%20Eye.png?size=256', 'epic', '#151616', 2, 50000000000, 0, '2026-07-30 16:57:38.510218+00', '', 'Evil Eye', 'Black'),
  ('48788386-39ab-46d3-9a71-cc8201fd77b5', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'inputkey', 301, 'Input Key', 'https://api.changes.tg/original/Input%20Key.png?size=256', 'epic', '#151616', 3, 47000000000, 0, '2026-07-30 16:57:38.510299+00', '', 'Input Key', 'Black'),
  ('48c00bec-8bd3-46f9-9bc0-be19e24b7956', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'deskcalendar', 298, 'Desk Calendar', 'https://api.changes.tg/original/Desk%20Calendar.png?size=256', 'epic', '#151616', 4, 45000000000, 0, '2026-07-30 16:57:38.510344+00', '', 'Desk Calendar', 'Black'),
  ('cbd42612-98bd-462a-8ae5-f939180628ea', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'lightsword', 402, 'Light Sword', 'https://api.changes.tg/original/Light%20Sword.png?size=256', 'epic', '#151616', 5, 40000000000, 0, '2026-07-30 16:57:38.510391+00', '', 'Light Sword', 'Black'),
  ('ce31f069-1ea6-4d12-8800-c91e4cc7ee81', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'berrybox', 405, 'Berry Box', 'https://api.changes.tg/original/Berry%20Box.png?size=256', 'epic', '#151616', 6, 35000000000, 0, '2026-07-30 16:57:38.510522+00', '', 'Berry Box', 'Black'),
  ('6cb4105f-e358-4141-8014-a2f462dd9bd1', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'snoopdogg', 412, 'Snoop Dogg', 'https://api.changes.tg/original/Snoop%20Dogg.png?size=256', 'epic', '#151616', 7, 28000000000, 0, '2026-07-30 16:57:38.510652+00', '', 'Snoop Dogg', 'Black'),
  ('3d5c8178-3241-490b-8240-1d74fdc39f0d', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'gift', 'icecream', 1047, 'Ice Cream', 'https://api.changes.tg/original/Ice%20Cream.png?size=256', 'epic', '#151616', 8, 20000000000, 0, '2026-07-30 16:57:38.51074+00', '', 'Ice Cream', 'Black'),
  ('0b2a14ad-8497-4839-b94f-c00b7a978535', 'e6ec0b80-79fe-4dc7-a3ae-753f0c7fbe79', 'ton', '', 6803, 'TON', '', 'uncommon', '#151616', 9, 10000000000, 10000000000, '2026-07-30 16:57:38.510795+00', '', '', ''),
  ('8fd2dfd8-a5d9-40d8-a8b3-8dc9f62bc630', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'astralshard', 0, 'Astral Shard', 'https://api.changes.tg/original/Astral%20Shard.png?size=256', '', '#a0c4ff', 0, 120000000000, 0, '2026-08-03 03:32:59.380439+00', '', 'Astral Shard', ''),
  ('3e99b54a-66ea-4167-94c6-be458cdf4f5b', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'gemsignet', 0, 'Gem Signet', 'https://api.changes.tg/original/Gem%20Signet.png?size=256', '', '#111a2e', 1, 52430000000, 0, '2026-08-03 03:32:59.380715+00', '', 'Gem Signet', ''),
  ('5f327a44-f7de-4df2-9f49-170e96202d8c', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'bondedring', 0, 'Bonded Ring', 'https://api.changes.tg/original/Bonded%20Ring.png?size=256', '', '#1a2642', 2, 35000000000, 0, '2026-08-03 03:32:59.380823+00', '', 'Bonded Ring', ''),
  ('12276d11-3701-4c62-98bf-cd2ff51f6624', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'diamondring', 0, 'Diamond Ring', 'https://api.changes.tg/original/Diamond%20Ring.png?size=256', '', '#a0c4ff', 3, 25910000000, 0, '2026-08-03 03:32:59.380882+00', '', 'Diamond Ring', '');

INSERT INTO case_loot_entries (
  id, case_id, prize_type, collection_slug, weight, display_name, image_url,
  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,
  created_at, model_name, collection_name, backdrop
) VALUES
  ('01a98ac5-460f-4a7c-9297-40d625dcbb7f', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'eternalrose', 0, 'Eternal Rose', 'https://api.changes.tg/original/Eternal%20Rose.png?size=256', '', '#a0c4ff', 4, 21420000000, 0, '2026-08-03 03:32:59.380934+00', '', 'Eternal Rose', ''),
  ('beefd28b-4c4b-407e-b5ac-59671dc60469', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'lovepotion', 100, 'Love Potion', 'https://api.changes.tg/original/Love%20Potion.png?size=256', '', '#111a2e', 5, 12060000000, 0, '2026-08-03 03:32:59.381004+00', '', 'Love Potion', ''),
  ('566fb960-7279-43c7-af78-17d278c4fee6', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'evileye', 303, 'Evil Eye', 'https://api.changes.tg/original/Evil%20Eye.png?size=256', '', '#111a2e', 6, 6420000000, 0, '2026-08-03 03:32:59.381063+00', '', 'Evil Eye', ''),
  ('3f46896b-3ed8-46a8-b39e-54a2f821398c', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'surgeboard', 1022, 'Surge Board', 'https://api.changes.tg/original/Surge%20Board.png?size=256', '', '#a0c4ff', 7, 5900000000, 0, '2026-08-03 03:32:59.381108+00', '', 'Surge Board', ''),
  ('2a9ae867-737a-4d71-b98f-d7387852db1e', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'stellarrocket', 1114, 'Stellar Rocket', 'https://api.changes.tg/original/Stellar%20Rocket.png?size=256', '', '#a0c4ff', 8, 4030000000, 0, '2026-08-03 03:32:59.381154+00', '', 'Stellar Rocket', ''),
  ('b7a3140c-80cd-451a-81b7-4d2283d6ddfa', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'cloverpin', 1223, 'Clover Pin', 'https://api.changes.tg/original/Clover%20Pin.png?size=256', '', '#111a2e', 9, 3990000000, 0, '2026-08-03 03:32:59.381218+00', '', 'Clover Pin', ''),
  ('6a229065-362a-46d0-bd31-bfefa64cd29f', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'happybrownie', 1355, 'Happy Brownie', 'https://api.changes.tg/original/Happy%20Brownie.png?size=256', '', '#111a2e', 10, 3410000000, 0, '2026-08-03 03:32:59.381265+00', '', 'Happy Brownie', ''),
  ('b7e5fe7a-374b-4a83-929a-973303630d7c', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'moodpack', 1496, 'Mood Pack', 'https://api.changes.tg/original/Mood%20Pack.png?size=256', '', '#a0c4ff', 11, 3280000000, 0, '2026-08-03 03:32:59.381309+00', '', 'Mood Pack', ''),
  ('24c8cba9-645e-41b9-a0ee-1e87469c633a', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'easteregg', 1629, 'Easter Egg', 'https://api.changes.tg/original/Easter%20Egg.png?size=256', '', '#a0c4ff', 12, 3070000000, 0, '2026-08-03 03:32:59.381351+00', '', 'Easter Egg', ''),
  ('565f4d0b-b109-42ed-a233-9b25d229cb59', 'ff435c45-c1e6-4693-8145-a303c217e735', 'gift', 'snakebox', 1758, 'Snake Box', 'https://api.changes.tg/original/Snake%20Box.png?size=256', '', '#111a2e', 13, 2890000000, 0, '2026-08-03 03:32:59.381399+00', '', 'Snake Box', '');

-- case_live_feed_settings
INSERT INTO case_live_feed_settings (
  id, enabled, intensity, fill_when_sparse, min_visible,
  common_weight, uncommon_weight, rare_weight, epic_weight, legendary_weight,
  fat_chance, fat_min_floor_nanoton, updated_at,
  common_max_nanoton, uncommon_max_nanoton, rare_max_nanoton, epic_max_nanoton
) VALUES (
  1, TRUE, 0.5, TRUE, 6,
  90.000, 5.000, 32.000, 2.000, 1.000,
  0.1000, 2000000000, '2026-08-02 20:10:37.501952+00',
  500000000, 1500000000, 3000000000, 5000000000
)
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled, intensity = EXCLUDED.intensity, fill_when_sparse = EXCLUDED.fill_when_sparse,
  min_visible = EXCLUDED.min_visible, common_weight = EXCLUDED.common_weight, uncommon_weight = EXCLUDED.uncommon_weight,
  rare_weight = EXCLUDED.rare_weight, epic_weight = EXCLUDED.epic_weight, legendary_weight = EXCLUDED.legendary_weight,
  fat_chance = EXCLUDED.fat_chance, fat_min_floor_nanoton = EXCLUDED.fat_min_floor_nanoton, updated_at = EXCLUDED.updated_at,
  common_max_nanoton = EXCLUDED.common_max_nanoton, uncommon_max_nanoton = EXCLUDED.uncommon_max_nanoton,
  rare_max_nanoton = EXCLUDED.rare_max_nanoton, epic_max_nanoton = EXCLUDED.epic_max_nanoton;

-- case_promo_codes (11; used_count reset for local)
INSERT INTO case_promo_codes (code, case_id, max_uses, used_count, active, expires_at, created_at) VALUES
  ('PEPELOVE', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 5, 0, TRUE, NULL, '2026-07-29 10:17:39.748469+00'),
  ('123123', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 100, 0, TRUE, NULL, '2026-07-29 18:12:53.722768+00'),
  ('OLOFCASE', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 2, 0, TRUE, NULL, '2026-07-31 08:38:18.091176+00'),
  ('FREECASE', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-07-31 08:41:40.133696+00'),
  ('FREE', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-08-02 13:15:23.03843+00'),
  ('FREEARTISAN', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-08-03 12:22:35.185359+00'),
  ('FREEARTISAN1', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-08-04 11:28:28.644155+00'),
  ('FREEARTISAN2', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-08-05 08:14:07.176945+00'),
  ('FREERING', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 50, 0, TRUE, NULL, '2026-08-06 10:40:20.900175+00'),
  ('FREERING1', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 40, 0, TRUE, NULL, '2026-08-07 18:22:56.917028+00'),
  ('FREERING2', 'a60c3cd9-addc-4781-abb6-cc9b12531d41', 40, 0, TRUE, NULL, '2026-08-08 16:12:42.036786+00');

-- Point daily quest free-case rewards at prod starter (Redo), if quests table exists.
DO $$ BEGIN
  IF to_regclass('public.daily_quests') IS NOT NULL THEN
    UPDATE daily_quests SET reward_case_id = '53064528-2347-4538-acdf-769866bcf84b'
    WHERE reward_type = 'free_case_open' AND reward_case_id IS NOT NULL;
  END IF;
  IF to_regclass('public.daily_quest_board_settings') IS NOT NULL THEN
    UPDATE daily_quest_board_settings SET bonus_reward_case_id = '53064528-2347-4538-acdf-769866bcf84b'
    WHERE bonus_reward_type = 'free_case_open';
  END IF;
END $$;

COMMIT;
