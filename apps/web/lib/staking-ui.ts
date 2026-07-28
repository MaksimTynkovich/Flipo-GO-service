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
  const dateLine = date.toLocaleDateString("ru-RU", {
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
export function stakingBoostHint(target = 10): string {
  return `Пригласи ${target} друзей за месяц — ${formatStakingRate("boost")} до конца месяца`;
}

export function stakingBoostReferralTarget(): number {
  return 10;
}

/** Пояснение, что подарки для стейка не нужно передавать боту. */
export function stakingNoTransferHint(): string {
  return "Подарки остаются у вас в профиле — передавать боту для стейкинга не нужно";
}

/** Серия re-stake: 6 дней подряд → на 7-й день ×2 к доходу → сброс. */
export function stakingStreakHint(
  current = 0,
  target = STAKING_STREAK_TARGET_DAYS,
  bonusActive = false,
  bonusDaysRemaining = 0,
): string {
  if (bonusActive && bonusDaysRemaining > 0) {
    return `Бонусный день: доход ×${STAKING_STREAK_BONUS_MULTIPLIER} · застейкайте сегодня`;
  }
  if (current <= 0) {
    return `Застейкайте ${target} дней подряд — на 7-й день доход ×${STAKING_STREAK_BONUS_MULTIPLIER}`;
  }
  const left = Math.max(0, target - current);
  if (left === 0) {
    return `Серия ${current}/${target} · завтра доход ×${STAKING_STREAK_BONUS_MULTIPLIER}`;
  }
  return `Серия ${current}/${target} · ещё ${left} ${left === 1 ? "день" : left < 5 ? "дня" : "дней"} до ×${STAKING_STREAK_BONUS_MULTIPLIER}`;
}

/** Что стейкинг и доход — ежедневный цикл. */
export function stakingDailyCycleHint(): string {
  return "Стейкинг ежедневный: застейкайте сегодня → ночью выплата → завтра снова добавьте в стейк";
}

export function pluralizePeople(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} человек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} человека`;
  return `${count} человек`;
}
