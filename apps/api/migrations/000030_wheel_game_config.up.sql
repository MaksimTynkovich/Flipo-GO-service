INSERT INTO game_configs (game_type, enabled, min_bet_nanoton, max_bet_nanoton, max_payout_nanoton, house_edge_bps, rtp_bps, platform_fee_bps)
VALUES ('wheel', TRUE, 0, 0, 0, 0, 10000, 0)
ON CONFLICT (game_type) DO NOTHING;
