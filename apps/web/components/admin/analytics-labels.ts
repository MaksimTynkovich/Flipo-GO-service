const EVENT_LABELS: Record<string, string> = {
  bot_start: "/start в боте",
  session_started: "Начало сессии",
  auth_started: "Начало авторизации",
  auth_succeeded: "Успешная авторизация",
  auth_debug_succeeded: "Успешная debug-авторизация",
  auth_restored: "Восстановление сессии",
  auth_failed: "Ошибка авторизации",
  auth_debug_failed: "Ошибка debug-авторизации",
  auth_loading_timeout: "Зависание на экране входа",
  boot_hang: "Зависание загрузки Mini App",
  boot_autoreload: "Авто-перезагрузка при зависании",
  boot_reload_clicked: "Перезагрузка после зависания",
  telegram_access_denied: "Вход вне Telegram",
  referral_detected: "Обнаружен реферальный код",
  referral_assigned: "Назначен реферер",
  screen_view: "Просмотр экрана",
  screen_enter: "Вход на экран",
  screen_leave: "Уход с экрана",
  screen_abandon: "Закрытие / уход с экрана",
  route_change: "Смена маршрута",
  error_surface: "Ошибка на экране",
  modal_open: "Открытие модалки",
  modal_completed: "Модалка завершена",
  modal_abandon: "Модалка закрыта без действия",
  disabled_click: "Клик по неактивной кнопке",
  deposit_flow_viewed: "Открыт пополнение",
  staking_flow_viewed: "Открыт стейкинг",
  staking_gifts_valued: "Оценка подарков на стейкинге",
  input_started: "Начат ввод",
  input_completed: "Ввод завершён",
  input_abandon: "Ввод брошен",
  session_end_after_error: "Уход после ошибки",
  deposit_intent_created: "Создано пополнение",
  deposit_confirmed: "Подтверждено пополнение",
  withdraw_requested: "Запрошен вывод",
  withdraw_failed: "Ошибка вывода TON",
  withdraw_review_required: "Вывод отправлен на проверку",
  roulette_bet_placed: "Ставка в рулетке",
  crash_bet_placed: "Ставка в crash",
  crash_cashout_completed: "Кэшаут в crash",
  pvp_room_created: "Создана PvP-комната",
  pvp_room_joined: "Вход в PvP-комнату",
  staking_started: "Начало стейкинга",
  staking_unstake_requested: "Запрос на unstake",
  staking_yield_paid: "Начислен доход по стейкингу",
  referral_bonus_paid: "Начислен реферальный бонус",
  promo_activated: "Активация промокода",
  market_listing_created: "Выставление на маркет",
  market_listing_cancelled: "Снятие с маркета",
  market_purchase_completed: "Покупка на маркете",
  inventory_deposit_completed: "Зачисление подарка",
  inventory_deposit_realtime_received: "Подтверждено зачисление подарка",
  inventory_liquidated: "Продажа подарка в buyback",
  inventory_withdrawn: "Вывод подарка",
  balance_win_received: "Получен выигрыш",
};

const MODAL_LABELS: Record<string, string> = {
  inventory_gift_detail: "Подарок в инвентаре",
  market_gift_detail: "Покупка на маркете",
  staking_gift_detail: "Подарок в стейкинге",
  roulette_bet_red: "Ставка красное (неактивно)",
  roulette_bet_green: "Ставка зелёное (неактивно)",
  roulette_bet_black: "Ставка чёрное (неактивно)",
  roulette_bet_amount: "Сумма ставки (рулетка)",
  crash_bet_amount: "Сумма ставки (crash)",
  deposit_ton_amount: "Сумма пополнения",
  withdraw_ton_amount: "Сумма вывода",
  staking_submit: "Кнопка стейкинга",
};

const FLOW_LABELS: Record<string, string> = {
  deposit_flow: "Пополнение",
  staking_flow: "Стейкинг",
};

const FUNNEL_LABELS: Record<string, string> = {
  acquisition: "Вход из бота",
  onboarding: "Онбординг",
  engagement: "Вовлечённость",
  deposit: "Пополнение",
  market: "Маркет",
  staking: "Стейкинг",
  roulette: "Рулетка",
};

const EXIT_TYPE_LABELS: Record<string, string> = {
  navigation: "переход",
  tab_hidden: "сворачивание вкладки",
  unload: "закрытие",
};

