export type StakingTier = "base" | "boost";

/** Короткая подпись для плиток профиля. */
export function formatStakingRate(tier?: StakingTier | null): string {
  if (tier === "boost") return "5%/мес";
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
  if (tier === "boost") return "Повышенный · 5%/мес";
  if (tier === "base") return "Базовый · 3%/мес";
  return "—";
}

/** Пояснение, как получить повышенную ставку (без суммы — её рендерят с иконкой TON). */
export function stakingBoostHint(): string {
  return "в рулетке за 7 дней — доходность вырастет до 5%/мес";
}

export function stakingBoostThresholdTon(): number {
  return 5;
}
