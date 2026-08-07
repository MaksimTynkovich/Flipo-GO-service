import { formatTON } from "@/lib/api";

export type WagerSnapshot = {
  betting_balance?: number;
  wager_required_nanoton?: number;
  wager_progress_nanoton?: number;
  wager_remaining_nanoton?: number;
  withdrawable_nanoton?: number;
};

export type WagerBlockContext = {
  withdrawFeeNanoton?: number;
};

function remainingFromSnapshot(snapshot: WagerSnapshot): number {
  if (typeof snapshot.wager_remaining_nanoton === "number") {
    return Math.max(0, snapshot.wager_remaining_nanoton);
  }
  const required = snapshot.wager_required_nanoton ?? 0;
  const progress = snapshot.wager_progress_nanoton ?? 0;
  return Math.max(0, required - progress);
}

/** Mirror of domain.WithdrawableDebitCap: min(balance, progress) while remaining > 0. */
export function withdrawableDebitCap(
  balance: number,
  required: number,
  progress: number,
): number {
  if (balance <= 0) return 0;
  const remaining = Math.max(0, required - progress);
  if (remaining <= 0) return Math.max(0, balance);
  if (progress <= 0) return 0;
  return Math.min(balance, progress);
}

function withdrawableFromSnapshot(snapshot: WagerSnapshot): number {
  if (typeof snapshot.withdrawable_nanoton === "number") {
    return Math.max(0, snapshot.withdrawable_nanoton);
  }
  return withdrawableDebitCap(
    snapshot.betting_balance ?? 0,
    snapshot.wager_required_nanoton ?? 0,
    snapshot.wager_progress_nanoton ?? 0,
  );
}

/** User-facing copy when deposit playthrough blocks a withdraw. */
export function formatWagerBlockedMessage(
  snapshot: WagerSnapshot,
  context: WagerBlockContext = {},
): string {
  const required = Math.max(0, snapshot.wager_required_nanoton ?? 0);
  const progress = Math.max(0, snapshot.wager_progress_nanoton ?? 0);
  const remaining = remainingFromSnapshot(snapshot);
  const withdrawable = withdrawableFromSnapshot(snapshot);
  const fee = Math.max(0, context.withdrawFeeNanoton ?? 0);
  const receiveCap = Math.max(0, withdrawable - fee);

  if (remaining > 0) {
    if (receiveCap <= 0) {
      return `Вывод недоступен — сначала отыграйте депозит. Отыграно ${formatTON(progress)} из ${formatTON(required)} TON · доступно к выводу 0 TON.`;
    }
    return `Доступно к выводу: ${formatTON(receiveCap)} TON · отыграно ${formatTON(progress)} из ${formatTON(required)} TON.`;
  }

  return `Доступно к выводу: ${formatTON(receiveCap)} TON.`;
}

type WagerErrorPayload = {
  code?: string;
  message?: string;
  wager_required_nanoton?: number;
  wager_progress_nanoton?: number;
  wager_remaining_nanoton?: number;
  withdrawable_nanoton?: number;
  gift_value_nanoton?: number;
};

function readWagerPayload(error: unknown): WagerErrorPayload | null {
  if (!error || typeof error !== "object") return null;
  const err = error as WagerErrorPayload & { error?: string };
  const code = err.code;
  if (code !== "wager_incomplete") return null;
  return {
    code,
    message: typeof err.message === "string" ? err.message : undefined,
    wager_required_nanoton: err.wager_required_nanoton,
    wager_progress_nanoton: err.wager_progress_nanoton,
    wager_remaining_nanoton: err.wager_remaining_nanoton,
    withdrawable_nanoton: err.withdrawable_nanoton,
    gift_value_nanoton: err.gift_value_nanoton,
  };
}

/** Map API wager_incomplete (and optional /me fallback) to informative Russian copy. */
export function formatWagerIncompleteError(
  error: unknown,
  fallbackUser?: WagerSnapshot | null,
  context: WagerBlockContext = {},
): string | null {
  const payload = readWagerPayload(error);
  if (!payload) {
    if (error instanceof Error) {
      const raw = error.message.trim();
      if (raw.includes("Доступно к выводу") || raw.includes("отыграно")) {
        return raw;
      }
    }
    return null;
  }

  const hasFields =
    typeof payload.wager_required_nanoton === "number" ||
    typeof payload.wager_progress_nanoton === "number" ||
    typeof payload.withdrawable_nanoton === "number";

  if (hasFields || fallbackUser) {
    return formatWagerBlockedMessage(
      {
        betting_balance: fallbackUser?.betting_balance,
        wager_required_nanoton:
          payload.wager_required_nanoton ?? fallbackUser?.wager_required_nanoton,
        wager_progress_nanoton:
          payload.wager_progress_nanoton ?? fallbackUser?.wager_progress_nanoton,
        wager_remaining_nanoton:
          payload.wager_remaining_nanoton ?? fallbackUser?.wager_remaining_nanoton,
        withdrawable_nanoton:
          payload.withdrawable_nanoton ?? fallbackUser?.withdrawable_nanoton,
      },
      {
        withdrawFeeNanoton: context.withdrawFeeNanoton,
      },
    );
  }

  const apiMessage = payload.message?.trim();
  if (apiMessage && !apiMessage.toLowerCase().includes("сначала отыграйте депозит")) {
    return apiMessage;
  }

  if (fallbackUser) {
    return formatWagerBlockedMessage(fallbackUser, context);
  }

  return "Вывод недоступен — сначала отыграйте депозит.";
}
