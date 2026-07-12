import { getTelegramWebApp } from "@/src/shared/lib/twa";
import { getAnalyticsSessionId, getCurrentPath, trackErrorSurface, trackEvent } from "@/lib/analytics";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
const NGROK_API = API_URL.includes("ngrok-free.app") || API_URL.includes("ngrok.io");

export function resolveAsset(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("//")) return url;
  return API_URL.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
}
export const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
export const AUTH_SESSION_REFRESHED = "flipo:auth-session-refreshed";

const TOKEN_KEY = "flipo_token";
const AUTH_PATHS = new Set(["/api/v1/auth/telegram", "/api/v1/auth/debug"]);

export class ApiRequestError extends Error {
  code?: string;
  channel?: string;

  constructor(message: string, opts?: { code?: string; channel?: string }) {
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
  promo_balance?: number;
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
  model?: string;
  symbol?: string;
  backdrop?: string;
  status: string;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
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

let reauthPromise: Promise<User | null> | null = null;

function dispatchSessionRefreshed(user: User) {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_REFRESHED, { detail: { user } }));
}

async function rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const requestId = typeof crypto !== "undefined" ? crypto.randomUUID() : "";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
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

  if (res.status === 401 && !retried && !AUTH_PATHS.has(path)) {
    const user = await silentReauth();
    if (user) {
      return api<T>(path, options, true);
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
      error_code: `${path.replace(/^\/api\/v1\//, "").replace(/\//g, "_")}_failed`,
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

export async function authTelegram(initData: string, referralCode?: string) {
  return api<{ token: string; user: User }>("/api/v1/auth/telegram", {
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

export async function withdrawGiftItem(id: string) {
  try {
    const result = await api<{ ok: boolean }>(`/api/v1/inventory/${id}/withdraw`, { method: "POST" });
    trackEvent({
      event_name: "inventory_withdrawn",
      event_category: "inventory",
      status: "success",
      properties: { item_id: id },
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
  color: "red" | "green" | "black" | string;
  amount_nanoton: number;
  funding_type?: "balance" | "gift" | string;
  gift?: BetGiftView;
};

export type RouletteColorTotals = {
  red: number;
  green: number;
  black: number;
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
    trackEvent({
      event_name: "staking_started",
      event_category: "staking",
      status: "error",
      error_code: "stake_failed",
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
  return ton.toFixed(2);
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
    const result = await api<{ balance: number; promo_balance: number }>(`/api/v1/market/listings/${id}/buy`, {
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

export type AdminYieldSettings = {
  id: number;
  referral_share_percent: number;
  referral_ggr_share_percent: number;
  referral_milestone_nanoton: number;
  referral_milestone_monthly_cap: number;
  referral_monthly_payout_cap_nanoton: number;
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
  pending_liability_nanoton: number;
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

export type AdminSocialSimSettings = {
  id: number;
  enabled: boolean;
  crash_enabled: boolean;
  roulette_enabled: boolean;
  pvp_enabled: boolean;
  lobby_enabled: boolean;
  online_base_min: number;
  online_base_max: number;
  online_jitter: number;
  tod_multipliers: number[];
  bet_intensity: number;
  bet_burst_chance: number;
  idle_gap_ms_min: number;
  idle_gap_ms_max: number;
  stake_p50: number;
  stake_p90: number;
  crash_auto_cashout_share: number;
  crash_cashout_min: number;
  crash_cashout_max: number;
  roulette_red_weight: number;
  roulette_black_weight: number;
  roulette_green_weight: number;
  pvp_max_ghost_rooms: number;
  pvp_room_ttl_sec_min: number;
  pvp_room_ttl_sec_max: number;
  pvp_stake_min_frac: number;
  pvp_stake_max_frac: number;
  chaos: number;
  updated_at?: string;
};

export type PresenceSnapshot = {
  online: number;
  by_game: {
    crash?: number;
    roulette?: number;
    pvp?: number;
  };
  updated_at: string;
};

export type AdminRiskSettings = {
  max_daily_win_nanoton: number;
  max_round_exposure_nanoton: number;
  whale_bet_threshold_nanoton: number;
  auto_review_withdraw_nanoton: number;
  hot_wallet_max_balance_nanoton: number;
  hot_wallet_sweep_threshold_nanoton: number;
  cold_wallet_address: string;
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
  wager_multiplier: number;
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
};

export type AdminUser = {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  betting_balance: number;
  is_banned: boolean;
  risk_flags: string[];
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

export type AdminAnalyticsOverview = {
  dau: number;
  wau: number;
  new_users: number;
  total_events_24h: number;
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

export async function getAdminGameConfigs() {
  return api<AdminGameConfig[]>("/api/v1/admin/games/configs");
}

export async function getAdminSocialSimSettings() {
  return api<AdminSocialSimSettings>("/api/v1/admin/social-sim");
}

export async function updateAdminSocialSimSettings(settings: AdminSocialSimSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/social-sim", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getPresence() {
  return api<PresenceSnapshot>("/api/v1/presence");
}

export async function updateAdminMarketListingPrice(id: string, priceNanoton: number) {
  return api<{ ok: boolean }>(`/api/v1/admin/market/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ price_nanoton: priceNanoton }),
  });
}

export type AdminGiftPriceSettings = {
  buy_adjust_percent: number;
  valuation_adjust_percent: number;
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

export async function getAdminUsers(query = "") {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return api<AdminUser[]>(`/api/v1/admin/users${q}`);
}

export async function getAdminUserBets(userId: string) {
  return api<unknown[]>(`/api/v1/admin/users/${userId}/bets`);
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

export async function getAdminBotSettings() {
  return api<AdminBotSettings>("/api/v1/admin/telegram/settings");
}

export async function updateAdminBotSettings(settings: AdminBotSettings) {
  return api<{ ok: boolean }>("/api/v1/admin/telegram/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
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
  wager_required_nanoton?: number;
  wager_progress_nanoton?: number;
  remaining_nanoton?: number;
  replaced_promo_code?: string;
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

export type TelegramBroadcast = {
  id: string;
  message: string;
  status: string;
  total_users: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  finished_at?: string;
};

export async function createAdminBroadcast(message: string) {
  return api<TelegramBroadcast>("/api/v1/admin/telegram/broadcast", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getAdminBroadcasts() {
  return api<TelegramBroadcast[]>("/api/v1/admin/telegram/broadcasts");
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
