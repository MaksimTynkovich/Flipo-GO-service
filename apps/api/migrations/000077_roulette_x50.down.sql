UPDATE game_configs
SET
  max_payout_nanoton = 700000000000,
  house_edge_bps = 667,
  rtp_bps = 9333,
  updated_at = NOW()
WHERE game_type = 'roulette';
