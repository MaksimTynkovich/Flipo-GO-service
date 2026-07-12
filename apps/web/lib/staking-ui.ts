export type StakingTier = "base" | "boost";

const MSK = "Europe/Moscow";
export const STAKING_DAYS_PER_WEEK = 7;
export const STAKING_DAYS_PER_MONTH = 30;
export const STAKING_MONTHS_PER_YEAR = 12;

export const STAKING_BASE_MONTHLY_PERCENT = 3;
export const STAKING_BOOST_MONTHLY_PERCENT = 4;

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

/** Доход за неделю из дневного начисления (7 дней эпохи). */
export function weeklyYieldNanoton(dailyNanoton: number): number {
  return dailyNanoton * STAKING_DAYS_PER_WEEK;
}

/** Доход за неделю из месячной оценки API. */
export function weeklyYieldFromMonthly(monthlyNanoton: number): number {
  return Math.round((monthlyNanoton * STAKING_DAYS_PER_WEEK) / STAKING_DAYS_PER_MONTH);
}

/** «понедельник, 6 июля» + «00:00 МСК» для баннера недели. */
export function formatStakingEpochEnd(iso: string): { dateLine: string; timeLine: string } {
  const date = new Date(iso);
  const dateLine = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: MSK,
  });
  const timeLine =
    date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: MSK,
    }) + " МСК";

  return { dateLine, timeLine };
}

export function pluralizeGifts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} подарок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} подарка`;
  return `${count} подарков`;
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
  if (tier === "boost") return "Повышенный";
  if (tier === "base") return "Базовый";
  return "—";
}

/** Одна строка: уровень и APR. */
export function formatStakingTierSummary(tier?: StakingTier | null): string {
  if (tier === "boost") return `Повышенный · ${formatStakingRate("boost")}`;
  if (tier === "base") return `Базовый · ${formatStakingRate("base")}`;
  return "—";
}

/** Пояснение, как получить повышенную ставку. */
export function stakingBoostHint(target = 20): string {
  return `Пригласи ${target} друзей за месяц — ${formatStakingRate("boost")} до конца месяца`;
}

export function stakingBoostReferralTarget(): number {
  return 20;
}

export function pluralizePeople(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} человек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} человека`;
  return `${count} человек`;
}
