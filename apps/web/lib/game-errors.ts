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
  if (lower.includes("invalid amount") || lower.includes("корректную сумму")) {
    return "Укажите корректную сумму ставки.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Нет связи с сервером. Проверь интернет и попробуй снова.";
  }
  if (raw.startsWith("Key:") || lower.includes("binding")) {
    return "Не удалось сделать ставку. Проверьте данные и попробуйте снова.";
  }

  return raw;
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
