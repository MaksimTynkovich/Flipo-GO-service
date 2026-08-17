import type { LucideIcon } from "lucide-react";
import {
  CircleDot,
  Gamepad2,
  ListTodo,
  PackageOpen,
  Rocket,
  ShoppingBag,
  User,
} from "lucide-react";
import { MARKET_ENABLED } from "@/src/shared/config/features";
import type { MessageKey } from "@/lib/i18n";

export const APP_ROUTES = {
  home: "/cases",
  cases: "/cases",
  games: "/games",
  crash: "/games/crash",
  roulette: "/games/roulette",
  admin: "/admin",
  market: "/market",
  inventory: "/inventory",
  deposit: "/deposit",
  profile: "/profile",
  profileStaking: "/profile/staking",
  profileReferrals: "/profile/referrals",
  quests: "/quests",
} as const;

export type ScreenLevel = "tab" | "stack";

export type ScreenContext = {
  level: ScreenLevel;
  titleKey?: MessageKey;
  backHref?: string;
  backLabelKey?: MessageKey;
  /** Prefer browser history when the entry point may vary (e.g. deposit). */
  useRouterBack?: boolean;
};

const TAB_ROOTS = [
  APP_ROUTES.cases,
  APP_ROUTES.games,
  APP_ROUTES.quests,
  ...(MARKET_ENABLED ? [APP_ROUTES.market] as const : []),
  APP_ROUTES.profile,
] as const;

const STACK_SCREENS: Record<string, Omit<ScreenContext, "level">> = {
  [APP_ROUTES.deposit]: {
    titleKey: "nav.deposit",
    backLabelKey: "common.back",
    useRouterBack: true,
  },
  [APP_ROUTES.inventory]: {
    titleKey: "nav.inventory",
    backHref: APP_ROUTES.profile,
    backLabelKey: "nav.profile",
  },
  [APP_ROUTES.profileStaking]: {
    titleKey: "nav.staking",
    backHref: APP_ROUTES.profile,
    backLabelKey: "nav.profile",
  },
  [APP_ROUTES.profileReferrals]: {
    titleKey: "nav.referrals",
    backHref: APP_ROUTES.profile,
    backLabelKey: "nav.profile",
  },
  [APP_ROUTES.crash]: {
    titleKey: "nav.crash",
    backHref: APP_ROUTES.games,
    backLabelKey: "nav.games",
  },
  [APP_ROUTES.roulette]: {
    titleKey: "nav.roulette",
    backHref: APP_ROUTES.games,
    backLabelKey: "nav.games",
  },
};

export type AppScreenItem = {
  id:
    | "cases"
    | "games"
    | "quests"
    | "market"
    | "inventory"
    | "profile"
    | "deposit"
    | "profile-staking";
  href: string;
  label: string;
  level: "tab" | "stack";
  description: string;
};

export const APP_SCREENS: AppScreenItem[] = [
  {
    id: "cases",
    href: APP_ROUTES.cases,
    label: "Кейсы",
    level: "tab",
    description: "Каталог кейсов с подарками Telegram.",
  },
  {
    id: "games",
    href: APP_ROUTES.games,
    label: "Игры",
    level: "tab",
    description: "Лобби с Crash и Рулеткой.",
  },
  {
    id: "quests",
    href: APP_ROUTES.quests,
    label: "Задания",
    level: "tab",
    description: "Ежедневные задания и награды за активность.",
  },
  ...(MARKET_ENABLED
    ? [
        {
          id: "market" as const,
          href: APP_ROUTES.market,
          label: "Маркет",
          level: "tab" as const,
          description: "Магазин подарков от платформы.",
        },
      ]
    : []),
  {
    id: "profile",
    href: APP_ROUTES.profile,
    label: "Профиль",
    level: "tab",
    description: "Личные данные, статистика и стейкинг.",
  },
  {
    id: "inventory",
    href: APP_ROUTES.inventory,
    label: "Инвентарь",
    level: "stack",
    description: "Хранилище вещей с быстрым действием продажи.",
  },
  {
    id: "deposit",
    href: APP_ROUTES.deposit,
    label: "Пополнение",
    level: "stack",
    description: "Пополнение баланса и зачисление подарков.",
  },
  {
    id: "profile-staking",
    href: APP_ROUTES.profileStaking,
    label: "Стейкинг",
    level: "stack",
    description: "Пассивный доход и управление staking-портфелем.",
  },
];

