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

/** Merge balance from a fresh /me response. */
export function patchUserSession(user: User, me: User): User {
  return {
    ...user,
    betting_balance: me.betting_balance,
  };
}
