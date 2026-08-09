-- x50 roulette: max payout up to ×50 of max bet (50 TON × 50 = 2500 TON).
UPDATE game_configs
SET
  max_payout_nanoton = 2500000000000,
  house_edge_bps = 400,
  rtp_bps = 9600,
  updated_at = NOW()
WHERE game_type = 'roulette';
