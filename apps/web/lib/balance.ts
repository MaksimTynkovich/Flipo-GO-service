import type { User } from "@/lib/api";

export function mainBalanceNanoton(user: Pick<User, "betting_balance" | "promo_balance">): number {
  return Math.max(0, user.betting_balance - (user.promo_balance ?? 0));
}

export function hasPromoBalance(user: Pick<User, "promo_balance">): boolean {
  return (user.promo_balance ?? 0) > 0;
}
