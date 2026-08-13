import { getTelegramWebApp } from "@/src/shared/lib/twa";
import { getAnalyticsSessionId, getCurrentPath, trackErrorSurface, trackEvent } from "@/lib/analytics";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
const NGROK_API = API_URL.includes("ngrok-free.app") || API_URL.includes("ngrok.io");

/**
 * Browser game/user WS must hit the Mini App origin so Next rewrites `/ws` → API.
 * Hard-coded NEXT_PUBLIC_WS_URL (or localhost fallback) bypasses that and dies behind CF.
 */
export function resolvePublicWsUrl(): string {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  const fromEnv = (process.env.NEXT_PUBLIC_WS_URL || "").trim().replace(/\/$/, "");
  return fromEnv || "ws://localhost:8080";
}

export function resolveAsset(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("//")) return url;
  // Served via Next/Caddy rewrites on the Mini App origin.
  if (url.startsWith("/static/")) return url;
  return API_URL.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
}
export const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
export const AUTH_SESSION_REFRESHED = "flipo:auth-session-refreshed";
export const ADMIN_AUTH_SESSION_REFRESHED = "flipo:admin-auth-session-refreshed";

const TOKEN_KEY = "flipo_token";
const ADMIN_TOKEN_KEY = "flipo_admin_token";
const AUTH_PATHS = new Set([
  "/api/v1/auth/telegram",
  "/api/v1/auth/debug",
  "/api/v1/admin/auth/login",
]);

function isAuthPath(path: string): boolean {
  if (AUTH_PATHS.has(path)) return true;
  return path.startsWith("/api/v1/admin/auth/login/");
}

export class ApiRequestError extends Error {
  code?: string;
  channel?: string;

  constructor(
    message: string,
    opts?: {
      code?: string;
      channel?: string;
    },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = opts?.code;
    this.channel = opts?.channel;
  }
}

export type User = {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  photo_url?: string;
  betting_balance: number;
  staking_tier: "base" | "boost";
  ton_wallet?: string;
  is_admin?: boolean;
};

export type InventoryItem = {
  id: string;
  name: string;
  image_url: string;
  collection_slug: string;
  telegram_gift_id?: string;
  floor_price_nanoton: number;
  buyback_price_nanoton?: number;
  valuation_nanoton?: number;
  case_cashout_nanoton?: number;
  model?: string;
  symbol?: string;
  backdrop?: string;
  status: string;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname.startsWith("/admin")) {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  }
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return getToken();
}

export function getAdminAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminAuthToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminAuthToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

let reauthPromise: Promise<User | null> | null = null;

function dispatchSessionRefreshed(user: User) {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_REFRESHED, { detail: { user } }));
}

async function rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const requestId = typeof crypto !== "undefined" ? crypto.randomUUID() : "";
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    "X-Session-ID": typeof window !== "undefined" ? getAnalyticsSessionId() : "",
    "X-Client-Path": typeof window !== "undefined" ? getCurrentPath() : "",
    ...(requestId ? { "X-Request-ID": requestId } : {}),
    ...(NGROK_API ? { "ngrok-skip-browser-warning": "1" } : {}),
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  (res as Response & { requestId?: string }).requestId =
    res.headers.get("X-Request-ID") || requestId || undefined;
  return res;
}

/** Re-authenticate via Telegram initData (or debug auth) without a full page reload. */
export async function silentReauth(): Promise<User | null> {
  if (reauthPromise) return reauthPromise;

  reauthPromise = (async () => {
    try {
      clearToken();

      const initData = getTelegramWebApp()?.initData;
      if (initData) {
        const { token, user } = await authTelegram(initData);
        setToken(token);
        dispatchSessionRefreshed(user);
        return user;
      }

      if (DEBUG_AUTH) {
        const { token, user } = await authDebug();
        setToken(token);
        dispatchSessionRefreshed(user);
        return user;
      }

      return null;
    } catch {
      return null;
    } finally {
      reauthPromise = null;
    }
  })();

  return reauthPromise;
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const res = await rawFetch(path, options);

  if (res.status === 401 && !retried && !isAuthPath(path)) {
    const isAdminPath =
      path.startsWith("/api/v1/admin") ||
      (typeof window !== "undefined" && window.location.pathname.startsWith("/admin"));
    if (isAdminPath) {
      clearAdminAuthToken();
      window.dispatchEvent(new CustomEvent(ADMIN_AUTH_SESSION_REFRESHED, { detail: { user: null } }));
    } else {
      const user = await silentReauth();
      if (user) {
        return api<T>(path, options, true);
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = err.error || "Запрос не выполнен";
    const requestId =
      res.headers.get("X-Request-ID") ||
      (res as Response & { requestId?: string }).requestId ||
      undefined;
    trackErrorSurface({
      surface: "api",
      error_code:
        (typeof err.code === "string" && err.code) ||
        `${path.replace(/^\/api\/v1\//, "").replace(/\//g, "_")}_failed`,
      error_message: message,
      properties: {
        path,
        http_status: res.status,
        request_id: requestId,
        error_code: err.code,
      },
    });
    throw new ApiRequestError(message, {
      code: typeof err.code === "string" ? err.code : undefined,
      channel: typeof err.channel === "string" ? err.channel : undefined,
    });
  }
  return res.json();
}

export type AuthStartContext = {
  param?: string;
  kind?: "referral" | "campaign" | "other" | string;
  campaign_id?: string;
  campaign_code?: string;
  landing?: string;
};

export async function authTelegram(initData: string, referralCode?: string) {
  return api<{ token: string; user: User; start?: AuthStartContext }>("/api/v1/auth/telegram", {
    method: "POST",
    body: JSON.stringify({
      init_data: initData,
      referral_code: referralCode || undefined,
    }),
  });
}

export async function authDebug() {
  return api<{ token: string; user: User }>("/api/v1/auth/debug", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function authAdminPanel(password: string) {
  return api<{ status: "pending"; challenge_id: string; message?: string }>(
    "/api/v1/admin/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
  );
}

export type AdminLoginStatusResponse =
  | { status: "pending"; challenge_id: string }
  | { status: "denied"; challenge_id: string }
  | { status: "expired"; challenge_id: string }
  | { status: "approved"; challenge_id: string; token: string; user: User };

export async function getAdminPanelLoginStatus(challengeId: string) {
  return api<AdminLoginStatusResponse>(
    `/api/v1/admin/auth/login/${encodeURIComponent(challengeId)}`,
  );
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

export async function clearWallet() {
  return api<{ ok: boolean }>("/api/v1/me/wallet", {
    method: "DELETE",
  });
}

export async function getInventory() {
  return api<InventoryItem[]>("/api/v1/inventory");
}

export async function liquidateItem(id: string) {
  try {
    const result = await api<{ balance: number }>(`/api/v1/inventory/${id}/liquidate`, { method: "POST" });
    trackEvent({
      event_name: "inventory_liquidated",
      event_category: "inventory",
      status: "success",
      properties: { item_id: id, balance_after: result.balance },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "inventory_liquidated",
      event_category: "inventory",
      status: "error",
      error_code: "liquidate_failed",
      error_message: error instanceof Error ? error.message : "liquidate_failed",
      properties: { item_id: id },
    });
    throw error;
  }
}

export async function liquidateCaseClaimItem(id: string) {
  try {
    const result = await api<{ balance: number }>(`/api/v1/inventory/${id}/case-liquidate`, {
      method: "POST",
    });
    trackEvent({
      event_name: "inventory_case_claim_liquidated",
      event_category: "inventory",
      status: "success",
      properties: { item_id: id, balance_after: result.balance },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "inventory_case_claim_liquidated",
      event_category: "inventory",
      status: "error",
      error_code: "case_claim_liquidate_failed",
      error_message: error instanceof Error ? error.message : "case_claim_liquidate_failed",
      properties: { item_id: id },
    });
    throw error;
  }
}

export async function withdrawGiftItem(id: string) {
  try {
    const result = await api<{ ok: boolean; pending?: boolean; message?: string }>(
      `/api/v1/inventory/${id}/withdraw`,
      { method: "POST" },
    );
    trackEvent({
      event_name: "inventory_withdrawn",
      event_category: "inventory",
      status: "success",
      properties: { item_id: id, pending: Boolean(result.pending) },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "inventory_withdrawn",
      event_category: "inventory",
      status: "error",
      error_code: "withdraw_failed",
      error_message: error instanceof Error ? error.message : "withdraw_failed",
      properties: { item_id: id },
    });
    throw error;
  }
}

export async function depositGift(txRef: string) {
  try {
    const result = await api<InventoryItem>("/api/v1/inventory/deposit", {
      method: "POST",
      body: JSON.stringify({ tx_ref: txRef }),
    });
    trackEvent({
      event_name: "inventory_deposit_completed",
      event_category: "inventory",
      status: "success",
      properties: { tx_ref: txRef, item_id: result.id },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "inventory_deposit_completed",
      event_category: "inventory",
      status: "error",
      error_code: "deposit_failed",
      error_message: error instanceof Error ? error.message : "deposit_failed",
      properties: { tx_ref: txRef },
    });
    throw error;
  }
}

export async function placeRouletteBet(
  color: string,
  key: string,
  funding: { mode: "balance"; amountNanoton: number } | { mode: "gift"; inventoryItemId: string },
) {
  const body =
    funding.mode === "gift"
      ? { color, idempotency_key: key, funding: "gift", inventory_item_id: funding.inventoryItemId }
      : { color, idempotency_key: key, amount_nanoton: funding.amountNanoton };
  const amountNanoton = funding.mode === "gift" ? 0 : funding.amountNanoton;
  try {
    const result = await api("/api/v1/games/roulette/bet", {
      method: "POST",
      body: JSON.stringify(body),
    });
    trackEvent({
      event_name: "roulette_bet_placed",
      event_category: "gameplay",
      status: "success",
      properties: { mode: "roulette", color, amount_nanoton: amountNanoton, funding: funding.mode },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "roulette_bet_placed",
      event_category: "gameplay",
      status: "error",
      error_code: "bet_failed",
      error_message: error instanceof Error ? error.message : "bet_failed",
      properties: { mode: "roulette", color, amount_nanoton: amountNanoton, funding: funding.mode },
    });
    throw error;
  }
}

export async function getRouletteState() {
  return api("/api/v1/games/roulette/current");
}

export type RouletteHistoryEntry = {
  round_id: string;
  round_number: number;
  number: number;
  color: string;
};

export async function getRouletteHistory() {
  return api<RouletteHistoryEntry[]>("/api/v1/games/roulette/history");
}

export type BetGiftView = {
  id: string;
  name: string;
  image_url: string;
};

export type RouletteBetEntry = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  color: "blue" | "red" | "green" | "yellow" | string;
  amount_nanoton: number;
  funding_type?: "balance" | "gift" | string;
  gift?: BetGiftView;
};

export type RouletteColorTotals = {
  blue: number;
  red: number;
  green: number;
  yellow: number;
};

export type RouletteRoundBets = {
  round_id: string;
  bets: RouletteBetEntry[];
  totals: RouletteColorTotals;
  counts: RouletteColorTotals;
};

export async function getRouletteBets() {
  return api<RouletteRoundBets>("/api/v1/games/roulette/bets");
}

export type CrashBetEntry = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  amount_nanoton: number;
  funding_type?: "balance" | "gift" | string;
  gift?: BetGiftView;
  status: "pending" | "cashed_out" | "lost" | string;
  cashout_multiplier?: number;
  auto_cashout_multiplier?: number;
  payout_nanoton?: number;
};

export type CrashRoundBets = {
  round_id: string;
  bets: CrashBetEntry[];
};

export async function getCrashBets() {
  return api<CrashRoundBets>("/api/v1/games/crash/bets");
}

export async function placeCrashBet(
  key: string,
  funding: { mode: "balance"; amountNanoton: number } | { mode: "gift"; inventoryItemId: string },
  options?: { autoCashoutMultiplier?: number | null },
) {
  const auto =
    options?.autoCashoutMultiplier != null && options.autoCashoutMultiplier >= 1.01
      ? Math.floor(options.autoCashoutMultiplier * 100) / 100
      : undefined;
  const body =
    funding.mode === "gift"
      ? {
          idempotency_key: key,
          funding: "gift",
          inventory_item_id: funding.inventoryItemId,
          ...(auto != null ? { auto_cashout_multiplier: auto } : {}),
        }
      : {
          idempotency_key: key,
          amount_nanoton: funding.amountNanoton,
          ...(auto != null ? { auto_cashout_multiplier: auto } : {}),
        };
  const amountNanoton = funding.mode === "gift" ? 0 : funding.amountNanoton;
  try {
    const result = await api("/api/v1/games/crash/bet", {
      method: "POST",
      body: JSON.stringify(body),
    });
    trackEvent({
      event_name: "crash_bet_placed",
      event_category: "gameplay",
      status: "success",
      properties: {
        mode: "crash",
        amount_nanoton: amountNanoton,
        funding: funding.mode,
        auto_cashout_multiplier: auto ?? null,
      },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "crash_bet_placed",
      event_category: "gameplay",
      status: "error",
      error_code: "bet_failed",
      error_message: error instanceof Error ? error.message : "bet_failed",
      properties: { mode: "crash", amount_nanoton: amountNanoton, funding: funding.mode },
    });
    throw error;
  }
}

export async function getCrashState() {
  return api("/api/v1/games/crash/current");
}

export type CrashHistoryEntry = {
  round_id: string;
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
  funding_type?: string;
  inventory_item_id?: string;
  status: string;
  auto_cashout_multiplier?: number;
  selection?: { auto_cashout_multiplier?: number };
};

export async function getCrashActiveBets() {
  const bets = await api<CrashActiveBet[]>("/api/v1/games/crash/bet/active");
  return (bets ?? []).map((bet) => ({
    ...bet,
    auto_cashout_multiplier:
      bet.auto_cashout_multiplier ?? bet.selection?.auto_cashout_multiplier,
  }));
}

export async function cashoutCrash(betId: string, multiplier: number) {
  try {
    const result = await api(`/api/v1/games/crash/bet/${betId}/cashout`, {
      method: "POST",
      body: JSON.stringify({ multiplier }),
    });
    trackEvent({
      event_name: "crash_cashout_completed",
      event_category: "gameplay",
      status: "success",
      properties: { mode: "crash", bet_id: betId, multiplier },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "crash_cashout_completed",
      event_category: "gameplay",
      status: "error",
      error_code: "cashout_failed",
      error_message: error instanceof Error ? error.message : "cashout_failed",
      properties: { mode: "crash", bet_id: betId, multiplier },
    });
    throw error;
  }
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
  can_unstake: boolean;
  source?: "profile" | "inventory";
  item_id?: string;
};

export type StakingEpoch = {
  id: string;
  starts_at: string;
  ends_at: string;
};

export type StakingPosition = {
  id: string;
  inventory_item_id: string;
  accrued_yield_nanoton: number;
  principal_nanoton: number;
  is_active: boolean;
};

export type StakingStats = {
  staked_count: number;
  total_count: number;
  earned_nanoton: number;
  active_daily_yield_nanoton: number;
  active_monthly_yield_nanoton: number;
  unlockable_monthly_nanoton: number;
  boost_referral_count: number;
  boost_referral_target: number;
  boost_until?: string | null;
  monthly_rate_percent: number;
  tvl_nanoton?: number;
  tvl_cap_nanoton?: number;
  tvl_remaining_nanoton?: number;
  personal_limit_nanoton?: number;
  personal_used_nanoton?: number;
  referral_perk_active?: boolean;
  referral_perk_pending?: boolean;
  referral_limit_bonus_nanoton?: number;
  referral_boost_percent?: number;
  streak_current?: number;
  streak_target?: number;
  streak_bonus_active?: boolean;
  streak_bonus_days_remaining?: number;
  streak_bonus_multiplier?: number;
  staked_today?: boolean;
};

export type StakingQuestProgress = {
  code: string;
  title: string;
  description: string;
  reward_limit_nanoton: number;
  completed: boolean;
  progress_current: number;
  progress_target: number;
  progress_ratio: number;
};

export type StakingQuestsResponse = {
  quests: StakingQuestProgress[];
  personal_limit_nanoton: number;
  personal_used_nanoton: number;
  personal_remaining_nanoton: number;
  base_limit_nanoton: number;
  max_limit_nanoton: number;
  tvl_nanoton: number;
  tvl_cap_nanoton: number;
  tvl_remaining_nanoton: number;
};

export type ProfileGiftsResponse = {
  gifts: ProfileGift[];
  epoch: StakingEpoch;
  total_daily_yield_nanoton: number;
  total_monthly_yield_nanoton: number;
  monthly_rate_percent: number;
  stats: StakingStats;
  channel_subscribed?: boolean;
  required_channel?: string;
};

export async function getProfileGifts() {
  return api<ProfileGiftsResponse>("/api/v1/staking/gifts");
}

export async function getStakingQuests() {
  return api<StakingQuestsResponse>("/api/v1/staking/quests");
}

export async function getStakingPositions() {
  return api<StakingPosition[]>("/api/v1/staking/positions");
}

export async function unstakeGift(positionId: string) {
  return api<{ ok: boolean }>(`/api/v1/staking/unstake/${positionId}`, { method: "POST" });
}

export async function stakeGift(opts: { slug?: string; itemId?: string }) {
  const body = opts.itemId ? { item_id: opts.itemId } : { slug: opts.slug };
  try {
    const result = await api("/api/v1/staking/stake", {
      method: "POST",
      body: JSON.stringify(body),
    });
    trackEvent({
      event_name: "staking_started",
      event_category: "staking",
      status: "success",
      properties: { item_id: opts.itemId, slug: opts.slug },
    });
    return result;
  } catch (error) {
    const apiErr = error instanceof ApiRequestError ? error : null;
    trackEvent({
      event_name: "staking_started",
      event_category: "staking",
      status: "error",
      error_code: apiErr?.code || "stake_failed",
      error_message: error instanceof Error ? error.message : "stake_failed",
      properties: { item_id: opts.itemId, slug: opts.slug },
    });
    throw error;
  }
}

export async function stakeItem(itemId: string) {
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId }),
  });
}

