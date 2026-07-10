import type { LucideIcon } from "lucide-react";
import { CircleDot, Gamepad2, Gift, ShoppingBag, TrendingUp, User, Users } from "lucide-react";

export const APP_ROUTES = {
  home: "/games",
  games: "/games",
  crash: "/games/crash",
  roulette: "/games/roulette",
  pvp: "/games/pvp",
  admin: "/admin",
  market: "/market",
  inventory: "/inventory",
  deposit: "/deposit",
  profile: "/profile",
  profileStaking: "/profile/staking",
  profileReferrals: "/profile/referrals",
} as const;

export type ScreenLevel = "tab" | "stack";

export type ScreenContext = {
  level: ScreenLevel;
  title: string;
  backHref?: string;
  backLabel?: string;
  /** Prefer browser history when the entry point may vary (e.g. deposit). */
  useRouterBack?: boolean;
};

const TAB_ROOTS = [
  APP_ROUTES.games,
  APP_ROUTES.market,
  APP_ROUTES.inventory,
  APP_ROUTES.profile,
] as const;

const STACK_SCREENS: Record<string, Omit<ScreenContext, "level">> = {
  [APP_ROUTES.deposit]: {
    title: "Пополнение",
    backLabel: "Назад",
    useRouterBack: true,
  },
  [APP_ROUTES.profileStaking]: {
    title: "Стейкинг",
    backHref: APP_ROUTES.profile,
    backLabel: "Профиль",
  },
  [APP_ROUTES.profileReferrals]: {
    title: "Рефералы",
    backHref: APP_ROUTES.profile,
    backLabel: "Профиль",
  },
  [APP_ROUTES.crash]: {
    title: "Crash",
    backHref: APP_ROUTES.games,
    backLabel: "Игры",
  },
  [APP_ROUTES.roulette]: {
    title: "Рулетка",
    backHref: APP_ROUTES.games,
    backLabel: "Игры",
  },
  [APP_ROUTES.pvp]: {
    title: "PVP",
    backHref: APP_ROUTES.games,
    backLabel: "Игры",
  },
};

export type AppScreenItem = {
  id:
    | "games"
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
    id: "games",
    href: APP_ROUTES.games,
    label: "Игры",
    level: "tab",
    description: "Лобби с Crash, Рулетка и PVP.",
  },
  {
    id: "market",
    href: APP_ROUTES.market,
    label: "Маркет",
    level: "tab",
    description: "Магазин и торговля игровыми предметами.",
  },
  {
    id: "inventory",
    href: APP_ROUTES.inventory,
    label: "Инвентарь",
    level: "tab",
    description: "Хранилище вещей с быстрым действием продажи.",
  },
  {
    id: "profile",
    href: APP_ROUTES.profile,
    label: "Профиль",
    level: "tab",
    description: "Личные данные, статистика и стейкинг.",
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
  id: "games" | "market" | "inventory" | "profile";
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

export const MAIN_TABS: MainTabItem[] = [
  {
    id: "games",
    href: APP_ROUTES.games,
    label: "Игры",
    icon: Gamepad2,
    match: (pathname) =>
      pathname === APP_ROUTES.games || pathname.startsWith(`${APP_ROUTES.games}/`),
  },
  {
    id: "market",
    href: APP_ROUTES.market,
    label: "Маркет",
    icon: ShoppingBag,
    match: (pathname) => pathname.startsWith(APP_ROUTES.market),
  },
  {
    id: "inventory",
    href: APP_ROUTES.inventory,
    label: "Инвентарь",
    icon: Gift,
    match: (pathname) => pathname.startsWith(APP_ROUTES.inventory),
  },
  {
    id: "profile",
    href: APP_ROUTES.profile,
    label: "Профиль",
    icon: User,
    match: (pathname) => pathname.startsWith(APP_ROUTES.profile),
  },
];

export type GameLobbyItem = {
  href: string;
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  tone: "crash" | "roulette" | "pvp";
};

export const GAME_LOBBY_ITEMS: GameLobbyItem[] = [
  {
    href: APP_ROUTES.crash,
    title: "Crash",
    description: "Лови множитель и успей забрать выигрыш до обвала.",
    badge: "Live",
    icon: TrendingUp,
    tone: "crash",
  },
  {
    href: APP_ROUTES.roulette,
    title: "Рулетка",
    description: "Классические цвета, быстрые раунды и моментальный вход.",
    badge: "Live",
    icon: CircleDot,
    tone: "roulette",
  },
  {
    href: APP_ROUTES.pvp,
    title: "PVP",
    description: "Комнаты 1 на 1 — создай бой или присоединись к открытому.",
    badge: "Rooms",
    icon: Users,
    tone: "pvp",
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
    return { level: "tab", title: tab?.label ?? "" };
  }

  const exact = STACK_SCREENS[pathname];
  if (exact) {
    return { level: "stack", ...exact };
  }

  if (pathname.startsWith(`${APP_ROUTES.profile}/`)) {
    return {
      level: "stack",
      title: "Профиль",
      backHref: APP_ROUTES.profile,
      backLabel: "Профиль",
    };
  }

  if (pathname.startsWith(`${APP_ROUTES.games}/`)) {
    return {
      level: "stack",
      title: "Игра",
      backHref: APP_ROUTES.games,
      backLabel: "Игры",
    };
  }

  return { level: "stack", title: "", backLabel: "Назад", useRouterBack: true };
}

export function isStackScreen(pathname: string): boolean {
  return getScreenContext(pathname).level === "stack";
}
