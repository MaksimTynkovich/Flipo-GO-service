import type { User } from "@/lib/api";

export function patchUserBalance(
  user: User,
  patch: { betting_balance?: number },
): User {
  return {
    ...user,
    ...(patch.betting_balance != null ? { betting_balance: patch.betting_balance } : {}),
  };
}