export function formatTON(nanotons: number): string {
  const ton = nanotons / 1_000_000_000;
  // 2 decimals by default; keep a third digit for sub-cent prizes (e.g. 0.005).
  const fixed3 = ton.toFixed(3);
  if (fixed3.endsWith("0")) return ton.toFixed(2);
  return fixed3;
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

export async function getMarketListings(params?: {
  limit?: number;
  offset?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<MarketListing[]>(`/api/v1/market/listings${qs ? `?${qs}` : ""}`);
}

export async function getMarketListing(id: string) {
  return api<MarketListing>(`/api/v1/market/listings/${id}`);
}

export async function getMyMarketListings() {
  return api<MarketListing[]>("/api/v1/market/listings/mine");
}

export async function createMarketListing(itemId: string, priceNanoton: number) {
  try {
    const result = await api<MarketListing>("/api/v1/market/listings", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, price_nanoton: priceNanoton }),
    });
    trackEvent({
      event_name: "market_listing_created",
      event_category: "market",
      status: "success",
      properties: { item_id: itemId, price_nanoton: priceNanoton, listing_id: result.id },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "market_listing_created",
      event_category: "market",
      status: "error",
      error_code: "create_failed",
      error_message: error instanceof Error ? error.message : "create_failed",
      properties: { item_id: itemId, price_nanoton: priceNanoton },
    });
    throw error;
  }
}

export async function cancelMarketListing(id: string) {
  try {
    const result = await api<{ ok: boolean }>(`/api/v1/market/listings/${id}`, { method: "DELETE" });
    trackEvent({
      event_name: "market_listing_cancelled",
      event_category: "market",
      status: "success",
      properties: { listing_id: id },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "market_listing_cancelled",
      event_category: "market",
      status: "error",
      error_code: "cancel_failed",
      error_message: error instanceof Error ? error.message : "cancel_failed",
      properties: { listing_id: id },
    });
    throw error;
  }
}

export async function buyMarketListing(id: string) {
  try {
    const result = await api<{
      balance: number;
    }>(`/api/v1/market/listings/${id}/buy`, {
      method: "POST",
    });
    trackEvent({
      event_name: "market_purchase_completed",
      event_category: "market",
      status: "success",
      properties: { listing_id: id },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "market_purchase_completed",
      event_category: "market",
      status: "error",
      error_code: "purchase_failed",
      error_message: error instanceof Error ? error.message : "purchase_failed",
      properties: { listing_id: id },
    });
    throw error;
  }
}

export type ReferralStats = {
  referral_count: number;
  active_referral_count: number;
  qualified_referral_count: number;
  total_earned_nanoton: number;
  staking_earned_nanoton: number;
  ggr_earned_nanoton: number;
  milestone_earned_nanoton: number;
  share_percent: number;
  ggr_share_percent: number;
  share_percent_weekly: number;
  example_weekly_per_referral_ton: string;
  milestone_amount_nanoton: number;
  invitee_boost_percent: number;
  invitee_limit_bonus_ton: string;
};

export async function getReferralStats() {
  return api<ReferralStats>("/api/v1/referrals/stats");
}

export type ReferralInviteeStatus = {
  has_referrer: boolean;
  perks_active: boolean;
  perks_pending: boolean;
  staking_boost_percent: number;
  stake_limit_bonus_nanoton: number;
  expires_at?: string;
};

export async function getReferralInviteeStatus() {
  return api<ReferralInviteeStatus>("/api/v1/referrals/invitee");
}

export async function prepareReferralShare() {
  return api<{
    prepared_message_id: string;
    result_id: string;
    expiration_date?: number;
  }>("/api/v1/referrals/share/prepare", {
    method: "POST",
    body: "{}",
  });
}

