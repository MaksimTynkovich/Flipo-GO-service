/** Prize rarity grades — shared by prize list and reel strip. */
export type PrizeTier = "common" | "rare" | "mythic" | "immortal";

export const RARE_MIN_NANOTON = 250_000_000; // 0.25 TON
export const MYTHIC_MIN_NANOTON = 1_000_000_000; // 1.00 TON
export const IMMORTAL_MIN_NANOTON = 5_000_000_000; // 5.00 TON

export function prizeTierForAmount(amount: number, isMax = false): PrizeTier {
  if (isMax || amount >= IMMORTAL_MIN_NANOTON) return "immortal";
  if (amount >= MYTHIC_MIN_NANOTON) return "mythic";
  if (amount >= RARE_MIN_NANOTON) return "rare";
  return "common";
}

export function maxPrizeNanoton(amounts: Iterable<number>): number {
  let max = 0;
  for (const n of amounts) {
    if (n > max) max = n;
  }
  return max;
}
