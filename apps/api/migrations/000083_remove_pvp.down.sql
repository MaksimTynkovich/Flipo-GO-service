INSERT INTO game_configs (game_type, enabled, min_bet_nanoton, max_bet_nanoton, max_payout_nanoton, house_edge_bps, rtp_bps, platform_fee_bps)
VALUES ('pvp', TRUE, 100000000, 50000000000, 0, 500, 9500, 500)
ON CONFLICT (game_type) DO NOTHING;