export async function reportReferralShare(action: "copy" | "share") {
  return api<{ ok: boolean }>("/api/v1/referrals/share-event", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export type AdminYieldSettings = {
  id: number;
  referral_share_percent: number;
  referral_ggr_share_percent: number;
  referral_milestone_nanoton: number;
  referral_milestone_monthly_cap: number;
  referral_monthly_payout_cap_nanoton: number;
  staking_personal_limit_nanoton?: number;
  staking_base_monthly_percent: number;
  staking_boost_monthly_percent: number;
  staking_tvl_cap_nanoton?: number;
};

export type WalletDepositIntent = {
  id: string;
  to_address: string;
  amount_nanoton: number;
  comment: string;
  expires_at: string;
};

export type WalletTransfer = {
  id: string;
  direction: "deposit" | "withdraw";
  status: string;
  amount_nanoton: number;
  fee_nanoton: number;
  net_nanoton: number;
  wallet_address: string;
  tx_hash?: string;
  error_message?: string;
  risk_score?: number;
  risk_flags?: string[];
  review_reason?: string;
  created_at: string;
  confirmed_at?: string;
};

export async function createWalletDepositIntent(amountNanoton: number) {
  try {
    const result = await api<WalletDepositIntent>("/api/v1/wallet/deposit/intent", {
      method: "POST",
      body: JSON.stringify({ amount_nanoton: amountNanoton }),
    });
    trackEvent({
      event_name: "deposit_intent_created",
      event_category: "wallet",
      status: "success",
      properties: { amount_nanoton: amountNanoton, transfer_id: result.id },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "deposit_intent_created",
      event_category: "wallet",
      status: "error",
      error_code: "deposit_intent_failed",
      error_message: error instanceof Error ? error.message : "deposit_intent_failed",
      properties: { amount_nanoton: amountNanoton },
    });
    throw error;
  }
}

export async function confirmWalletDeposit(transferId: string, txHash?: string) {
  try {
    const result = await api<{ transfer: WalletTransfer; balance: number }>(
      `/api/v1/wallet/deposit/${transferId}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ tx_hash: txHash || "" }),
      },
    );
    trackEvent({
      event_name: "deposit_confirmed",
      event_category: "wallet",
      status: "success",
      properties: { transfer_id: transferId, status: result.transfer.status },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "deposit_confirmed",
      event_category: "wallet",
      status: "error",
      error_code: "deposit_confirm_failed",
      error_message: error instanceof Error ? error.message : "deposit_confirm_failed",
      properties: { transfer_id: transferId },
    });
    throw error;
  }
}

export type PaymentFeatures = {
  cryptobot_enabled: boolean;
  stars_enabled: boolean;
  min_deposit_nanoton: number;
  stars_usd_rate: number;
  ton_usd_rate?: number;
};

export type PaymentIntent = {
  id: string;
  provider: "cryptobot" | "stars" | string;
  status: string;
  amount_nanoton: number;
  provider_amount: string;
  provider_currency: string;
  pay_url?: string;
  stars_count?: number;
  ton_usd_rate?: string;
  stars_usd_rate?: string;
  expires_at?: string;
};

export type StarsQuote = {
  amount_nanoton: number;
  stars_count: number;
  ton_usd_rate: number;
  stars_usd_rate: number;
  usd_value: number;
};

export async function getPaymentFeatures() {
  return api<PaymentFeatures>("/api/v1/payments/features");
}

export async function quoteStarsDeposit(opts: { amountNanoton?: number; starsCount?: number }) {
  const body: { amount_nanoton?: number; stars_count?: number } = {};
  if (opts.starsCount != null && opts.starsCount > 0) body.stars_count = opts.starsCount;
  if (opts.amountNanoton != null && opts.amountNanoton > 0) body.amount_nanoton = opts.amountNanoton;
  return api<StarsQuote>("/api/v1/payments/stars/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createCryptoBotDeposit(amountNanoton: number) {
  return api<PaymentIntent>("/api/v1/payments/cryptobot/intent", {
    method: "POST",
    body: JSON.stringify({ amount_nanoton: amountNanoton }),
  });
}

export async function createStarsDeposit(opts: { amountNanoton?: number; starsCount?: number }) {
  const body: { amount_nanoton?: number; stars_count?: number } = {};
  if (opts.starsCount != null && opts.starsCount > 0) body.stars_count = opts.starsCount;
  if (opts.amountNanoton != null && opts.amountNanoton > 0) body.amount_nanoton = opts.amountNanoton;
  return api<PaymentIntent>("/api/v1/payments/stars/intent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPaymentIntent(id: string) {
  return api<PaymentIntent>(`/api/v1/payments/intents/${encodeURIComponent(id)}`);
}

export async function requestWalletWithdraw(amountNanoton: number, idempotencyKey: string) {
  try {
    const result = await api<{ transfer: WalletTransfer; balance: number }>("/api/v1/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({
        amount_nanoton: amountNanoton,
        idempotency_key: idempotencyKey,
      }),
    });
    trackEvent({
      event_name: "withdraw_requested",
      event_category: "wallet",
      status: "success",
      properties: { amount_nanoton: amountNanoton, transfer_id: result.transfer.id, transfer_status: result.transfer.status },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "withdraw_requested",
      event_category: "wallet",
      status: "error",
      error_code: "withdraw_failed",
      error_message: error instanceof Error ? error.message : "withdraw_failed",
      properties: { amount_nanoton: amountNanoton },
    });
    throw error;
  }
}

// --- Admin API ---

export type AdminRevenueSummary = {
  net_revenue_nanoton: number;
  deposits_nanoton: number;
  withdrawals_nanoton: number;
  gift_withdrawals_nanoton: number;
  pending_liability_nanoton: number;
  pending_gift_liability_nanoton: number;
  withdrawal_fees_nanoton: number;
  market_fees_nanoton: number;
  pvp_fees_nanoton: number;
  game_bets_nanoton: number;
  game_wins_nanoton: number;
  referral_expense_nanoton: number;
  staking_expense_nanoton: number;
  hot_wallet_exposure_nanoton: number;
  active_users_24h: number;
  ggr_nanoton: number;
  ngr_nanoton: number;
};

export type AdminRevenuePoint = {
  period: string;
  revenue_nanoton: number;
  deposits_nanoton: number;
  withdrawals_nanoton: number;
  gift_withdrawals_nanoton: number;
  game_bets_nanoton: number;
};

export type AdminGameStat = {
  game_type: string;
  rounds: number;
  bet_volume_nanoton: number;
  payout_nanoton: number;
  ggr_nanoton: number;
  theoretical_rtp_bps: number;
  actual_rtp_bps: number;
};

export type AdminRiskUser = {
  user_id: string;
  username: string;
  first_name: string;
  withdrawal_volume_nanoton: number;
  daily_win_nanoton: number;
  risk_flags: string[];
};

export type AdminLedgerEntry = {
  id: string;
  user_id: string;
  type: string;
  amount_nanoton: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  created_at: string;
};

export type AdminAuditLog = {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
};

export type AdminGameConfig = {
  game_type: string;
  enabled: boolean;
  min_bet_nanoton: number;
  max_bet_nanoton: number;
  max_payout_nanoton: number;
  house_edge_bps: number;
  rtp_bps: number;
  platform_fee_bps: number;
};

export type AdminRiskSettings = {
  max_daily_win_nanoton: number;
  max_round_exposure_nanoton: number;
  whale_bet_threshold_nanoton: number;
  auto_review_withdraw_nanoton: number;
  hot_wallet_max_balance_nanoton: number;
  hot_wallet_sweep_threshold_nanoton: number;
  cold_wallet_address: string;
  roulette_recovery_enabled?: boolean;
  roulette_recovery_active?: boolean;
  roulette_bank_nanoton?: number;
  roulette_loss_threshold_nanoton?: number;
  roulette_recovery_target_nanoton?: number;
  roulette_recovery_bias_weight?: number;
  crash_recovery_enabled?: boolean;
  crash_recovery_active?: boolean;
  crash_bank_nanoton?: number;
  crash_loss_threshold_nanoton?: number;
  crash_recovery_target_nanoton?: number;
  crash_recovery_bias_weight?: number;
};

export type AdminTreasuryStatus = {
  hot_wallet_address: string;
  cold_wallet_address: string;
  hot_wallet_max_nanoton: number;
  hot_balance_nanoton?: number;
  sweep_threshold_nanoton: number;
  pending_liability_nanoton: number;
  requires_sweep: boolean;
};

export type AdminPromoCode = {
  code: string;
  bonus_nanoton: number;
  max_uses: number;
  used_count: number;
  active: boolean;
  expires_at?: string;
};

export type AdminBotSettings = {
  broadcast_enabled: boolean;
  spam_protection_level: number;
  webapp_url: string;
  webapp_button_text: string;
  terms_url: string;
  terms_button_text: string;
};

export type MaintenanceStatus = {
  enabled: boolean;
  accept_bets: boolean;
  message: string;
};

export type AdminMaintenanceSettings = {
  id?: number;
  enabled: boolean;
  accept_bets: boolean;
  message: string;
  updated_at?: string;
};

export type AdminWithdrawalSettings = {
  id?: number;
  enabled: boolean;
  gifts_manual: boolean;
  updated_at?: string;
};

export type AdminDepositSettings = {
  id?: number;
  stars_usd_rate: number;
  updated_at?: string;
};

export type AdminPendingGiftWithdraw = {
  item_id: string;
  user_id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  name: string;
  image_url?: string;
  telegram_gift_id: string;
  collection_slug?: string;
  floor_price_nanoton: number;
  needs_purchase?: boolean;
  updated_at: string;
};

export type AdminUser = {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  last_name?: string;
  betting_balance: number;
  staking_tier?: string;
  ton_wallet?: string;
  is_banned: boolean;
  withdrawals_disabled?: boolean;
  risk_flags: string[];
  last_login_at?: string;
  created_at?: string;
  referrer_id?: string;
  staking_principal_nanoton: number;
  active_stakes: number;
  staking_accrued_yield_nanoton: number;
  staking_daily_yield_nanoton: number;
  staking_weekly_yield_nanoton: number;
  bets_count: number;
  referral_count: number;
  came_via_referral: boolean;
  referrer_telegram_id?: number;
  referrer_username?: string;
  referrer_first_name?: string;
  referrer_code?: string;
  campaign_id?: string;
  campaign_name?: string;
  campaign_code?: string;
  acquisition_payload?: string;
};

export type AdminReferrerStat = {
  user_id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  referral_code: string;
  referral_count: number;
  referral_count_today: number;
  referral_count_7d: number;
};

export type AdminUserAudience = {
  total_users: number;
  banned_users: number;
  active_users_24h: number;
  active_users_7d: number;
  new_users_today: number;
  new_users_24h: number;
  new_users_7d: number;
  referred_users: number;
  organic_users: number;
  referred_today: number;
  referred_7d: number;
  with_balance: number;
  with_wallet: number;
  with_staking: number;
  boost_tier_users: number;
  staking_tvl_nanoton: number;
  balances_nanoton: number;
  staking_accrued_yield_nanoton: number;
  staking_daily_yield_nanoton: number;
  staking_weekly_yield_nanoton: number;
  top_referrers: AdminReferrerStat[];
};

export type AnalyticsBucket = {
  name: string;
  count: number;
};

export type AnalyticsFunnelStep = {
  name: string;
  count: number;
  drop_off_pct?: number;
};

export type AnalyticsFunnel = {
  name: string;
  steps: AnalyticsFunnelStep[];
};

export type AnalyticsScreenMetric = {
  name: string;
  count: number;
  secondary_count?: number;
  rate_percent?: number;
};

export type AnalyticsDailyPoint = {
  date: string;
  count: number;
};

export type AnalyticsHourPoint = {
  hour: number;
  count: number;
};

export type AdminAnalyticsOverview = {
  dau: number;
  wau: number;
  new_users: number;
  total_events_24h: number;
  sessions_total: number;
  returning_users: number;
  avg_sessions_per_user: number;
  visits_by_hour: AnalyticsHourPoint[];
  visits_by_weekday: AnalyticsBucket[];
  sessions_per_user_day: AnalyticsBucket[];
  sessions_by_day: AnalyticsDailyPoint[];
  top_sources: AnalyticsBucket[];
  top_screens: AnalyticsBucket[];
  top_actions: AnalyticsBucket[];
  top_failures: AnalyticsBucket[];
  mode_popularity: AnalyticsBucket[];
  screen_exit_rates: AnalyticsScreenMetric[];
  errors_by_screen: AnalyticsBucket[];
  avg_time_on_screen: AnalyticsScreenMetric[];
  top_hesitations: AnalyticsBucket[];
  exit_paths: AnalyticsBucket[];
  events_by_day: AnalyticsDailyPoint[];
  sessions_ended_after_error: number;
  errors_before_exit: AnalyticsBucket[];
  top_input_abandons: AnalyticsBucket[];
  filtered_count?: number;
  filtered_events?: AnalyticsTimelineEvent[];
  active_error_code?: string;
  active_input_id?: string;
  funnels: AnalyticsFunnel[];
};

export type AnalyticsTimelineEvent = {
  id: string;
  session_id?: string;
  event_name: string;
  event_category: string;
  source: string;
  path?: string;
  screen?: string;
  status?: string;
  error_code?: string;
  error_message?: string;
  occurred_at: string;
  properties?: Record<string, unknown>;
};

export type AdminUserSession = {
  session_id: string;
  started_at: string;
  ended_at: string;
  event_count: number;
  journey_path?: string;
  screens: string[];
  last_error_code?: string;
  ended_after_error: boolean;
  input_abandons: string[];
};

export type AdminUserAnalytics = {
  user_id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  created_at: string;
  last_seen_at?: string;
  referrer_id?: string;
  acquisition_source: string;
  acquisition_label: string;
  sessions_total: number;
  sessions_today: number;
  sessions_7d: number;
  active_days_7d: number;
  avg_sessions_per_active_day: number;
  visits_by_hour: AnalyticsHourPoint[];
  top_actions: AnalyticsBucket[];
  favorite_modes: AnalyticsBucket[];
  top_failures: AnalyticsBucket[];
  sessions: AdminUserSession[];
  active_session_id?: string;
  timeline: AnalyticsTimelineEvent[];
};

export async function getAdminRevenueSummary() {
  return api<AdminRevenueSummary>("/api/v1/admin/revenue/summary");
}

export async function getAdminRevenueTimeseries(days = 7) {
  return api<AdminRevenuePoint[]>(`/api/v1/admin/revenue/timeseries?days=${days}`);
}

export async function getAdminTransfers() {
  return api<WalletTransfer[]>("/api/v1/admin/transfers");
}

export async function reviewAdminTransfer(id: string, approve: boolean, note: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/transfers/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ approve, note }),
  });
}

export async function getAdminLedger() {
  return api<AdminLedgerEntry[]>("/api/v1/admin/ledger");
}

export async function getAdminGameStats() {
  return api<AdminGameStat[]>("/api/v1/admin/games/stats");
}

export async function getAdminRiskUsers() {
  return api<AdminRiskUser[]>("/api/v1/admin/risk/users");
}

export async function getAdminAuditLogs() {
  return api<AdminAuditLog[]>("/api/v1/admin/audit");
}

export async function getAdminOnlineNow() {
  return api<{ online: number }>("/api/v1/admin/online");
}

export type AdminNotificationCategory =
  | "all"
  | "finance"
  | "gifts"
  | "cases"
  | "referral"
  | "game"
  | "promo"
  | "quests"
  | "system";

export type AdminNotification = {
  id: string;
  kind: string;
  category: string;
  severity: "info" | "warning" | "critical" | string;
  title: string;
  summary: string;
  body: string;
  actor_telegram_id: number;
  actor_username: string;
  actor_first_name: string;
  actor_last_name: string;
  amount_nanoton?: number | null;
  meta?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
};

export type AdminNotificationList = {
  items: AdminNotification[];
  total: number;
  limit: number;
  offset: number;
};

export async function getAdminNotifications(opts?: {
  category?: string;
  unreadOnly?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.category && opts.category !== "all") params.set("category", opts.category);
  if (opts?.unreadOnly) params.set("unread", "1");
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const q = params.toString();
  return api<AdminNotificationList>(`/api/v1/admin/notifications${q ? `?${q}` : ""}`);
}

export async function getAdminNotificationUnreadCount(category?: string) {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  const q = params.toString();
  return api<{ count: number }>(`/api/v1/admin/notifications/unread-count${q ? `?${q}` : ""}`);
}

export async function markAdminNotificationRead(id: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/notifications/${id}/read`, { method: "POST" });
}

export async function markAllAdminNotificationsRead(category?: string) {
  return api<{ ok: boolean; marked: number }>("/api/v1/admin/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({ category: category && category !== "all" ? category : "" }),
  });
}

export type GameModeKey = "crash" | "roulette";

export type GameModeAccess = {
  enabled: boolean;
  available: boolean;
};

export type GameModesResponse = {
  modes: Record<GameModeKey, GameModeAccess>;
};

export async function getGameModes() {
  return api<GameModesResponse>("/api/v1/games/modes");
}

export async function getAdminGameConfigs() {
  return api<AdminGameConfig[]>("/api/v1/admin/games/configs");
}

export async function updateAdminMarketListingPrice(id: string, priceNanoton: number) {
  return api<{ ok: boolean }>(`/api/v1/admin/market/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ price_nanoton: priceNanoton }),
  });
}

export type AdminMarketListingPage = {
  items: MarketListing[];
  total: number;
};

export async function getAdminMarketListings(params?: {
  q?: string;
  collection?: string;
  source?: "bot" | "user";
  status?: string;
  price_min?: number;
  price_max?: number;
  sort?: "newest" | "price_asc" | "price_desc";
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.collection) q.set("collection", params.collection);
  if (params?.source) q.set("source", params.source);
  if (params?.status) q.set("status", params.status);
  if (params?.price_min != null) q.set("price_min", String(params.price_min));
  if (params?.price_max != null) q.set("price_max", String(params.price_max));
  if (params?.sort) q.set("sort", params.sort);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminMarketListingPage>(`/api/v1/admin/market/listings${qs ? `?${qs}` : ""}`);
}

export type AdminMarketListingIDsPage = {
  ids: string[];
  total: number;
};

export async function getAdminMarketListingIDs(params?: {
  q?: string;
  collection?: string;
  source?: "bot" | "user";
  status?: string;
  price_min?: number;
  price_max?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}) {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.collection) q.set("collection", params.collection);
  if (params?.source) q.set("source", params.source);
  if (params?.status) q.set("status", params.status);
  if (params?.price_min != null) q.set("price_min", String(params.price_min));
  if (params?.price_max != null) q.set("price_max", String(params.price_max));
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<AdminMarketListingIDsPage>(`/api/v1/admin/market/listings/ids${qs ? `?${qs}` : ""}`);
}

export async function cancelAdminMarketListing(id: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/market/listings/${id}`, { method: "DELETE" });
}

export type AdminMarketBulkResult = {
  updated: number;
  failed: number;
  errors?: string[];
};

export async function bulkAdminMarketListings(input: {
  action: "cancel" | "reprice_percent";
  ids: string[];
  percent?: number;
}) {
  return api<AdminMarketBulkResult>("/api/v1/admin/market/listings/bulk", {
    method: "POST",
    body: JSON.stringify({
      action: input.action,
      ids: input.ids,
      percent: input.percent ?? 0,
    }),
  });
}

export type AdminBotStockItem = {
  id: string;
  name: string;
  sub_name: string;
  model?: string;
  symbol?: string;
  backdrop?: string;
  image_url: string;
  collection_slug: string;
  floor_price_nanoton: number;
  status: string;
  listed: boolean;
  listing_id?: string;
  listing_price_nanoton?: number;
  suggested_price_nanoton?: number;
};

export type AdminBotStockPage = {
  items: AdminBotStockItem[];
  total: number;
};

export async function getAdminBotMarketStock(params?: {
  q?: string;
  listed?: boolean;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.listed != null) q.set("listed", params.listed ? "true" : "false");
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminBotStockPage>(`/api/v1/admin/market/bot-stock${qs ? `?${qs}` : ""}`);
}

export async function createAdminBotMarketListing(itemId: string, priceNanoton?: number) {
  return api<MarketListing>("/api/v1/admin/market/bot-listings", {
    method: "POST",
    body: JSON.stringify({
      item_id: itemId,
      price_nanoton: priceNanoton ?? 0,
    }),
  });
}

export type AdminMarketStats = {
  sold_count: number;
  volume_nanoton: number;
  fees_nanoton: number;
  active_count: number;
};

export async function getAdminMarketStats(days?: number) {
  const q = new URLSearchParams();
  if (days != null) q.set("days", String(days));
  const qs = q.toString();
  return api<AdminMarketStats>(`/api/v1/admin/market/stats${qs ? `?${qs}` : ""}`);
}

export type AdminBotGiftSyncResult = {
  scanned: number;
  listed: number;
  skipped_owned: number;
  skipped_pending_deposit: number;
  skipped_unpriced: number;
  listed_slugs?: string[];
  errors?: string[];
};

export async function syncAdminBotMarketGifts() {
  return api<AdminBotGiftSyncResult>("/api/v1/admin/market/sync-bot-gifts", {
    method: "POST",
  });
}

export type AdminBotGiftRepriceResult = {
  bot_gifts_scanned: number;
  listings_checked: number;
  updated: number;
  unchanged: number;
  skipped_unpriced: number;
  updated_slugs?: string[];
  errors?: string[];
};

export async function repriceAdminBotMarketGifts() {
  return api<AdminBotGiftRepriceResult>("/api/v1/admin/market/reprice-bot-gifts", {
    method: "POST",
  });
}

export type AdminGiftPriceSettings = {
  buy_adjust_percent: number;
  valuation_adjust_percent: number;
};

export type AdminGiftTraitPrice = {
  collection_slug: string;
  model: string;
  backdrop: string;
  price_nanoton: number;
  source: string;
  fetched_at: string;
  created_at?: string;
  updated_at?: string;
};

export type AdminGiftTraitPriceList = {
  items: AdminGiftTraitPrice[];
  total: number;
  filters: {
    collections: string[];
    models: string[];
    backdrops: string[];
  };
};

export async function getAdminGiftPriceSettings() {
  return api<AdminGiftPriceSettings>("/api/v1/admin/gift-price-settings");
}

export async function updateAdminGiftPriceSettings(settings: AdminGiftPriceSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/gift-price-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getAdminGiftTraitPrices(params?: {
  collection?: string;
  model?: string;
  backdrop?: string;
  model_only?: boolean;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.collection) q.set("collection", params.collection);
  if (params?.model) q.set("model", params.model);
  if (params?.backdrop) q.set("backdrop", params.backdrop);
  if (params?.model_only) q.set("model_only", "1");
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminGiftTraitPriceList>(`/api/v1/admin/gift-trait-prices${qs ? `?${qs}` : ""}`);
}

export async function updateAdminGiftTraitPrice(input: {
  collection_slug: string;
  model: string;
  backdrop?: string;
  price_nanoton: number;
}) {
  return api<{ ok: boolean }>("/api/v1/admin/gift-trait-prices", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateAdminGameConfig(config: AdminGameConfig) {
  return api<{ ok: boolean }>("/api/v1/admin/games/configs", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function rotateAdminGameSeed(game: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/games/${game}/rotate-seed`, { method: "POST" });
}

export async function getAdminRiskSettings() {
  return api<AdminRiskSettings>("/api/v1/admin/risk/settings");
}

export async function updateAdminRiskSettings(settings: AdminRiskSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/risk/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getAdminTreasuryStatus() {
  return api<AdminTreasuryStatus>("/api/v1/admin/treasury/status");
}

export type AdminUserSort = "last_login" | "balance" | "stake" | "bets" | "created";
export type AdminUserPeriod = "today" | "7d" | "all";

export type AdminUserBetItem = {
  id: string;
  game_type: string;
  status: string;
  amount_nanoton: number;
  payout_nanoton: number;
  funding_type: string;
  selection_label: string;
  cashout_multiplier?: number;
  created_at: string;
};

export type AdminUserBetsSummary = {
  bets: number;
  won: number;
  lost: number;
  volume_nanoton: number;
  payout_nanoton: number;
  net_nanoton: number;
};

export type AdminUserBetsResponse = {
  period: AdminUserPeriod;
  summary: AdminUserBetsSummary;
  items: AdminUserBetItem[];
};

export type AdminUserTransfersSummary = {
  deposits: number;
  withdrawals: number;
  deposit_volume_nanoton: number;
  withdrawal_volume_nanoton: number;
  failed: number;
};

export type AdminUserTransfersResponse = {
  period: AdminUserPeriod;
  summary: AdminUserTransfersSummary;
  items: WalletTransfer[];
};

export async function getAdminUsers(
  query = "",
  sort: AdminUserSort = "last_login",
  minReferrals = 0,
) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (sort) params.set("sort", sort);
  if (minReferrals > 0) params.set("min_referrals", String(minReferrals));
  const qs = params.toString();
  return api<AdminUser[]>(`/api/v1/admin/users${qs ? `?${qs}` : ""}`);
}

export async function setAdminUserBanned(userId: string, banned: boolean, reason = "") {
  return api<{ ok: boolean; banned: boolean }>(`/api/v1/admin/users/${userId}/ban`, {
    method: "PATCH",
    body: JSON.stringify({ banned, reason }),
  });
}

export async function setAdminUserWithdrawalsDisabled(
  userId: string,
  disabled: boolean,
  reason = "",
) {
  return api<{ ok: boolean; withdrawals_disabled: boolean }>(
    `/api/v1/admin/users/${userId}/withdrawals`,
    {
      method: "PATCH",
      body: JSON.stringify({ disabled, reason }),
    },
  );
}

export async function setAdminUserBalance(userId: string, balanceNanoton: number, reason: string) {
  return api<{
    ok: boolean;
    previous_balance: number;
    betting_balance: number;
    delta: number;
  }>(`/api/v1/admin/users/${userId}/balance`, {
    method: "PATCH",
    body: JSON.stringify({ balance_nanoton: balanceNanoton, reason }),
  });
}

export async function getAdminUserAudience() {
  return api<AdminUserAudience>("/api/v1/admin/users/stats");
}

export type AdminCampaignSource =
  | "telegram_ads"
  | "channel"
  | "stories"
  | "influencer"
  | "other";

export type AdminCampaignLanding = "" | "cases" | "games" | "crash";

export type AdminCampaignStats = {
  id: string;
  code: string;
  name: string;
  source: AdminCampaignSource | string;
  content?: string;
  landing?: string;
  status: "active" | "archived" | string;
  created_at: string;
  updated_at?: string;
  start_param: string;
  mini_app_url: string;
  bot_start_url: string;
  clicks: number;
  app_opens: number;
  new_users: number;
  depositors: number;
  deposits_nanoton: number;
  bettors: number;
  bet_volume_nanoton: number;
  ggr_nanoton: number;
  click_to_reg_pct: number;
  reg_to_deposit_pct: number;
  reg_to_bet_pct: number;
};

export type AdminCampaignDailyPoint = {
  date: string;
  clicks: number;
  app_opens: number;
  new_users: number;
  deposits_nanoton: number;
};

export type AdminCampaignDetail = AdminCampaignStats & {
  daily: AdminCampaignDailyPoint[];
};

export type AdminCampaignCreateInput = {
  name: string;
  code?: string;
  source: AdminCampaignSource | string;
  content?: string;
  landing?: string;
};

export async function getAdminCampaigns(params?: {
  from?: string;
  to?: string;
  source?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.source) qs.set("source", params.source);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AdminCampaignStats[]>(`/api/v1/admin/campaigns${suffix}`);
}

export async function getAdminCampaign(
  id: string,
  params?: { from?: string; to?: string },
) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AdminCampaignDetail>(`/api/v1/admin/campaigns/${id}${suffix}`);
}

export async function createAdminCampaign(input: AdminCampaignCreateInput) {
  return api<AdminCampaignStats>("/api/v1/admin/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchAdminCampaign(
  id: string,
  input: {
    name?: string;
    source?: string;
    content?: string;
    landing?: string;
    status?: string;
  },
) {
  return api<AdminCampaignStats>(`/api/v1/admin/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getAdminUserBets(userId: string, period: AdminUserPeriod = "7d") {
  return api<AdminUserBetsResponse>(
    `/api/v1/admin/users/${userId}/bets?period=${encodeURIComponent(period)}`,
  );
}

export async function getAdminUserTransfers(userId: string, period: AdminUserPeriod = "7d") {
  return api<AdminUserTransfersResponse>(
    `/api/v1/admin/users/${userId}/transfers?period=${encodeURIComponent(period)}`,
  );
}

export type AdminUserLedgerItem = {
  id: string;
  type: string;
  type_label: string;
  amount_nanoton: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  source_label: string;
  created_at: string;
};

export type AdminUserLedgerResponse = {
  period: AdminUserPeriod | string;
  items: AdminUserLedgerItem[];
};

export type AdminUserInventoryItem = {
  id: string;
  name: string;
  collection_slug: string;
  image_url: string;
  status: string;
  floor_price_nanoton: number;
  origin_kind: string;
  origin_label: string;
  case_slug?: string;
  fulfillment?: string;
  cashout_nanoton?: number;
  telegram_tx_ref?: string;
  market_price_nanoton?: number;
  deposited_at: string;
  created_at: string;
};

export type AdminUserInventoryResponse = {
  items: AdminUserInventoryItem[];
};

export type AdminUserCaseOpenItem = {
  open_id: string;
  case_id: string;
  case_title: string;
  case_slug: string;
  source: string;
  prize_type: string;
  prize_name: string;
  price_paid_nanoton: number;
  prize_nanoton: number;
  inventory_item_id?: string;
  created_at: string;
};

export type AdminUserCaseOpensResponse = {
  period: AdminUserPeriod | string;
  items: AdminUserCaseOpenItem[];
};

export async function getAdminUserLedger(userId: string, period: AdminUserPeriod = "7d") {
  return api<AdminUserLedgerResponse>(
    `/api/v1/admin/users/${userId}/ledger?period=${encodeURIComponent(period)}`,
  );
}

export async function getAdminUserInventory(userId: string) {
  return api<AdminUserInventoryResponse>(`/api/v1/admin/users/${userId}/inventory`);
}

export async function getAdminUserCaseOpens(userId: string, period: AdminUserPeriod = "7d") {
  return api<AdminUserCaseOpensResponse>(
    `/api/v1/admin/users/${userId}/case-opens?period=${encodeURIComponent(period)}`,
  );
}

export async function getAdminAnalyticsOverview(
  days = 1,
  filters: { errorCode?: string; inputId?: string } = {},
) {
  const params = new URLSearchParams({ days: String(days) });
  if (filters.errorCode) params.set("error_code", filters.errorCode);
  if (filters.inputId) params.set("input_id", filters.inputId);
  return api<AdminAnalyticsOverview>(`/api/v1/admin/analytics/overview?${params.toString()}`);
}

export async function getAdminUserAnalytics(userId: string, limit = 60, sessionId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sessionId) params.set("session_id", sessionId);
  return api<AdminUserAnalytics>(`/api/v1/admin/analytics/users/${userId}?${params.toString()}`);
}

export async function getAdminPromoCodes() {
  return api<AdminPromoCode[]>("/api/v1/admin/marketing/promos");
}

export async function upsertAdminPromoCode(promo: AdminPromoCode) {
  return api<{ ok: boolean }>("/api/v1/admin/marketing/promos", {
    method: "PUT",
    body: JSON.stringify(promo),
  });
}

export async function deleteAdminPromoCode(code: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/marketing/promos/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export async function getAdminYieldSettings() {
  return api<AdminYieldSettings>("/api/v1/admin/marketing/settings");
}

export async function updateAdminYieldSettings(settings: AdminYieldSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/marketing/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export type AdminStakingOverview = {
  epoch_id?: string;
  epoch_starts_at?: string;
  epoch_ends_at?: string;
  epoch_status?: string;
  tvl_nanoton: number;
  tvl_cap_nanoton: number;
  tvl_remaining_nanoton: number;
  personal_limit_nanoton: number;
  active_positions: number;
  active_stakers: number;
  projected_payout_nanoton: number;
  paid_last_24h_nanoton: number;
  base_monthly_percent: number;
  boost_monthly_percent: number;
};

export type AdminStakingEpochRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  positions: number;
  principal_nanoton: number;
  accrued_yield_nanoton: number;
};

export type AdminStakingPositionRow = {
  id: string;
  user_id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  gift_slug: string;
  source: string;
  principal_nanoton: number;
  accrued_yield_nanoton: number;
  is_active: boolean;
  revoked_reason?: string;
  staked_at: string;
  last_accrual_at: string;
  unstaked_at?: string | null;
  epoch_id: string;
};

export type AdminStakingActivityRow = {
  id: string;
  occurred_at: string;
  event_name: string;
  status: string;
  error_code?: string;
  error_message?: string;
  user_id?: string;
  telegram_id?: number;
  username?: string;
  first_name?: string;
  gift_slug?: string;
  item_id?: string;
  source?: string;
  request_id?: string;
};

export type AdminStakingStakerRow = {
  user_id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  staking_tier: "base" | "boost";
  positions: number;
  principal_nanoton: number;
  projected_payout_nanoton: number;
  streak_bonus_active: boolean;
};

export async function getAdminStakingOverview() {
  return api<AdminStakingOverview>("/api/v1/admin/staking/overview");
}

export async function getAdminStakingEpochs(opts?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const q = params.toString();
  return api<{ items: AdminStakingEpochRow[]; total: number; limit: number; offset: number }>(
    `/api/v1/admin/staking/epochs${q ? `?${q}` : ""}`,
  );
}

export async function getAdminStakingPositions(opts?: {
  q?: string;
  epoch_id?: string;
  active?: boolean;
  revoked_reason?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.epoch_id) params.set("epoch_id", opts.epoch_id);
  if (opts?.active) params.set("active", "1");
  if (opts?.revoked_reason) params.set("revoked_reason", opts.revoked_reason);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const q = params.toString();
  return api<{ items: AdminStakingPositionRow[]; total: number; limit: number; offset: number }>(
    `/api/v1/admin/staking/positions${q ? `?${q}` : ""}`,
  );
}

export async function getAdminStakingStakers(opts?: {
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const q = params.toString();
  return api<{
    items: AdminStakingStakerRow[];
    total: number;
    limit: number;
    offset: number;
    total_projected_payout_nanoton: number;
  }>(
    `/api/v1/admin/staking/stakers${q ? `?${q}` : ""}`,
  );
}

export async function getAdminStakingActivity(opts?: {
  q?: string;
  status?: "success" | "error" | "";
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const q = params.toString();
  return api<{ items: AdminStakingActivityRow[]; total: number; limit: number; offset: number }>(
    `/api/v1/admin/staking/activity${q ? `?${q}` : ""}`,
  );
}

export async function getAdminBotSettings() {
  return api<AdminBotSettings>("/api/v1/admin/telegram/settings");
}

export async function updateAdminBotSettings(settings: AdminBotSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/telegram/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getMaintenanceStatus() {
  return api<MaintenanceStatus>("/api/v1/maintenance");
}

export async function getAdminMaintenanceSettings() {
  return api<AdminMaintenanceSettings>("/api/v1/admin/maintenance");
}

export async function updateAdminMaintenanceSettings(settings: AdminMaintenanceSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/maintenance", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getAdminWithdrawalSettings() {
  return api<AdminWithdrawalSettings>("/api/v1/admin/withdrawals/settings");
}

export async function updateAdminWithdrawalSettings(
  settings: Pick<AdminWithdrawalSettings, "enabled" | "gifts_manual">,
) {
  return api<{ ok: boolean }>("/api/v1/admin/withdrawals/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getAdminDepositSettings() {
  return api<AdminDepositSettings>("/api/v1/admin/deposits/settings");
}

export async function updateAdminDepositSettings(
  settings: Pick<AdminDepositSettings, "stars_usd_rate">,
) {
  return api<{ ok: boolean }>("/api/v1/admin/deposits/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getAdminPendingGiftWithdrawals() {
  return api<AdminPendingGiftWithdraw[]>("/api/v1/admin/withdrawals/gifts");
}

export async function reviewAdminGiftWithdrawal(id: string, approve: boolean, note = "") {
  return api<{ ok: boolean }>(`/api/v1/admin/withdrawals/gifts/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ approve, note }),
  });
}

export async function fulfillAdminGiftWithdrawal(id: string, telegramGiftId: string, note = "") {
  return api<{ ok: boolean }>(`/api/v1/admin/withdrawals/gifts/${id}/fulfill`, {
    method: "POST",
    body: JSON.stringify({ telegram_gift_id: telegramGiftId, note }),
  });
}

export async function getWalletTransfers() {
  return api<WalletTransfer[]>("/api/v1/wallet/transfers");
}

export type RoundProof = {
  round_id: string;
  game_type: string;
  round_number: number;
  server_seed_hash: string;
  server_seed?: string;
  client_seed?: string;
  nonce: number;
  result?: string;
  verified: boolean;
};

export async function getRoundProof(game: string, roundId: string) {
  return api<RoundProof>(`/api/v1/games/${game}/rounds/${roundId}/proof`);
}

export type PromoStatus = {
  active: boolean;
  promo_code?: string;
  bonus_nanoton?: number;
};

export async function activatePromoCode(code: string) {
  try {
    const result = await api<PromoStatus>("/api/v1/promos/activate", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    trackEvent({
      event_name: "promo_activated",
      event_category: "promo",
      status: "success",
      properties: { code, bonus_nanoton: result.bonus_nanoton ?? 0 },
    });
    return result;
  } catch (error) {
    trackEvent({
      event_name: "promo_activated",
      event_category: "promo",
      status: "error",
      error_code: "promo_failed",
      error_message: error instanceof Error ? error.message : "promo_failed",
      properties: { code },
    });
    throw error;
  }
}

export async function getPromoStatus() {
  return api<PromoStatus>("/api/v1/promos/status");
}

export type DailyQuestReward = {
  type: "balance_nanoton" | "free_case_open" | "gift" | "none" | string;
  nanoton?: number;
  case_id?: string;
  case_title?: string;
  case_slug?: string;
  case_image_url?: string;
  collection_slug?: string;
  model_name?: string;
  gift_name?: string;
  gift_image_url?: string;
};

export type DailyQuestTask = {
  id: string;
  title: string;
  description: string;
  objective_type: string;
  target: number;
  progress: number;
  status: "active" | "ready" | "claimed" | string;
  action: "cases" | "referrals" | "roulette" | "crash" | "claim" | "none" | string;
  objective_case_id?: string;
  objective_case_slug?: string;
  objective_case_title?: string;
  /** Optional lobby art override (admin-uploaded). */
  card_image_url?: string;
  reward: DailyQuestReward;
};

export type DailyQuestBonus = {
  title: string;
  description: string;
  completed_count: number;
  total_count: number;
  status: "disabled" | "locked" | "ready" | "claimed" | string;
  /** Optional lobby art override (admin-uploaded). */
  card_image_url?: string;
  reward: DailyQuestReward;
};

export type DailyQuestBoard = {
  day_msk: string;
  tasks: DailyQuestTask[];
  bonus: DailyQuestBonus;
};

export type DailyQuestClaimResult = {
  reward: DailyQuestReward;
  balance_after?: number;
  entitlement_id?: string;
  case_id?: string;
  inventory_item_id?: string;
};

export async function getDailyQuests() {
  return api<DailyQuestBoard>("/api/v1/quests/daily");
}

export async function claimDailyQuest(id: string) {
  return api<DailyQuestClaimResult>(`/api/v1/quests/daily/${encodeURIComponent(id)}/claim`, {
    method: "POST",
  });
}

export async function claimDailyQuestBonus() {
  return api<DailyQuestClaimResult>("/api/v1/quests/daily/bonus/claim", {
    method: "POST",
  });
}

export type AdminDailyQuest = {
  id?: string;
  title: string;
  description: string;
  sort_order: number;
  active: boolean;
  active_from?: string | null;
  active_to?: string | null;
  objective_type: "open_cases" | "open_cases_spend" | "invite_referrals" | "wager_roulette" | "wager_crash" | "roulette_win_mult" | "crash_cashout_mult" | "roulette_color_streak" | string;
  objective_target: number;
  /** Multiplier threshold ×100 for *_mult objectives (5000 = ×50). */
  objective_param?: number;
  objective_case_id?: string | null;
  reward_type: "balance_nanoton" | "free_case_open" | "gift" | "none" | string;
  reward_nanoton: number;
  reward_case_id?: string | null;
  reward_collection_slug?: string;
  reward_model_name?: string;
  reward_gift_name?: string;
  reward_gift_image_url?: string;
  /** Optional art shown on the quests lobby card (overrides reward preview). */
  card_image_url?: string;
};

export type DailyQuestPromoSlide = {
  id: string;
  tone: "duo" | "open" | string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /** Hex accent for CTA text on the white pill, e.g. #0f9f7a */
  cta_color?: string;
  cta_bold?: boolean;
  eyebrow_color?: string;
  title_color?: string;
  subtitle_color?: string;
  /** Color for **accent** spans in eyebrow/title/subtitle */
  accent_color?: string;
  eyebrow_bold?: boolean;
  title_bold?: boolean;
  subtitle_bold?: boolean;
  /** sm | md | lg */
  title_size?: "sm" | "md" | "lg" | string;
  cover_url: string;
  active: boolean;
};

export async function getDailyQuestPromo() {
  const res = await api<{ items: DailyQuestPromoSlide[] }>("/api/v1/quests/promo");
  return res.items ?? [];
}

export type AdminDailyQuestBoard = {
  id?: number;
  bonus_title: string;
  bonus_description: string;
  bonus_reward_type: "balance_nanoton" | "free_case_open" | "gift" | string;
  bonus_reward_nanoton: number;
  bonus_reward_case_id?: string | null;
  bonus_reward_collection_slug?: string;
  bonus_reward_model_name?: string;
  bonus_reward_gift_name?: string;
  bonus_reward_gift_image_url?: string;
  /** Optional art shown on the bonus lobby card (overrides reward preview). */
  bonus_card_image_url?: string;
  bonus_active: boolean;
  promo_slides?: DailyQuestPromoSlide[];
};

export async function getAdminDailyQuests() {
  const res = await api<{ items: AdminDailyQuest[] }>("/api/v1/admin/quests");
  return res.items ?? [];
}

export async function upsertAdminDailyQuest(quest: AdminDailyQuest) {
  return api<{ ok: boolean; item: AdminDailyQuest }>("/api/v1/admin/quests", {
    method: "PUT",
    body: JSON.stringify(quest),
  });
}

export async function deleteAdminDailyQuest(id: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/quests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getAdminDailyQuestBoard() {
  return api<AdminDailyQuestBoard>("/api/v1/admin/quests/board");
}

export async function updateAdminDailyQuestBoard(board: AdminDailyQuestBoard) {
  return api<AdminDailyQuestBoard>("/api/v1/admin/quests/board", {
    method: "PUT",
    body: JSON.stringify(board),
  });
}

export type AdminDailyQuestResetResult = {
  day_msk: string;
  user_id?: string;
  deleted_claims: number;
};

export async function resetAdminDailyQuestClaims(params?: {
  user_id?: string;
  telegram_id?: number;
  day_msk?: string;
}) {
  return api<AdminDailyQuestResetResult>("/api/v1/admin/quests/reset", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

export type AdminQuestPeriodStats = {
  task_claims: number;
  bonus_claims: number;
  unique_claimers: number;
  task_claimers: number;
  bonus_claimers: number;
  bonus_completion_bps: number;
  reward_nanoton_total: number;
  balance_reward_nanoton: number;
  gift_reward_nanoton: number;
  free_case_claims: number;
  entitlements_granted: number;
  entitlements_used: number;
  entitlements_available: number;
  entitlement_redeem_bps: number;
  quest_opens: number;
  quest_open_users: number;
  quest_prize_total_nanoton: number;
  platform_cost_nanoton: number;
};

export type AdminQuestByQuestRow = {
  quest_id: string;
  title: string;
  active: boolean;
  sort_order: number;
  task_claims: number;
  unique_users: number;
  reward_nanoton_total: number;
  reward_type: string;
};

export type AdminQuestByRewardRow = {
  reward_type: string;
  claims: number;
  unique_users: number;
  reward_nanoton_total: number;
};

export type AdminQuestDailyPoint = {
  day_msk: string;
  task_claims: number;
  bonus_claims: number;
  unique_claimers: number;
  reward_nanoton_total: number;
};

export type AdminQuestStats = {
  timezone: string;
  today: AdminQuestPeriodStats;
  last_7_days: AdminQuestPeriodStats;
  last_30_days: AdminQuestPeriodStats;
  all_time: AdminQuestPeriodStats;
  by_quest_today: AdminQuestByQuestRow[];
  by_quest_7d: AdminQuestByQuestRow[];
  by_quest_30d: AdminQuestByQuestRow[];
  by_quest_all_time: AdminQuestByQuestRow[];
  by_reward_7d: AdminQuestByRewardRow[];
  by_reward_all_time: AdminQuestByRewardRow[];
  claims_by_day: AdminQuestDailyPoint[];
};

export async function getAdminQuestStats() {
  return api<AdminQuestStats>("/api/v1/admin/quests/stats");
}

export type CaseLootPreview = {
  id: string;
  prize_type?: "gift" | "ton" | string;
  collection_slug: string;
  model_name?: string;
  /** Price-sensitive gift backdrop: Black / Onyx Black. */
  backdrop?: string;
  display_name: string;
  image_url: string;
  rarity_label?: string;
  /** Admin-picked tile color; overrides rarity gradient when set. */
  tile_background_color?: string;
  sort_order: number;
  floor_price_nanoton?: number;
  amount_nanoton?: number;
};

export type CaseLiveDrop = {
  open_id: string;
  prize_type?: "gift" | "ton" | string;
  collection_slug: string;
  display_name: string;
  image_url: string;
  rarity_label?: string;
  tile_background_color?: string;
  backdrop?: string;
  floor_price_nanoton: number;
  created_at: string;
};

export type CaseView = {
  id: string;
  slug: string;
  title: string;
  image_url?: string;
  accent_color?: string;
  price_nanoton: number;
  kind: "catalog" | "featured" | "daily" | string;
  sort_order: number;
  require_channel?: boolean;
  required_channel?: string;
  channel_subscribed?: boolean;
  /** Substring that must appear in Telegram first_name or last_name. */
  required_name_tag?: string;
  require_share?: boolean;
  name_tag_ok?: boolean;
  share_done?: boolean;
  loot?: CaseLootPreview[];
  daily_available?: boolean;
  next_available_at?: string;
  /** Unused free open from a daily quest reward for this case. */
  free_open_available?: boolean;
};

export type CasesCatalog = {
  featured: CaseView[];
  daily?: CaseView | null;
  catalog: CaseView[];
  /** Top featured/daily banner row. Off by default until banners are ready. */
  banners_enabled?: boolean;
};

export type CaseOpenResult = {
  open_id: string;
  case_id: string;
  source: string;
  prize_type?: "gift" | "ton" | string;
  prize_nanoton?: number;
  guaranteed_cashout_nanoton?: number;
  item?: InventoryItem | null;
  loot_entry: CaseLootPreview;
  backed: boolean;
};

export async function getCasesCatalog() {
  return api<CasesCatalog>("/api/v1/cases");
}

export async function getCasesLiveFeed() {
  return api<CaseLiveDrop[]>("/api/v1/cases/live");
}

export async function getCase(idOrSlug: string) {
  return api<CaseView>(`/api/v1/cases/${encodeURIComponent(idOrSlug)}`);
}

export async function prepareCaseShare(idOrSlug: string) {
  return api<{
    prepared_message_id: string;
    result_id: string;
    expiration_date?: number;
  }>(`/api/v1/cases/${encodeURIComponent(idOrSlug)}/share/prepare`, {
    method: "POST",
    body: "{}",
  });
}

export async function confirmCaseShare(idOrSlug: string, resultId: string) {
  return api<CaseView>(`/api/v1/cases/${encodeURIComponent(idOrSlug)}/share/confirm`, {
    method: "POST",
    body: JSON.stringify({ result_id: resultId }),
  });
}

export async function openCase(
  idOrSlug: string,
  opts?: { idempotencyKey?: string; promoCode?: string },
) {
  const key =
    opts?.idempotencyKey ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `case-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const body: { idempotency_key: string; promo_code?: string } = { idempotency_key: key };
  const promo = opts?.promoCode?.trim();
  if (promo) body.promo_code = promo.toUpperCase();
  try {
    const result = await api<CaseOpenResult>(`/api/v1/cases/${encodeURIComponent(idOrSlug)}/open`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (promo) {
      trackEvent({
        event_name: "promo_activated",
        event_category: "promo",
        status: "success",
        properties: { code: promo.toUpperCase(), case: idOrSlug, source: "case" },
      });
    }
    return result;
  } catch (error) {
    if (promo) {
      trackEvent({
        event_name: "promo_activated",
        event_category: "promo",
        status: "error",
        error_code: "promo_failed",
        error_message: error instanceof Error ? error.message : "promo_failed",
        properties: { code: promo.toUpperCase(), case: idOrSlug, source: "case" },
      });
    }
    throw error;
  }
}

export async function getCaseOpens() {
  return api<CaseOpenResult[]>("/api/v1/cases/opens");
}

export type AdminCaseLootEntry = {
  id?: string;
  prize_type?: "gift" | "ton" | string;
  collection_slug: string;
  model_name?: string;
  /** Price-sensitive gift backdrop: Black / Onyx Black. */
  backdrop?: string;
  display_name: string;
  image_url?: string;
  rarity_label?: string;
  /** Admin-picked tile color; overrides rarity gradient when set. */
  tile_background_color?: string;
  sort_order: number;
  weight: number;
  floor_price_nanoton?: number;
  amount_nanoton?: number;
};

export type AdminCase = {
  id: string;
  slug: string;
  title: string;
  image_url?: string;
  accent_color?: string;
  price_nanoton: number;
  kind: string;
  sort_order: number;
  active: boolean;
  require_channel: boolean;
  required_name_tag?: string;
  require_share?: boolean;
  target_rtp_bps: number;
  loot: AdminCaseLootEntry[];
};

export type AdminCaseUpsert = {
  id?: string;
  slug: string;
  title: string;
  image_url?: string;
  accent_color?: string;
  price_nanoton: number;
  kind: string;
  sort_order: number;
  active: boolean;
  require_channel: boolean;
  required_name_tag?: string;
  require_share?: boolean;
  target_rtp_bps: number;
};

export async function getAdminCases() {
  return api<AdminCase[]>("/api/v1/admin/cases");
}

export type CasesFeatures = {
  enabled: boolean;
  banners_enabled: boolean;
};

export async function getCasesFeatures() {
  return api<CasesFeatures>("/api/v1/cases/features");
}

export type AdminCaseCatalogSettings = {
  id: number;
  enabled: boolean;
  banners_enabled: boolean;
  updated_at?: string;

  bank_enabled?: boolean;
  bank_nanoton?: number;
  bank_target_nanoton?: number;
  bank_loss_threshold_nanoton?: number;
  bank_recovery_target_nanoton?: number;
  bank_recovery_active?: boolean;
  bank_bias_weight?: number;
  bank_max_prize_bps?: number;
  bank_fat_paused?: boolean;
  bank_recovery_smooth_enabled?: boolean;
  bank_recovery_drain_opens?: number;
  bank_recovery_relief_opens?: number;
  bank_recovery_relief_max_prize_bps?: number;
  bank_recovery_pace_counter?: number;

  daily_pool_enabled?: boolean;
  daily_pool_nanoton?: number;
  daily_pool_max_prize_bps?: number;
  daily_pool_daily_refill_nanoton?: number;
  daily_pool_last_refill_date?: string;

  promo_pool_enabled?: boolean;
  promo_pool_nanoton?: number;
  promo_pool_max_prize_bps?: number;
  promo_pool_daily_refill_nanoton?: number;
  promo_pool_last_refill_date?: string;

  deposit_boost_enabled?: boolean;
  deposit_boost_min_nanoton?: number;
  deposit_boost_bias_weight?: number;
  deposit_boost_tier1_min_nanoton?: number;
  deposit_boost_tier2_min_nanoton?: number;
  deposit_boost_tier3_min_nanoton?: number;
  deposit_boost_tier4_min_nanoton?: number;
  deposit_boost_tier1_bias_weight?: number;
  deposit_boost_tier2_bias_weight?: number;
  deposit_boost_tier3_bias_weight?: number;
  deposit_boost_tier4_bias_weight?: number;
  deposit_boost_surplus_share_bps?: number;
  deposit_boost_ramp_nanoton?: number;
};

export type AdminCaseCatalogSettingsPatch = {
  enabled?: boolean;
  banners_enabled?: boolean;
  bank_enabled?: boolean;
  bank_nanoton?: number;
  bank_target_nanoton?: number;
  bank_loss_threshold_nanoton?: number;
  bank_recovery_target_nanoton?: number;
  bank_bias_weight?: number;
  bank_max_prize_bps?: number;
  bank_fat_paused?: boolean;
  bank_adjust_nanoton?: number;
  bank_recovery_smooth_enabled?: boolean;
  bank_recovery_drain_opens?: number;
  bank_recovery_relief_opens?: number;
  bank_recovery_relief_max_prize_bps?: number;
  daily_pool_enabled?: boolean;
  daily_pool_nanoton?: number;
  daily_pool_max_prize_bps?: number;
  daily_pool_daily_refill_nanoton?: number;
  daily_pool_adjust_nanoton?: number;
  promo_pool_enabled?: boolean;
  promo_pool_nanoton?: number;
  promo_pool_max_prize_bps?: number;
  promo_pool_daily_refill_nanoton?: number;
  promo_pool_adjust_nanoton?: number;
  deposit_boost_enabled?: boolean;
  deposit_boost_min_nanoton?: number;
  deposit_boost_bias_weight?: number;
  deposit_boost_tier1_min_nanoton?: number;
  deposit_boost_tier2_min_nanoton?: number;
  deposit_boost_tier3_min_nanoton?: number;
  deposit_boost_tier4_min_nanoton?: number;
  deposit_boost_tier1_bias_weight?: number;
  deposit_boost_tier2_bias_weight?: number;
  deposit_boost_tier3_bias_weight?: number;
  deposit_boost_tier4_bias_weight?: number;
  deposit_boost_surplus_share_bps?: number;
  deposit_boost_ramp_nanoton?: number;
};

export async function getAdminCaseCatalogSettings() {
  return api<AdminCaseCatalogSettings>("/api/v1/admin/cases/settings");
}

export async function updateAdminCaseCatalogSettings(body: AdminCaseCatalogSettingsPatch) {
  return api<AdminCaseCatalogSettings>("/api/v1/admin/cases/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type AdminCaseEconomyStats = {
  opens_count: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  actual_rtp_bps: number;
  organic_opens_count?: number;
  organic_spent_nanoton?: number;
  organic_prize_nanoton?: number;
  organic_edge_nanoton?: number;
  organic_rtp_bps?: number;
  admin_funded_opens_count?: number;
  admin_funded_spent_nanoton?: number;
  admin_funded_prize_nanoton?: number;
  admin_funded_edge_nanoton?: number;
};

export async function getAdminCaseEconomyStats(since?: string) {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return api<AdminCaseEconomyStats>(`/api/v1/admin/cases/economy-stats${q}`);
}

export type AdminCaseOpenPeriodStats = {
  opens: number;
  unique_users: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  actual_rtp_bps: number;
  paid_opens: number;
  free_opens: number;
  avg_ticket_nanoton: number;
  avg_prize_nanoton: number;
};

export type AdminCaseOpenSourceStats = {
  opens: number;
  unique_users: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
};

export type AdminCaseOpenSourceBreakdown = {
  paid: AdminCaseOpenSourceStats;
  daily: AdminCaseOpenSourceStats;
  free: AdminCaseOpenSourceStats;
  promo: AdminCaseOpenSourceStats;
};

export type AdminCaseOpenPrizeTypeStats = {
  prize_type: string;
  opens: number;
  prize_total_nanoton: number;
};

export type AdminCaseOpenCaseRow = {
  case_id: string;
  title: string;
  slug: string;
  image_url?: string;
  kind?: string;
  price_nanoton?: number;
  sort_order?: number;
  active?: boolean;
  opens: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  actual_rtp_bps: number;
};

export type AdminCaseOpenPrizeHit = {
  loot_entry_id: string;
  label: string;
  prize_type: string;
  hits: number;
  prize_total_nanoton: number;
  share_percent: number;
};

export type AdminCaseOpenDailyPoint = {
  date: string;
  opens: number;
  unique_users: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
};

export type AdminCaseOpenStats = {
  today: AdminCaseOpenPeriodStats;
  last_7_days: AdminCaseOpenPeriodStats;
  last_30_days?: AdminCaseOpenPeriodStats;
  all_time: AdminCaseOpenPeriodStats;
  sources_today: AdminCaseOpenSourceBreakdown;
  sources_all_time: AdminCaseOpenSourceBreakdown;
  prize_types_7d: AdminCaseOpenPrizeTypeStats[];
  prize_types_all_time: AdminCaseOpenPrizeTypeStats[];
  by_case_today?: AdminCaseOpenCaseRow[];
  by_case_7d: AdminCaseOpenCaseRow[];
  by_case_30d?: AdminCaseOpenCaseRow[];
  by_case_all_time: AdminCaseOpenCaseRow[];
  top_prizes_7d: AdminCaseOpenPrizeHit[];
  opens_by_day: AdminCaseOpenDailyPoint[];
};

export async function getAdminCaseOpenStats() {
  return api<AdminCaseOpenStats>("/api/v1/admin/cases/open-stats");
}

export type AdminCaseLiveFeedSettings = {
  id?: number;
  enabled: boolean;
  intensity: number;
  fill_when_sparse: boolean;
  min_visible: number;
  common_weight: number;
  uncommon_weight: number;
  rare_weight: number;
  epic_weight: number;
  legendary_weight: number;
  /** Upper bound (exclusive) for common tier, nanoton. */
  common_max_nanoton: number;
  uncommon_max_nanoton: number;
  rare_max_nanoton: number;
  epic_max_nanoton: number;
  fat_chance: number;
  fat_min_floor_nanoton: number;
  /** Hide gift drops above this floor (nanoton). 0 = no cap. */
  max_gift_floor_nanoton: number;
  /** When true, fake live drops exclude TON (real TON opens still show). */
  hide_ton: boolean;
  updated_at?: string;
};

export async function getAdminCaseLiveFeedSettings() {
  return api<AdminCaseLiveFeedSettings>("/api/v1/admin/cases/live-settings");
}

export async function updateAdminCaseLiveFeedSettings(body: AdminCaseLiveFeedSettings) {
  return api<AdminCaseLiveFeedSettings>("/api/v1/admin/cases/live-settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function upsertAdminCase(body: AdminCaseUpsert) {
  return api<{ ok: boolean; id: string }>("/api/v1/admin/cases", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteAdminCase(caseId: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE",
  });
}

export async function uploadAdminCaseImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<{ ok: boolean; url: string; image_url: string }>("/api/v1/admin/cases/upload", {
    method: "POST",
    body: form,
  });
}

export async function replaceAdminCaseLoot(caseId: string, entries: AdminCaseLootEntry[]) {
  return api<{ ok: boolean }>(`/api/v1/admin/cases/${encodeURIComponent(caseId)}/loot`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  });
}

export type AdminCaseSimulateEntry = {
  loot_entry_id: string;
  display_name: string;
  collection_slug: string;
  weight: number;
  expected_pct_bps: number;
  hits: number;
  actual_pct_bps: number;
  floor_price_nanoton: number;
  prize_sum_nanoton: number;
};

export type AdminCaseSimulateResult = {
  case_id: string;
  slug: string;
  iterations: number;
  price_nanoton: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  simulated_rtp_bps: number;
  theoretical_rtp_bps: number;
  target_rtp_bps: number;
  rtp_available: boolean;
  with_bank?: boolean;
  final_bank_nanoton?: number;
  eligible_entry_ids?: string[];
  entries: AdminCaseSimulateEntry[];
  warnings?: string[];
};

export async function simulateAdminCase(
  caseId: string,
  iterations = 100,
  withBank = false,
) {
  return api<AdminCaseSimulateResult>(
    `/api/v1/admin/cases/${encodeURIComponent(caseId)}/simulate`,
    {
      method: "POST",
      body: JSON.stringify({ iterations, with_bank: withBank }),
    },
  );
}

export type AdminCasePlayerSimulateOpen = {
  index: number;
  loot_entry_id: string;
  display_name: string;
  prize_nanoton: number;
  boost_applied: boolean;
  boost_tier?: string;
  boost_strength?: number;
  bank_before_nanoton: number;
  bank_after_nanoton: number;
  recovery: boolean;
  price_nanoton: number;
};

export type AdminCasePlayerSimulateResult = {
  case_id: string;
  slug: string;
  title: string;
  kind: string;
  iterations: number;
  price_nanoton: number;
  deposits_nanoton: number;
  boost_eligible: boolean;
  boost_tier?: string;
  boost_strength: number;
  boost_scale_bps?: number;
  boost_applied_opens: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  simulated_rtp_bps: number;
  theoretical_rtp_bps: number;
  target_rtp_bps: number;
  rtp_available: boolean;
  with_bank: boolean;
  bank_start_nanoton: number;
  bank_min_nanoton: number;
  bank_max_nanoton: number;
  bank_end_nanoton: number;
  recovery_opens: number;
  entries: AdminCaseSimulateEntry[];
  sample_opens: AdminCasePlayerSimulateOpen[];
  warnings?: string[];
};

export type AdminCasePlayerSimulateBatch = {
  deposits_nanoton: number;
  iterations: number;
  cases: AdminCasePlayerSimulateResult[];
};

export async function playerSimulateAdminCase(
  caseId: string,
  opts: {
    iterations?: number;
    depositsNanoton?: number;
    sampleLimit?: number;
    withBank?: boolean;
  } = {},
) {
  return api<AdminCasePlayerSimulateResult>(
    `/api/v1/admin/cases/${encodeURIComponent(caseId)}/player-simulate`,
    {
      method: "POST",
      body: JSON.stringify({
        iterations: opts.iterations ?? 100,
        deposits_nanoton: opts.depositsNanoton ?? 0,
        sample_limit: opts.sampleLimit ?? 40,
        with_bank: opts.withBank ?? true,
      }),
    },
  );
}

export async function playerSimulateAllAdminCases(
  opts: {
    iterations?: number;
    depositsNanoton?: number;
    sampleLimit?: number;
    withBank?: boolean;
  } = {},
) {
  return api<AdminCasePlayerSimulateBatch>("/api/v1/admin/cases/player-simulate-all", {
    method: "POST",
    body: JSON.stringify({
      iterations: opts.iterations ?? 100,
      deposits_nanoton: opts.depositsNanoton ?? 0,
      sample_limit: opts.sampleLimit ?? 10,
      with_bank: opts.withBank ?? true,
    }),
  });
}

export type AdminCasePromoCode = {
  code: string;
  case_id: string;
  max_uses: number;
  used_count: number;
  active: boolean;
  expires_at?: string;
  created_at?: string;
};

export async function getAdminCasePromoCodes(caseId?: string) {
  const q = caseId ? `?case_id=${encodeURIComponent(caseId)}` : "";
  return api<AdminCasePromoCode[]>(`/api/v1/admin/cases/promos${q}`);
}

export async function upsertAdminCasePromoCode(promo: {
  code: string;
  case_id: string;
  max_uses: number;
  active: boolean;
  expires_at?: string | null;
}) {
  return api<{ ok: boolean }>("/api/v1/admin/cases/promos", {
    method: "PUT",
    body: JSON.stringify(promo),
  });
}

export async function deleteAdminCasePromoCode(code: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/cases/promos/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export type TelegramBroadcast = {
  id: string;
  message: string;
  image_urls?: string[];
  include_channel_button?: boolean;
  status: string;
  total_users: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  finished_at?: string;
};

export async function createAdminBroadcast(
  message: string,
  includeChannelButton = false,
  imageUrls?: string[],
) {
  const urls = (imageUrls ?? []).map((u) => u.trim()).filter(Boolean);
  return api<TelegramBroadcast>("/api/v1/admin/telegram/broadcast", {
    method: "POST",
    body: JSON.stringify({
      message,
      include_channel_button: includeChannelButton,
      ...(urls.length ? { image_urls: urls } : {}),
    }),
  });
}

export async function getAdminBroadcasts() {
  return api<TelegramBroadcast[]>("/api/v1/admin/telegram/broadcasts");
}

export type TelegramBroadcastDelivery = {
  id: string;
  broadcast_id: string;
  telegram_id: number;
  status: "sent" | "skipped" | "failed" | string;
  error_message?: string;
  created_at: string;
};

export type TelegramBroadcastDeliveriesResponse = {
  items: TelegramBroadcastDelivery[];
  total: number;
  limit: number;
  offset: number;
};

export async function getAdminBroadcastDeliveries(
  broadcastId: string,
  opts?: { status?: string; limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return api<TelegramBroadcastDeliveriesResponse>(
    `/api/v1/admin/telegram/broadcasts/${encodeURIComponent(broadcastId)}/deliveries${qs ? `?${qs}` : ""}`,
  );
}

export type TreasurySweep = {
  id: string;
  amount_nanoton: number;
  cold_wallet_address: string;
  hot_balance_before: number;
  tx_hash?: string;
  status: string;
  created_at: string;
};

export async function getAdminTreasurySweeps() {
  return api<TreasurySweep[]>("/api/v1/admin/treasury/sweeps");
}

// --- Admin game outcome control ---

export type AdminOutcomeOverride = {
  id: string;
  game_type: string;
  target: any;
  rounds_remaining: number;
  created_by: string;
  note: string;
  expires_at?: string;
  created_at: string;
};

export type AdminOutcomeRouletteTarget = {
  color: string;
  number?: number;
  mode: "force" | "bias";
  weight: number;
};

export type AdminOutcomeCrashTarget = {
  min_point: number;
  max_point: number;
  exact_point?: number;
  mode: "force" | "bias";
  weight: number;
};


export async function listOutcomeOverrides() {
  return api<AdminOutcomeOverride[]>("/api/v1/admin/outcome/overrides");
}

export async function createOutcomeOverride(
  gameType: string,
  target: AdminOutcomeRouletteTarget | AdminOutcomeCrashTarget,
  roundsRemaining: number,
  durationMinutes: number,
  note: string,
) {
  return api<AdminOutcomeOverride>("/api/v1/admin/outcome/overrides", {
    method: "POST",
    body: JSON.stringify({
      game_type: gameType,
      target,
      rounds_remaining: roundsRemaining,
      duration_minutes: durationMinutes,
      note,
    }),
  });
}

export async function deleteOutcomeOverride(id: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/outcome/overrides/${id}`, { method: "DELETE" });
}
