export type PvpGift = {
  id: string;
  name: string;
  image_url: string;
  collection_slug?: string;
  value_nanoton?: number;
};

export type PvpPlayer = {
  user_id: string;
  first_name: string;
  username: string;
  photo_url?: string;
  stake_nanoton?: number;
  balance_nanoton?: number;
  win_chance_bps?: number;
  funding_type?: "balance" | "gift" | "combined" | string;
  gift?: PvpGift;
  gifts?: PvpGift[];
  is_winner?: boolean;
};

export function pvpPlayerGifts(player: PvpPlayer): PvpGift[] {
  if (player.gifts && player.gifts.length > 0) return player.gifts;
  if (player.gift) return [player.gift];
  return [];
}

export type PvpRoom = {
  id: string;
  creator_id: string;
  bet_amount_nanoton: number;
  stake_tolerance_bps?: number;
  max_players: number;
  status: "open" | "countdown" | "spinning" | "finished" | "cancelled";
  player_count: number;
  players: PvpPlayer[];
  winner_id?: string;
  payout_nanoton?: number;
  spin_at?: string;
  spin_ends_at?: string;
  finished_at?: string;
  created_at: string;
  game_round_id?: string;
  server_seed_hash?: string;
};

export type PvpLobbyState = {
  active: PvpRoom[];
  history: PvpRoom[];
};

export function pvpPlayerName(player: PvpPlayer): string {
  return player.first_name || player.username || "Игрок";
}

export function pvpWinner(room: PvpRoom): PvpPlayer | undefined {
  if (!room.winner_id) return undefined;
  return room.players.find((player) => player.user_id === room.winner_id);
}

export const PVP_COUNTDOWN_MS = 3000;
export const PVP_SPIN_MS = 14000;
