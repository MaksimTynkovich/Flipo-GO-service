export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
export const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";

export type User = {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  photo_url?: string;
  betting_balance: number;
  staking_tier: "base" | "boost";
  ton_wallet?: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  image_url: string;
  collection_slug: string;
  floor_price_nanoton: number;
  status: string;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("flipo_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export async function authTelegram(initData: string) {
  return api<{ token: string; user: User }>("/api/v1/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

export async function authDebug() {
  return api<{ token: string; user: User }>("/api/v1/auth/debug", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getMe() {
  return api<User>("/api/v1/me");
}

export async function updateWallet(wallet: string) {
  return api<{ wallet: string }>("/api/v1/me/wallet", {
    method: "PATCH",
    body: JSON.stringify({ wallet }),
  });
}

export async function getInventory() {
  return api<InventoryItem[]>("/api/v1/inventory");
}

export async function liquidateItem(id: string) {
  return api<{ balance: number }>(`/api/v1/inventory/${id}/liquidate`, { method: "POST" });
}

export async function depositGift(txRef: string) {
  return api<InventoryItem>("/api/v1/inventory/deposit", {
    method: "POST",
    body: JSON.stringify({ tx_ref: txRef }),
  });
}

export async function placeRouletteBet(color: string, amount: number, key: string) {
  return api("/api/v1/games/roulette/bet", {
    method: "POST",
    body: JSON.stringify({ color, amount_nanoton: amount, idempotency_key: key }),
  });
}

export async function getRouletteState() {
  return api("/api/v1/games/roulette/current");
}

export type RouletteHistoryEntry = {
  round_number: number;
  number: number;
  color: string;
};

export async function getRouletteHistory() {
  return api<RouletteHistoryEntry[]>("/api/v1/games/roulette/history");
}

export async function placeCrashBet(amount: number, key: string) {
  return api("/api/v1/games/crash/bet", {
    method: "POST",
    body: JSON.stringify({ amount_nanoton: amount, idempotency_key: key }),
  });
}

export async function getCrashState() {
  return api("/api/v1/games/crash/current");
}

export type CrashHistoryEntry = {
  round_number: number;
  crash_point: number;
};

export async function getCrashHistory() {
  return api<CrashHistoryEntry[]>("/api/v1/games/crash/history");
}

export type CrashActiveBet = {
  id: string;
  round_id: string;
  amount_nanoton: number;
  status: string;
};

export async function getCrashActiveBet() {
  return api<CrashActiveBet | null>("/api/v1/games/crash/bet/active");
}

export async function cashoutCrash(betId: string, multiplier: number) {
  return api(`/api/v1/games/crash/bet/${betId}/cashout`, {
    method: "POST",
    body: JSON.stringify({ multiplier }),
  });
}

export type ProfileGift = {
  slug: string;
  name: string;
  collection_slug: string;
  image_url?: string;
  price_nanoton: number;
  daily_yield_nanoton: number;
  monthly_yield_nanoton: number;
  earned_nanoton: number;
  is_staked: boolean;
  item_id?: string;
};

export type StakingStats = {
  staked_count: number;
  total_count: number;
  earned_nanoton: number;
  active_daily_yield_nanoton: number;
  active_monthly_yield_nanoton: number;
  unlockable_monthly_nanoton: number;
  boost_wager_nanoton: number;
  boost_threshold_nanoton: number;
  monthly_rate_percent: number;
};

export type ProfileGiftsResponse = {
  gifts: ProfileGift[];
  total_daily_yield_nanoton: number;
  total_monthly_yield_nanoton: number;
  monthly_rate_percent: number;
  stats: StakingStats;
};

export async function getProfileGifts() {
  return api<ProfileGiftsResponse>("/api/v1/staking/gifts");
}

export async function getStakingPositions() {
  return api("/api/v1/staking/positions");
}

export async function stakeGift(slug: string) {
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
}

export async function stakeItem(itemId: string) {
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId }),
  });
}

export function formatTON(nanotons: number): string {
  return (nanotons / 1_000_000_000).toFixed(2);
}

export type MarketListing = {
  id: string;
  price_nanoton: number;
  source: "bot" | "user";
  status: string;
  created_at: string;
  seller: {
    id: string;
    username: string;
  };
  item: {
    id: string;
    name: string;
    sub_name: string;
    model?: string;
    symbol?: string;
    backdrop?: string;
    image_url: string;
    collection_slug: string;
    floor_price_nanoton: number;
  };
};

export async function getMarketListings() {
  return api<MarketListing[]>("/api/v1/market/listings");
}

export async function getMarketListing(id: string) {
  return api<MarketListing>(`/api/v1/market/listings/${id}`);
}

export async function getMyMarketListings() {
  return api<MarketListing[]>("/api/v1/market/listings/mine");
}

export async function createMarketListing(itemId: string, priceNanoton: number) {
  return api<MarketListing>("/api/v1/market/listings", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, price_nanoton: priceNanoton }),
  });
}

export async function cancelMarketListing(id: string) {
  return api<{ ok: boolean }>(`/api/v1/market/listings/${id}`, { method: "DELETE" });
}

export async function buyMarketListing(id: string) {
  return api<{ balance: number }>(`/api/v1/market/listings/${id}/buy`, { method: "POST" });
}
