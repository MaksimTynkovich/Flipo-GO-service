/** L1 share of referral monthly staking yield (matches backend). */
export const REFERRAL_L1_MONTHLY_SHARE = 0.005;

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

/** Effective weekly share of referral yield (0.5% × 7/30). */
export const REFERRAL_WEEKLY_SHARE_PERCENT =
  REFERRAL_L1_MONTHLY_SHARE * (DAYS_PER_WEEK / DAYS_PER_MONTH) * 100;

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

export function readReferralCodeFromTelegram(): string | undefined {
  const webApp = window.Telegram?.WebApp as { initDataUnsafe?: { start_param?: string } } | undefined;
  return webApp?.initDataUnsafe?.start_param || undefined;
}