const ERROR_SURFACE_LABELS: Record<string, string> = {
  api: "API",
  ui: "Интерфейс",
  validation: "Валидация",
  ws: "WebSocket",
  risk: "Risk",
};

const MODE_LABELS: Record<string, string> = {
  roulette: "Рулетка",
  crash: "Crash",
  pvp: "PvP",
  staking: "Стейкинг",
  market: "Маркет",
  "/games": "Игры",
  "/games/roulette": "Рулетка",
  "/games/crash": "Crash",
  "/games/pvp": "PvP",
  "/profile": "Профиль",
  "/profile/referrals": "Рефералы",
  "/deposit": "Пополнение",
  "/inventory": "Инвентарь",
  "/market": "Маркет",
};

const ERROR_LABELS: Record<string, string> = {
  risk_blocked: "Заблокировано risk-проверкой",
  invalid_payload: "Некорректные данные запроса",
  telegram_auth_failed: "Ошибка Telegram-авторизации",
  auth_loading_timeout: "Зависание на экране входа",
  boot_hang: "Зависание загрузки Mini App",
  boot_autoreload: "Авто-перезагрузка при зависании",
  browser_access_blocked: "Вход из браузера (не Telegram)",
  debug_auth_failed: "Ошибка debug-авторизации",
  bet_failed: "Ошибка ставки",
  cashout_failed: "Ошибка кэшаута",
  create_failed: "Ошибка создания",
  join_failed: "Ошибка входа",
  promo_failed: "Ошибка активации промокода",
  promo_required: "Промокод не введён",
  purchase_failed: "Ошибка покупки",
  cancel_failed: "Ошибка отмены",
  deposit_intent_failed: "Ошибка создания пополнения",
  deposit_confirm_failed: "Ошибка подтверждения пополнения",
  withdraw_failed: "Ошибка вывода",
  withdraw_send_failed: "Ошибка отправки TON",
  deposit_failed: "Ошибка зачисления подарка",
  liquidate_failed: "Ошибка продажи подарка",
  stake_failed: "Ошибка стейкинга",
  staking_stake_failed: "Ошибка стейкинга (API)",
  staking_pool_full: "Пул стейкинга заполнен",
  staking_personal_limit: "Личный лимит стейкинга",
  gift_already_staked: "Подарок уже в стейке",
  invalid_stake: "Подарок недоступен для стейкинга",
  unstake_failed: "Ошибка unstake",
};

const SOURCE_LABELS: Record<string, string> = {
  direct: "Прямой вход",
  referral: "Реферальный вход",
  debug: "Debug-вход",
  unknown: "Неизвестный источник",
  telegram_start_param: "Telegram start_param",
};

const STATUS_LABELS: Record<string, string> = {
  success: "успешно",
  error: "ошибка",
  info: "инфо",
  queued: "в очереди",
  pending_review: "на проверке",
  completed: "завершено",
  rejected: "отклонено",
};

export function humanizeAnalyticsName(name: string): string {
  if (name.includes(":")) {
    const [screen, event] = name.split(":");
    const screenLabel = MODE_LABELS[screen] || screen;
    const eventLabel = EVENT_LABELS[event] || event;
    return `${screenLabel} · ${eventLabel}`;
  }
  return (
    EVENT_LABELS[name] ||
    FUNNEL_LABELS[name] ||
    MODAL_LABELS[name] ||
    FLOW_LABELS[name] ||
    MODE_LABELS[name] ||
    ERROR_LABELS[name] ||
    SOURCE_LABELS[name] ||
    name
  );
}

export function humanizeJourneyPath(path: string): string {
  return path
    .split(" → ")
    .map((segment) => MODE_LABELS[segment] || segment)
    .join(" → ");
}

export function humanizeExitType(exitType?: string): string {
  if (!exitType) return "";
  return EXIT_TYPE_LABELS[exitType] || exitType;
}

export function humanizeErrorSurface(surface?: string): string {
  if (!surface) return "";
  return ERROR_SURFACE_LABELS[surface] || surface;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} мин ${rest} с` : `${minutes} мин`;
}

export function humanizeAnalyticsStatus(status?: string): string {
  if (!status) return "";
  return STATUS_LABELS[status] || status;
}

export function humanizeAnalyticsSource(source?: string): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] || humanizeAnalyticsName(source);
}
