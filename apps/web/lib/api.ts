import { getTelegramWebApp } from "@/src/shared/lib/twa";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
const NGROK_API = API_URL.includes("ngrok-free.app") || API_URL.includes("ngrok.io");
export const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
export const AUTH_SESSION_REFRESHED = "flipo:auth-session-refreshed";

const TOKEN_KEY = "flipo_token";
const AUTH_PATHS = new Set(["/api/v1/auth/telegram", "/api/v1/auth/debug"]);

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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(NGROK_API ? { "ngrok-skip-browser-warning": "1" } : {}),
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
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
    throw new Error(err.error || "Request failed");
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
  return api<{ balance: number }>(`/api/v1/inventory/${id}/liquidate`, { method: "POST" });
}

export async function withdrawGiftItem(id: string) {
  return api<{ ok: boolean }>(`/api/v1/inventory/${id}/withdraw`, { method: "POST" });
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
  round_id: string;
  round_number: number;
  number: number;
  color: string;
};

export async function getRouletteHistory() {
  return api<RouletteHistoryEntry[]>("/api/v1/games/roulette/history");
}

export type RouletteBetEntry = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  photo_url?: string;
  color: "red" | "green" | "black" | string;
  amount_nanoton: number;
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
  status: "pending" | "cashed_out" | "lost" | string;
  cashout_multiplier?: number;
  payout_nanoton?: number;
};

export type CrashRoundBets = {
  round_id: string;
  bets: CrashBetEntry[];
};

export async function getCrashBets() {
  return api<CrashRoundBets>("/api/v1/games/crash/bets");
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
  boost_wager_nanoton: number;
  boost_threshold_nanoton: number;
  monthly_rate_percent: number;
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

export async function getStakingPositions() {
  return api<StakingPosition[]>("/api/v1/staking/positions");
}

export async function unstakeGift(positionId: string) {
  return api<{ ok: boolean }>(`/api/v1/staking/unstake/${positionId}`, { method: "POST" });
}

export async function stakeGift(opts: { slug?: string; itemId?: string }) {
  const body = opts.itemId ? { item_id: opts.itemId } : { slug: opts.slug };
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function stakeItem(itemId: string) {
  return api("/api/v1/staking/stake", {
    method: "POST",
    body: JSON.stringify({ item_id: itemId }),
  });
}

export function formatTON(nanotons: number): string {
  if (nanotons <= 0) return "0";
  const ton = nanotons / 1_000_000_000;
  let prec = 2;
  if (ton < 0.01) prec = 6;
  else if (ton < 1) prec = 4;
  return ton.toFixed(prec).replace(/\.?0+$/, "");
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

export type ReferralStats = {
  referral_count: number;
  total_earned_nanoton: number;
  share_percent: number;
  share_percent_weekly: number;
  example_weekly_per_referral_ton: string;
};

export async function getReferralStats() {
  return api<ReferralStats>("/api/v1/referrals/stats");
}

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
  return api<WalletDepositIntent>("/api/v1/wallet/deposit/intent", {
    method: "POST",
    body: JSON.stringify({ amount_nanoton: amountNanoton }),
  });
}

export async function confirmWalletDeposit(transferId: string, txHash?: string) {
  return api<{ transfer: WalletTransfer; balance: number }>(
    `/api/v1/wallet/deposit/${transferId}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({ tx_hash: txHash || "" }),
    },
  );
}

export async function requestWalletWithdraw(amountNanoton: number, idempotencyKey: string) {
  return api<{ transfer: WalletTransfer; balance: number }>("/api/v1/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({
      amount_nanoton: amountNanoton,
      idempotency_key: idempotencyKey,
    }),
  });
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

export async function getAdminPromoCodes() {
  return api<AdminPromoCode[]>("/api/v1/admin/marketing/promos");
}

export async function upsertAdminPromoCode(promo: AdminPromoCode) {
  return api<{ ok: boolean }>("/api/v1/admin/marketing/promos", {
    method: "PUT",
    body: JSON.stringify(promo),
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
};

export async function activatePromoCode(code: string) {
  return api<PromoStatus>("/api/v1/promos/activate", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
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
