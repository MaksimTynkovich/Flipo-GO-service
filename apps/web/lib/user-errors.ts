import { getRuntimeLocale, translate, type MessageKey } from "@/lib/i18n";

function t(key: MessageKey): string {
  return translate(getRuntimeLocale(), key);
}

/** Map API/client errors to concise copy for UI surfaces. */
export function formatUserError(error: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? t("errors.generic");
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  const codeKeys: Record<string, MessageKey> = {
    staking_pool_full: "errors.stakingPoolFull",
    staking_personal_limit: "errors.stakingPersonalLimit",
    case_name_tag_required: "errors.nameTag",
    case_share_required: "errors.shareRequired",
    campaign_code_taken: "errors.campaignTaken",
    gift_not_in_bot_custody: "errors.giftNotInBot",
  };
  if (code && codeKeys[code]) return t(codeKeys[code]);

  const raw =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  if (!raw) return defaultFallback;

  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("load failed")) {
    return t("errors.network");
  }
  if (
    raw.startsWith("Key:") ||
    lower.includes("binding") ||
    lower.includes("field validation") ||
    lower.includes("telegram_gift_id") ||
    lower.includes("fulfill") ||
    lower.includes("nanoton") ||
    lower.includes("mtproto") ||
    lower.includes("unbacked") ||
    /\bstars\b/i.test(raw) ||
    lower.includes("аккаунте депозита") ||
    lower.includes("аккаунте бота") ||
    lower.includes("бот закупа")
  ) {
    return defaultFallback;
  }

  const rules: Array<[string, MessageKey]> = [
    ["недостаточно средств. учти комиссию", "errors.insufficientFee"],
    ["недостаточно средств. учтите комиссию", "errors.insufficientFee"],
    ["недостаточно средств", "errors.insufficientFunds"],
    ["insufficient balance", "errors.insufficientFunds"],
    ["ставки больше не принимаются", "errors.betsClosed"],
    ["round not accepting bets", "errors.betsClosed"],
    ["предмет уже выставлен", "errors.alreadyListed"],
    ["item already listed", "errors.alreadyListed"],
    ["кошелёк не подключён", "errors.connectWallet"],
    ["wallet not linked", "errors.connectWallet"],
    ["сначала подключи ton-кошелёк", "errors.connectWallet"],
    ["сначала подключите ton-кошелёк", "errors.connectWallet"],
    ["у тебя уже есть активная операция", "errors.activeTransfer"],
    ["у вас уже есть активная операция", "errors.activeTransfer"],
    ["дождись её завершения", "errors.activeTransfer"],
    ["время на оплату истекло", "errors.paymentExpired"],
    ["создай новое пополнение", "errors.paymentExpired"],
    ["сервис ton временно недоступен", "errors.tonUnavailable"],
    ["попробуй через пару минут", "errors.tonUnavailable"],
    ["укажи корректную сумму", "errors.invalidAmount"],
    ["проверь минимальный лимит", "errors.invalidAmount"],
    ["проверь интернет", "errors.network"],
    ["не удалось выполнить операцию. попробуй ещё раз", "errors.tryAgain"],
    ["попробуй ещё раз", "errors.tryAgain"],
    ["недействительный токен", "errors.sessionExpired"],
    ["invalid token", "errors.sessionExpired"],
    ["неверные данные telegram", "errors.telegramAuth"],
    ["invalid telegram init data", "errors.telegramAuth"],
    ["данные telegram устарели", "errors.telegramExpired"],
    ["telegram init data expired", "errors.telegramExpired"],
    ["требуется авторизация", "errors.authRequired"],
    ["missing authorization", "errors.authRequired"],
    ["аккаунт заблокирован", "errors.banned"],
    ["account suspended", "errors.banned"],
    ["игра временно недоступна", "errors.gameDisabled"],
    ["game disabled", "errors.gameDisabled"],
    ["ставки временно не принимаются", "errors.betsPaused"],
    ["bets_paused", "errors.betsPaused"],
    ["техническое обслуживание", "errors.maintenance"],
    ["maintenance", "errors.maintenance"],
    ["кейсы временно недоступны", "errors.casesDisabled"],
    ["cases_disabled", "errors.casesDisabled"],
    ["добавьте тег в имя", "errors.nameTag"],
    ["case_name_tag_required", "errors.nameTag"],
    ["поделитесь ссылкой", "errors.shareRequired"],
    ["case_share_required", "errors.shareRequired"],
    ["маркет временно недоступен", "errors.marketDisabled"],
    ["market_disabled", "errors.marketDisabled"],
    ["депозит подарками временно недоступен", "errors.giftDepositDisabled"],
    ["gift_deposit_disabled", "errors.giftDepositDisabled"],
    ["лот не найден", "errors.listingNotFound"],
    ["listing not found", "errors.listingNotFound"],
    ["не найдено", "errors.notFound"],
    ["not found", "errors.notFound"],
    ["доступ запрещён", "errors.forbidden"],
    ["forbidden", "errors.forbidden"],
    ["подарок не задепозичен в бота", "errors.giftNotInBot"],
    ["gift_not_in_bot_custody", "errors.giftNotInBot"],
    ["gift not available for bet", "errors.giftNotForBet"],
    ["подарок недоступен для вывода", "errors.giftNotForWithdraw"],
    ["gift is not available for withdrawal", "errors.giftNotForWithdraw"],
    ["вывод подарков временно недоступен", "errors.giftWithdrawDisabled"],
    ["gift withdrawal is not configured", "errors.giftWithdrawDisabled"],
    ["вывод из стейка доступен только в конце дня", "errors.unstakeWindow"],
    ["вывод из стейка доступен только в конце недели", "errors.unstakeWindow"],
    ["unstaking is not available", "errors.unstakeWindow"],
    ["подарок уже в стейке", "errors.alreadyStaked"],
    ["gift already staked", "errors.alreadyStaked"],
    ["подарок уже застейкан", "errors.alreadyStakedToday"],
    ["пул стейкинга заполнен", "errors.stakingPoolFull"],
    ["staking pool full", "errors.stakingPoolFull"],
    ["staking_pool_full", "errors.stakingPoolFull"],
    ["личный лимит стейкинга", "errors.stakingPersonalLimit"],
    ["staking personal limit", "errors.stakingPersonalLimit"],
    ["staking_personal_limit", "errors.stakingPersonalLimit"],
    ["подарок недоступен для стейкинга", "errors.giftNotForStake"],
    ["gift not available for staking", "errors.giftNotForStake"],
    ["подарок выставлен на маркет", "errors.unlistFirst"],
    ["подарок участвует в игре", "errors.giftInGame"],
    ["request failed", "errors.generic"],
    ["auth failed", "errors.signInFailed"],
    ["internal server error", "errors.generic"],
    ["внутренняя ошибка сервера", "errors.generic"],
  ];

  for (const [needle, key] of rules) {
    if (lower.includes(needle.toLowerCase())) return t(key);
  }

  const locale = getRuntimeLocale();
  if (locale === "ru" && /[а-яё]/i.test(raw) && raw.length <= 120 && !/[_{}=<>]/.test(raw)) {
    return raw;
  }
  if (/^[A-Za-z0-9 ,.'"%:+\-_/()]+$/.test(raw)) return defaultFallback;
  return defaultFallback;
}
