/** L1 share of referral monthly staking yield (matches backend). */
export const REFERRAL_L1_MONTHLY_SHARE = 0.05;

const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;

/** Referrer weekly bonus from one referral's monthly staking yield. */
export function referralWeeklyFromMonthlyYield(monthlyYieldNanoton: number): number {
  if (monthlyYieldNanoton <= 0) return 0;
  const monthlyBonus = monthlyYieldNanoton * REFERRAL_L1_MONTHLY_SHARE;
  return Math.floor((monthlyBonus * DAYS_PER_WEEK) / DAYS_PER_MONTH);
}

/** Referrer weekly bonus when referral stakes `principalNanoton` at `monthlyRate` (e.g. 0.03). */
export function referralWeeklyFromPrincipal(
  principalNanoton: number,
  monthlyRate = 0.03,
): number {
  const monthlyYield = Math.floor(principalNanoton * monthlyRate);
  return referralWeeklyFromMonthlyYield(monthlyYield);
}

/** Monthly share as percent string for UI. */
export const REFERRAL_MONTHLY_SHARE_PERCENT = REFERRAL_L1_MONTHLY_SHARE * 100;

/** Effective weekly share of referral yield (5% × 7/30). */
export const REFERRAL_WEEKLY_SHARE_PERCENT =
  REFERRAL_L1_MONTHLY_SHARE * (DAYS_PER_WEEK / DAYS_PER_MONTH) * 100;

export const REFERRAL_GGR_SHARE_PERCENT = 5;
export const REFERRAL_INVITEE_BOOST_PERCENT = 0.5;
export const REFERRAL_INVITEE_LIMIT_BONUS_TON = 20;

const PENDING_REFERRAL_KEY = "flipo_pending_referral";

export function storePendingReferral(code: string) {
  if (typeof window === "undefined" || !code) return;
  localStorage.setItem(PENDING_REFERRAL_KEY, code);
}

export function takePendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  const code = localStorage.getItem(PENDING_REFERRAL_KEY);
  if (code) localStorage.removeItem(PENDING_REFERRAL_KEY);
  return code;
}

export function readStartParamFromTelegram(): string | undefined {
  const webApp = window.Telegram?.WebApp as { initDataUnsafe?: { start_param?: string } } | undefined;
  const param = webApp?.initDataUnsafe?.start_param?.trim();
  return param || undefined;
}

export function isReferralStartParam(param: string | undefined | null): boolean {
  if (!param) return false;
  const value = param.trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith("ref_")) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Referral payload only. Campaign / other start_param values are ignored. */
export function readReferralCodeFromTelegram(): string | undefined {
  const param = readStartParamFromTelegram();
  return isReferralStartParam(param) ? param : undefined;
}
