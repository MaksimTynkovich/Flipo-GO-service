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
        ? "Недостаточно средств. Учтите комиссию — она добавляется к сумме списания."
        : "Недостаточно средств на балансе.";
    }

    if (
      lower.includes("wallet not linked") ||
      lower.includes("подключи ton-кошелёк") ||
      lower.includes("подключите ton-кошелёк")
    ) {
      return "Сначала подключите TON-кошелёк.";
    }

    if (lower.includes("invalid amount") || lower.includes("корректную сумму")) {
      return context === "withdraw"
        ? `Минимальная сумма вывода на кошелёк — ${MIN_TON_LABEL}.`
        : `Минимальное пополнение — ${MIN_TON_LABEL}.`;
    }

    if (lower.includes("transfer expired") || lower.includes("время на оплату истекло")) {
      return "Время на оплату истекло. Создайте новое пополнение.";
    }

    if (lower.includes("transfer already pending") || lower.includes("активная операция")) {
      return "У вас уже есть активная операция. Дождитесь её завершения.";
    }

    if (lower.includes("chain verification unavailable") || lower.includes("ton временно недоступен")) {
      return "Сервис TON временно недоступен. Попробуйте через пару минут.";
    }

    if (lower.includes("failed to fetch") || lower.includes("network")) {
      return "Нет связи с сервером. Проверьте интернет и попробуйте снова.";
    }

    if (raw && !raw.startsWith("Key:") && /[а-яё]/i.test(raw)) {
      return raw;
    }
  }

  return context === "withdraw"
    ? "Не удалось создать вывод. Попробуйте ещё раз."
    : "Не удалось выполнить пополнение. Попробуйте ещё раз.";
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
