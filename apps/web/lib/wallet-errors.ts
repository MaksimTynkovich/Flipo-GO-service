import { getRuntimeLocale, translate, type MessageKey } from "@/lib/i18n";

export type WalletMessageType = "success" | "error" | "info";

export type WalletMessage = {
  type: WalletMessageType;
  text: string;
};

const MIN_TON_LABEL = "0.1 TON";

function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(getRuntimeLocale(), key, params);
}

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
      return t("errors.operationCancelled");
    }

    if (lower.includes("insufficient balance") || lower.includes("недостаточно средств")) {
      return context === "withdraw" ? t("errors.insufficientFee") : t("errors.insufficientBalance");
    }

    if (
      lower.includes("wallet not linked") ||
      lower.includes("подключи ton-кошелёк") ||
      lower.includes("подключите ton-кошелёк")
    ) {
      return t("errors.connectWallet");
    }

    if (lower.includes("invalid amount") || lower.includes("корректную сумму")) {
      return context === "withdraw"
        ? t("errors.minWithdraw", { min: MIN_TON_LABEL })
        : t("errors.minDeposit", { min: MIN_TON_LABEL });
    }

    if (lower.includes("transfer expired") || lower.includes("время на оплату истекло")) {
      return t("errors.paymentExpired");
    }

    if (lower.includes("transfer already pending") || lower.includes("активная операция")) {
      return t("errors.activeTransfer");
    }

    if (lower.includes("chain verification unavailable") || lower.includes("ton временно недоступен")) {
      return t("errors.tonUnavailable");
    }

    if (lower.includes("failed to fetch") || lower.includes("network")) {
      return t("errors.network");
    }

    if (raw && !raw.startsWith("Key:") && /[а-яё]/i.test(raw) && getRuntimeLocale() === "ru") {
      return raw;
    }
  }

  return context === "withdraw" ? t("errors.withdrawFailed") : t("errors.depositFailed");
}

export function walletStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_payment":
      return t("wallet.awaiting_payment");
    case "pending_review":
      return t("wallet.pending_review");
    case "queued":
      return t("wallet.queued");
    case "broadcasting":
      return t("wallet.broadcasting");
    case "completed":
      return t("wallet.completed");
    case "failed":
      return t("wallet.failed");
    case "rejected":
      return t("wallet.rejected");
    case "expired":
      return t("wallet.expired");
    default:
      return t("wallet.processing");
  }
}

export function formatTransferDate(iso: string): string {
  const locale = getRuntimeLocale() === "ru" ? "ru-RU" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
