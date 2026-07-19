/** Map API/client errors to concise Russian copy for UI surfaces. */
export function formatUserError(
  error: unknown,
  fallback = "Что-то пошло не так. Попробуйте ещё раз.",
): string {
  const raw =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  if (!raw) return fallback;

  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("load failed")) {
    return "Нет связи с сервером. Проверьте интернет.";
  }
  if (raw.startsWith("Key:") || lower.includes("binding") || lower.includes("field validation")) {
    return fallback;
  }

  const rules: Array<[RegExp | string, string]> = [
    ["недостаточно средств", "Недостаточно средств"],
    ["insufficient balance", "Недостаточно средств"],
    ["ставки больше не принимаются", "Ставки больше не принимаются"],
    ["round not accepting bets", "Ставки больше не принимаются"],
    ["комната уже заполнена", "Комната уже заполнена"],
    ["room is full", "Комната уже заполнена"],
    ["вы уже в этой комнате", "Вы уже в этой комнате"],
    ["already joined", "Вы уже в этой комнате"],
    ["предмет уже выставлен", "Предмет уже на маркете"],
    ["item already listed", "Предмет уже на маркете"],
    ["кошелёк не подключён", "Сначала подключите TON-кошелёк"],
    ["wallet not linked", "Сначала подключите TON-кошелёк"],
    ["недействительный токен", "Сессия истекла. Откройте приложение снова"],
    ["invalid token", "Сессия истекла. Откройте приложение снова"],
    ["неверные данные telegram", "Не удалось войти через Telegram"],
    ["invalid telegram init data", "Не удалось войти через Telegram"],
    ["данные telegram устарели", "Данные Telegram устарели. Откройте приложение снова"],
    ["telegram init data expired", "Данные Telegram устарели. Откройте приложение снова"],
    ["требуется авторизация", "Требуется авторизация"],
    ["missing authorization", "Требуется авторизация"],
    ["аккаунт заблокирован", "Аккаунт заблокирован"],
    ["account suspended", "Аккаунт заблокирован"],
    ["игра временно недоступна", "Игра временно недоступна"],
    ["game disabled", "Игра временно недоступна"],
    ["техническое обслуживание", "Техническое обслуживание"],
    ["maintenance", "Техническое обслуживание"],
    ["лот не найден", "Лот не найден"],
    ["listing not found", "Лот не найден"],
    ["не найдено", "Не найдено"],
    ["not found", "Не найдено"],
    ["доступ запрещён", "Доступ запрещён"],
    ["forbidden", "Доступ запрещён"],
    ["бонус нельзя тратить", "Бонус нельзя тратить на маркет"],
    ["promo funds cannot be used", "Бонус нельзя тратить на маркет"],
    ["подарок недоступен для ставки", "Подарок недоступен для ставки"],
    ["gift not available for bet", "Подарок недоступен для ставки"],
    ["подарок недоступен для вывода", "Подарок недоступен для вывода"],
    ["gift is not available for withdrawal", "Подарок недоступен для вывода"],
    ["вывод подарков временно недоступен", "Вывод подарков временно недоступен"],
    ["gift withdrawal is not configured", "Вывод подарков временно недоступен"],
    ["вывод из стейка доступен только в конце недели", "Вывод из стейка — только в конце недели"],
    ["unstaking is not available", "Вывод из стейка — только в конце недели"],
    ["подарок уже в стейке", "Подарок уже в стейке"],
    ["gift already staked", "Подарок уже в стейке"],
    ["подарок уже застейкан", "Подарок уже в стейке на этой неделе"],
    ["пул стейкинга заполнен", "Пул стейкинга заполнен. Попробуйте позже."],
    ["staking pool full", "Пул стейкинга заполнен. Попробуйте позже."],
    ["личный лимит стейкинга", "Личный лимит исчерпан — выполните задания, чтобы увеличить его."],
    ["staking personal limit", "Личный лимит исчерпан — выполните задания, чтобы увеличить его."],
    ["подарок недоступен для стейкинга", "Подарок недоступен для стейкинга"],
    ["gift not available for staking", "Подарок недоступен для стейкинга"],
    ["подарок выставлен на маркет", "Сначала снимите подарок с маркета"],
    ["подарок участвует в игре", "Подарок участвует в игре — дождитесь окончания раунда"],
    ["request failed", fallback],
    ["auth failed", "Не удалось войти"],
    ["internal server error", "Внутренняя ошибка сервера"],
    ["внутренняя ошибка сервера", "Внутренняя ошибка сервера"],
  ];

  for (const [needle, text] of rules) {
    if (typeof needle === "string") {
      if (lower.includes(needle.toLowerCase())) return text;
    } else if (needle.test(raw)) {
      return text;
    }
  }

  // Prefer Russian messages from API as-is; hide leftover English.
  if (/[а-яё]/i.test(raw)) return raw;
  if (/^[A-Za-z0-9 ,.'"%:+\-_/()]+$/.test(raw)) return fallback;
  return raw;
}
