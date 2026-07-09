import type { ComponentType } from "react";
import DashboardSection from "./sections/DashboardSection";
import FinanceSection from "./sections/FinanceSection";
import GamesSection from "./sections/GamesSection";
import MarketingSection from "./sections/MarketingSection";
import TelegramSection from "./sections/TelegramSection";
import UsersSection from "./sections/UsersSection";

export type AdminSectionId =
  | "dashboard"
  | "users"
  | "games"
  | "finance"
  | "marketing"
  | "telegram";

export type AdminNavItem = {
  id: AdminSectionId;
  href: string;
  label: string;
  hint: string;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dashboard", href: "/admin", label: "Дашборд", hint: "GGR, NGR, активность" },
  { id: "users", href: "/admin/users", label: "Пользователи", hint: "Ставки и фрод" },
  { id: "games", href: "/admin/games", label: "Игры и RTP", hint: "Лимиты и ключи" },
  { id: "finance", href: "/admin/finance", label: "Финансы", hint: "TON и выводы" },
  { id: "marketing", href: "/admin/marketing", label: "Маркетинг", hint: "Промо и рефералы" },
  { id: "telegram", href: "/admin/telegram", label: "Telegram", hint: "Бот и рассылки" },
];

export const ADMIN_SECTIONS: Record<AdminSectionId, ComponentType> = {
  dashboard: DashboardSection,
  users: UsersSection,
  games: GamesSection,
  finance: FinanceSection,
  marketing: MarketingSection,
  telegram: TelegramSection,
};

const PATH_TO_SECTION: Record<string, AdminSectionId> = {
  "/admin": "dashboard",
  "/admin/users": "users",
  "/admin/games": "games",
  "/admin/finance": "finance",
  "/admin/marketing": "marketing",
  "/admin/telegram": "telegram",
};

export function resolveAdminSection(pathname: string): AdminSectionId {
  return PATH_TO_SECTION[pathname] ?? "dashboard";
}
