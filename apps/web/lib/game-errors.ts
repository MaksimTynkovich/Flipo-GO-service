import { formatUserError } from "@/lib/user-errors";
import { getRuntimeLocale, translate, type MessageKey } from "@/lib/i18n";

function t(key: MessageKey): string {
  return translate(getRuntimeLocale(), key);
}

export function formatGameBetError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  if (!raw) return t("errors.placeBet");

  const lower = raw.toLowerCase();

  if (lower.includes("insufficient balance") || lower.includes("недостаточно средств")) {
    return t("errors.insufficientBalance");
  }
  if (lower.includes("round not accepting bets") || lower.includes("ставки больше не принимаются")) {
    return t("errors.betsClosed");
  }
  if (lower.includes("invalid amount") || lower.includes("корректную сумму") || lower.includes("некорректная сумма")) {
    return t("errors.invalidBetAmount");
  }
  if (lower.includes("gift not available") || lower.includes("подарок недоступен")) {
    return t("errors.giftNotForBet");
  }
  if (lower.includes("gift value") || lower.includes("стоимость подарка") || lower.includes("±10%")) {
    return t("errors.giftValue");
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return t("errors.network");
  }
  if (raw.startsWith("Key:") || lower.includes("binding")) {
    return t("errors.placeBetRetry");
  }

  return formatUserError(raw, t("errors.placeBet"));
}

export function roulettePhaseBetMessage(phase?: string | null): string {
  switch (phase) {
    case "spinning":
      return t("errors.roulette.spinning");
    case "result":
      return t("errors.roulette.result");
    case "waiting":
      return t("errors.roulette.waiting");
    default:
      return t("errors.betsClosed");
  }
}

export function crashPhaseBetMessage(phase?: string | null): string {
  switch (phase) {
    case "running":
      return t("errors.crash.running");
    case "crashed":
      return t("errors.crash.crashed");
    case "waiting":
      return t("errors.crash.waiting");
    default:
      return t("errors.betsClosed");
  }
}

export function crashCashoutMessage(phase?: string | null): string {
  if (phase === "crashed") return t("errors.crash.alreadyOver");
  if (phase === "betting") return t("errors.crash.notStarted");
  return t("errors.crash.cashoutFailed");
}
