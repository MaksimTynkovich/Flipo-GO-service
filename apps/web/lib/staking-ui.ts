import {
  getRuntimeLocale,
  localeDateTag,
  pluralIndex,
  translate,
  type MessageKey,
} from "@/lib/i18n";

export type StakingTier = "base" | "boost";

const MSK = "Europe/Moscow";
export const STAKING_DAYS_PER_MONTH = 30;
export const STAKING_MONTHS_PER_YEAR = 12;

export const STAKING_BASE_MONTHLY_PERCENT = 3;
export const STAKING_BOOST_MONTHLY_PERCENT = 4;
export const STAKING_STREAK_TARGET_DAYS = 6;
export const STAKING_STREAK_BONUS_MULTIPLIER = 2;
export const STAKING_STREAK_BONUS_PAYOUT_DAYS = 1;

/** Simple APR from monthly percent (3 → 36, 4 → 48). */
export function monthlyPercentToApr(monthlyPercent: number): number {
  if (!Number.isFinite(monthlyPercent) || monthlyPercent <= 0) return 0;
  return Math.round(monthlyPercent * STAKING_MONTHS_PER_YEAR * 10) / 10;
}

export function aprFromTier(tier?: StakingTier | null): number {
  if (tier === "boost") return monthlyPercentToApr(STAKING_BOOST_MONTHLY_PERCENT);
  if (tier === "base") return monthlyPercentToApr(STAKING_BASE_MONTHLY_PERCENT);
  return 0;
}

/** Доход за сутки из месячной оценки API. */
export function dailyYieldFromMonthly(monthlyNanoton: number): number {
  return Math.round(monthlyNanoton / STAKING_DAYS_PER_MONTH);
}

/** «28 июля» + «00:00 МСК» для баннера суточной эпохи. */
export function formatStakingEpochEnd(iso: string): { dateLine: string; timeLine: string } {
  const date = new Date(iso);
  const locale = localeDateTag(getRuntimeLocale());
  const dateLine = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    timeZone: MSK,
  });
  const timeLine =
    date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: MSK,
    }) +
    " " +
    translate(getRuntimeLocale(), "common.msk");

  return { dateLine, timeLine };
}

export function pluralizeGifts(count: number): string {
  const locale = getRuntimeLocale();
  const key = `staking.gifts.${pluralIndex(count, locale)}` as MessageKey;
  return translate(locale, key, { count });
}

/** Короткая подпись ставки в APR. */
export function formatStakingRate(tier?: StakingTier | null): string {
  const apr = aprFromTier(tier);
  return apr > 0 ? `${apr}% APR` : "—";
}

export function formatStakingApr(monthlyPercent: number): string {
  const apr = monthlyPercentToApr(monthlyPercent);
  return apr > 0 ? `${apr}% APR` : "—";
}

/** Название уровня доходности для пользователя. */
export function formatStakingTierName(tier?: StakingTier | null): string {
  const locale = getRuntimeLocale();
  if (tier === "boost") return translate(locale, "staking.tier.boost");
  if (tier === "base") return translate(locale, "staking.tier.base");
  return "—";
}

/** Одна строка: уровень и APR. */
export function formatStakingTierSummary(tier?: StakingTier | null): string {
  if (tier === "boost") return `${formatStakingTierName("boost")} · ${formatStakingRate("boost")}`;
  if (tier === "base") return `${formatStakingTierName("base")} · ${formatStakingRate("base")}`;
  return "—";
}

/** Пояснение, как получить повышенную ставку. */
export function stakingBoostHint(target = 10): string {
  return translate(getRuntimeLocale(), "staking.boostHint", {
    target,
    apr: formatStakingRate("boost"),
  });
}

export function stakingBoostReferralTarget(): number {
  return 10;
}

/** Пояснение, что подарки для стейка не нужно передавать боту. */
export function stakingNoTransferHint(): string {
  return translate(getRuntimeLocale(), "staking.noTransfer");
}

/** Серия re-stake: 6 дней подряд → на 7-й день ×2 к доходу → сброс. */
export function stakingStreakHint(
  current = 0,
  target = STAKING_STREAK_TARGET_DAYS,
  bonusActive = false,
  bonusDaysRemaining = 0,
): string {
  const locale = getRuntimeLocale();
  const mult = STAKING_STREAK_BONUS_MULTIPLIER;
  if (bonusActive && bonusDaysRemaining > 0) {
    return translate(locale, "staking.streakBonusDay", { mult });
  }
  if (current <= 0) {
    return translate(locale, "staking.streakStart", { target, mult });
  }
  const left = Math.max(0, target - current);
  if (left === 0) {
    return translate(locale, "staking.streakTomorrow", { current, target, mult });
  }
  return translate(locale, "staking.streakCollect");
}

/** Что стейкинг и доход — ежедневный цикл. */
export function stakingDailyCycleHint(): string {
  return translate(getRuntimeLocale(), "staking.dailyCycle");
}

export function pluralizePeople(count: number): string {
  const locale = getRuntimeLocale();
  const key = `staking.people.${pluralIndex(count, locale)}` as MessageKey;
  return translate(locale, key, { count });
}
