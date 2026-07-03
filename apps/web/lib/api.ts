export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
export const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";

export type User = {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
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

export async function cashoutCrash(betId: string, multiplier: number) {
  return api(`/api/v1/games/crash/bet/${betId}/cashout`, {
    method: "POST",
    body: JSON.stringify({ multiplier }),
  });
}

export async function getStakingPositions() {
  return api("/api/v1/staking/positions");
}

export async function stakeItem(itemId: string) {
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId }),
  });
}

export function formatTON(nanotons: number): string {
  return (nanotons / 1_000_000_000).toFixed(4);
}
