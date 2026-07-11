import { formatUserError } from "@/lib/user-errors";

export function formatGameBetError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  if (!raw) return "Не удалось сделать ставку. Попробуй ещё раз.";

  const lower = raw.toLowerCase();

  if (lower.includes("insufficient balance") || lower.includes("недостаточно средств")) {
    return "Недостаточно средств на балансе.";
  }
  if (lower.includes("round not accepting bets") || lower.includes("ставки больше не принимаются")) {
    return "Ставки больше не принимаются.";
  }
  if (lower.includes("invalid amount") || lower.includes("корректную сумму") || lower.includes("некорректная сумма")) {
    return "Укажите корректную сумму ставки.";
  }
  if (lower.includes("gift not available") || lower.includes("подарок недоступен")) {
    return "Подарок недоступен для ставки.";
  }
  if (lower.includes("gift value") || lower.includes("стоимость подарка") || lower.includes("±10%")) {
    return "Сумма подарка не подходит для ставки в этой комнате.";
  }
  if (lower.includes("room is full") || lower.includes("комната уже заполнена")) {
    return "Комната уже заполнена.";
  }
  if (lower.includes("already joined") || lower.includes("уже в этой комнате")) {
    return "Вы уже в этой комнате.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Нет связи с сервером. Проверь интернет и попробуй снова.";
  }
  if (raw.startsWith("Key:") || lower.includes("binding")) {
    return "Не удалось сделать ставку. Проверьте данные и попробуйте снова.";
  }

  return formatUserError(raw, "Не удалось сделать ставку. Попробуй ещё раз.");
}

export function roulettePhaseBetMessage(phase?: string | null): string {
  switch (phase) {
    case "spinning":
      return "Колесо уже крутится — ставки закрыты.";
    case "result":
      return "Раунд завершён. Дождитесь следующего.";
    case "waiting":
      return "Ожидаем новый раунд.";
    default:
      return "Ставки больше не принимаются.";
  }
}

export function crashPhaseBetMessage(phase?: string | null): string {
  switch (phase) {
    case "running":
      return "Раунд уже идёт — ставки закрыты.";
    case "crashed":
      return "Раунд завершён. Дождитесь следующего.";
    case "waiting":
      return "Ожидаем новый раунд.";
    default:
      return "Ставки больше не принимаются.";
  }
}

export function crashCashoutMessage(phase?: string | null): string {
  if (phase === "crashed") return "Раунд уже завершён.";
  if (phase === "betting") return "Раунд ещё не начался.";
  return "Не удалось забрать выигрыш.";
}
