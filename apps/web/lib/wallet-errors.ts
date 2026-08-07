export type WalletMessageType = "success" | "error" | "info";

export type WalletMessage = {
  type: WalletMessageType;
  text: string;
};

const MIN_TON_LABEL = "0.1 TON";

function formatTonLabel(nanoton: number): string {
  const ton = nanoton / 1_000_000_000;
  const fixed3 = ton.toFixed(3);
  if (fixed3.endsWith("0")) return ton.toFixed(2);
  return fixed3;
}

/** Prefer API wager_incomplete payload for withdraw copy. */
export function formatWagerIncompleteError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const err = error as {
    code?: string;
    message?: string;
    wager_required_nanoton?: number;
    wager_progress_nanoton?: number;
    withdrawable_nanoton?: number;
    gift_value_nanoton?: number;
  };
  if (err.code !== "wager_incomplete") return null;

  const progress = typeof err.wager_progress_nanoton === "number" ? err.wager_progress_nanoton : null;
  const required = typeof err.wager_required_nanoton === "number" ? err.wager_required_nanoton : null;
  const giftValue = typeof err.gift_value_nanoton === "number" ? err.gift_value_nanoton : null;
  const withdrawable =
    typeof err.withdrawable_nanoton === "number" ? err.withdrawable_nanoton : null;

  if (progress != null && required != null && giftValue != null && giftValue > 0) {
    return `Отыграно ${formatTonLabel(progress)} из ${formatTonLabel(required)} TON. Для вывода подарка нужно ${formatTonLabel(giftValue)} TON отыгрыша (доступно ${formatTonLabel(progress)}).`;
  }
  if (progress != null && required != null && withdrawable != null) {
    return `Отыграно ${formatTonLabel(progress)} из ${formatTonLabel(required)} TON. Можно вывести до ${formatTonLabel(withdrawable)} TON.`;
  }
  if (typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }
  return "Сначала отыграйте депозит.";
}

export function formatWalletError(
  error: unknown,
  context: "deposit" | "withdraw",
): string {
  const wagerMsg = formatWagerIncompleteError(error);
  if (wagerMsg) return wagerMsg;

  if (error instanceof Error) {
    const raw = error.message.trim();
    const lower = raw.toLowerCase();

    if (
      lower.includes("reject") ||
      lower.includes("cancel") ||
      lower.includes("declined") ||
      lower.includes("user denied")
    ) {
      return "Операция отменена в кошельке.";
    }

    if (lower.includes("insufficient balance") || lower.includes("недостаточно средств")) {
      return context === "withdraw"
        ? "Недостаточно средств. Учти комиссию — она добавляется к сумме списания."
        : "Недостаточно средств на балансе.";
    }

    if (
      lower.includes("wager") ||
      lower.includes("отыграйте депозит") ||
      lower.includes("отыграть депозит") ||
      lower.includes("отыграно")
    ) {
      return raw && /[а-яё]/i.test(raw) ? raw : "Сначала отыграйте депозит.";
    }

    if (lower.includes("wallet not linked") || lower.includes("подключи ton-кошелёк")) {
      return "Сначала подключи TON-кошелёк.";
    }

    if (lower.includes("invalid amount") || lower.includes("корректную сумму")) {
      return context === "withdraw"
        ? `Минимальная сумма вывода на кошелёк — ${MIN_TON_LABEL}.`
        : `Минимальное пополнение — ${MIN_TON_LABEL}.`;
    }

    if (lower.includes("transfer expired") || lower.includes("время на оплату истекло")) {
      return "Время на оплату истекло. Создай новое пополнение.";
    }

    if (lower.includes("transfer already pending") || lower.includes("активная операция")) {
      return "У тебя уже есть активная операция. Дождись её завершения.";
    }

    if (lower.includes("chain verification unavailable") || lower.includes("ton временно недоступен")) {
      return "Сервис TON временно недоступен. Попробуй через пару минут.";
    }

    if (lower.includes("failed to fetch") || lower.includes("network")) {
      return "Нет связи с сервером. Проверь интернет и попробуй снова.";
    }

    if (raw && !raw.startsWith("Key:") && /[а-яё]/i.test(raw)) {
      return raw;
    }
  }

  return context === "withdraw"
    ? "Не удалось создать вывод. Попробуй ещё раз."
    : "Не удалось выполнить пополнение. Попробуй ещё раз.";
}

export function walletStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_payment":
      return "Ожидает оплату";
    case "pending_review":
      return "В ожидании";
    case "queued":
      return "В очереди";
    case "broadcasting":
      return "Отправляется";
    case "completed":
      return "Завершено";
    case "failed":
      return "Ошибка";
    case "rejected":
      return "Отклонён";
    case "expired":
      return "Истекло";
    default:
      return "В обработке";
  }
}

export function formatTransferDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