export type MainTabItem = {
  id: "cases" | "games" | "quests" | "market" | "profile";
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const ALL_MAIN_TABS: MainTabItem[] = [
  {
    id: "cases",
    href: APP_ROUTES.cases,
    label: "Кейсы",
    icon: PackageOpen,
    match: (pathname) =>
      pathname === APP_ROUTES.cases || pathname.startsWith(`${APP_ROUTES.cases}/`),
  },
  {
    id: "games",
    href: APP_ROUTES.games,
    label: "Игры",
    icon: Gamepad2,
    match: (pathname) =>
      pathname === APP_ROUTES.games || pathname.startsWith(`${APP_ROUTES.games}/`),
  },
  {
    id: "quests",
    href: APP_ROUTES.quests,
    label: "Задания",
    icon: ListTodo,
    match: (pathname) => pathname.startsWith(APP_ROUTES.quests),
  },
  {
    id: "market",
    href: APP_ROUTES.market,
    label: "Маркет",
    icon: ShoppingBag,
    match: (pathname) => pathname.startsWith(APP_ROUTES.market),
  },
  {
    id: "profile",
    href: APP_ROUTES.profile,
    label: "Профиль",
    icon: User,
    match: (pathname) => pathname.startsWith(APP_ROUTES.profile),
  },
];

export const MAIN_TABS: MainTabItem[] = ALL_MAIN_TABS.filter(
  (tab) => tab.id !== "market" || MARKET_ENABLED,
);

export function getMainTabs(options?: { casesEnabled?: boolean }): MainTabItem[] {
  const casesEnabled = options?.casesEnabled !== false;
  return MAIN_TABS.filter((tab) => tab.id !== "cases" || casesEnabled);
}

export type GameLobbyItem = {
  href: string;
  title?: string;
  titleKey?: MessageKey;
  descriptionKey: MessageKey;
  badgeKey: MessageKey;
  cta?: string;
  icon: LucideIcon;
  tone: "crash" | "roulette";
};

export const GAME_LOBBY_ITEMS: GameLobbyItem[] = [
  {
    href: APP_ROUTES.crash,
    title: "Crash",
    descriptionKey: "games.crashDesc",
    badgeKey: "common.online",
    icon: Rocket,
    tone: "crash",
  },
  {
    href: APP_ROUTES.roulette,
    titleKey: "nav.roulette",
    descriptionKey: "games.rouletteDesc",
    badgeKey: "common.online",
    icon: CircleDot,
    tone: "roulette",
  },
];

export function shouldShowTabBar(_pathname: string): boolean {
  return true;
}

export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.some((route) => route === pathname);
}

export function getActiveMainTab(pathname: string): MainTabItem["id"] | null {
  const tab = MAIN_TABS.find((item) => item.match(pathname));
  return tab?.id ?? null;
}

export function getScreenContext(pathname: string): ScreenContext {
  if (isTabRoot(pathname)) {
    const tab = MAIN_TABS.find((item) => item.href === pathname);
    const titleKey =
      tab?.id === "cases"
        ? "nav.cases"
        : tab?.id === "games"
          ? "nav.games"
          : tab?.id === "quests"
            ? "nav.quests"
            : tab?.id === "market"
              ? "nav.market"
              : tab?.id === "profile"
                ? "nav.profile"
                : undefined;
    return { level: "tab", titleKey };
  }

  if (pathname.startsWith(`${APP_ROUTES.cases}/`)) {
    return {
      level: "stack",
      titleKey: "nav.case",
      backHref: APP_ROUTES.cases,
      backLabelKey: "nav.cases",
    };
  }

  const exact = STACK_SCREENS[pathname];
  if (exact) {
    return { level: "stack", ...exact };
  }

  if (pathname.startsWith(`${APP_ROUTES.profile}/`)) {
    return {
      level: "stack",
      titleKey: "nav.profile",
      backHref: APP_ROUTES.profile,
      backLabelKey: "nav.profile",
    };
  }

  if (pathname.startsWith(`${APP_ROUTES.games}/`)) {
    return {
      level: "stack",
      titleKey: "nav.game",
      backHref: APP_ROUTES.games,
      backLabelKey: "nav.games",
    };
  }

  return { level: "stack", titleKey: undefined, backLabelKey: "common.back", useRouterBack: true };
}

export function isStackScreen(pathname: string): boolean {
  return getScreenContext(pathname).level === "stack";
}
