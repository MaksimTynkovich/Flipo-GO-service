export type StakingTier = "base" | "boost";

const MSK = "Europe/Moscow";
export const STAKING_DAYS_PER_WEEK = 7;
export const STAKING_DAYS_PER_MONTH = 30;

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

/** Короткая подпись для плиток профиля. */
export function formatStakingRate(tier?: StakingTier | null): string {
  if (tier === "boost") return "4%/мес";
  if (tier === "base") return "3%/мес";
  return "—";
}

/** Название уровня доходности для пользователя. */
export function formatStakingTierName(tier?: StakingTier | null): string {
  if (tier === "boost") return "Повышенный";
  if (tier === "base") return "Базовый";
  return "—";
}

/** Одна строка: уровень и ставка. */
export function formatStakingTierSummary(tier?: StakingTier | null): string {
  if (tier === "boost") return "Повышенный · 4%/мес";
  if (tier === "base") return "Базовый · 3%/мес";
  return "—";
}

/** Пояснение, как получить повышенную ставку. */
export function stakingBoostHint(target = 15): string {
  return `пригласи ${target} человек — повышенный процент до конца месяца`;
}

export function stakingBoostReferralTarget(): number {
  return 15;
}

export function pluralizePeople(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} человек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} человека`;
  return `${count} человек`;
}
