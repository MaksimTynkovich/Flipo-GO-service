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

/** Merge balance + deposit wager fields from a fresh /me response. */
export function patchUserSession(user: User, me: User): User {
  return {
    ...user,
    betting_balance: me.betting_balance,
    wager_required_nanoton: me.wager_required_nanoton,
    wager_progress_nanoton: me.wager_progress_nanoton,
    wager_remaining_nanoton: me.wager_remaining_nanoton,
    withdrawable_nanoton: me.withdrawable_nanoton,
  };
}
