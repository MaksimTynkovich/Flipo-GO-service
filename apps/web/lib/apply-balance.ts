import type { User } from "@/lib/api";

export function patchUserBalance(
  user: User,
  patch: { betting_balance?: number; promo_balance?: number },
): User {
  return {
    ...user,
    ...(patch.betting_balance != null ? { betting_balance: patch.betting_balance } : {}),
    ...(patch.promo_balance != null ? { promo_balance: patch.promo_balance } : {}),
  };
}
