export type WalletMessageType = "success" | "error" | "info";

export type WalletMessage = {
  type: WalletMessageType;
  text: string;
};

const MIN_TON_LABEL = "0.1 TON";

export function formatWalletError(
  error: unknown,
  context: "deposit" | "withdraw",
): string {
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

    if (raw && !raw.startsWith("Key:")) {
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
    case "queued":
      return "В очереди";
    case "broadcasting":
      return "Отправляется";
    case "completed":
      return "Завершено";
    case "failed":
      return "Ошибка";
    case "expired":
      return "Истекло";
    default:
      return status;
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
