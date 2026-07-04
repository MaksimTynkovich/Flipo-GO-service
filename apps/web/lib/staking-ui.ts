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

/** Пояснение, как получить повышенную ставку. */
export function stakingBoostHint(thresholdTon = 5): string {
  return `${thresholdTon} TON в рулетке за 7 дней — доходность вырастет до 5%/мес`;
}
