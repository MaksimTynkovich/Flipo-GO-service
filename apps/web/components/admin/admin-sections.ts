import type { ComponentType } from "react";
import AnalyticsSection from "./sections/AnalyticsSection";
import DashboardSection from "./sections/DashboardSection";
import FinanceSection from "./sections/FinanceSection";
import GamesSection from "./sections/GamesSection";
import MarketAdminSection from "./sections/MarketAdminSection";
import MarketingSection from "./sections/MarketingSection";
import TelegramSection from "./sections/TelegramSection";
import UsersSection from "./sections/UsersSection";
import OutcomeSection from "./sections/OutcomeSection";

export type AdminSectionId =
  | "dashboard"
  | "analytics"
  | "users"
  | "games"
  | "market"
  | "finance"
  | "marketing"
  | "telegram"
  | "outcome";

export type AdminNavItem = {
  id: AdminSectionId;
  href: string;
  label: string;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dashboard", href: "/admin", label: "Дашборд" },
  { id: "analytics", href: "/admin/analytics", label: "Аналитика" },
  { id: "users", href: "/admin/users", label: "Пользователи" },
  { id: "games", href: "/admin/games", label: "Игры" },
  { id: "outcome", href: "/admin/outcome", label: "Исходы" },
  { id: "market", href: "/admin/market", label: "Маркет" },
  { id: "finance", href: "/admin/finance", label: "Финансы" },
  { id: "marketing", href: "/admin/marketing", label: "Маркетинг" },
  { id: "telegram", href: "/admin/telegram", label: "Telegram" },
];

export const ADMIN_SECTIONS: Record<AdminSectionId, ComponentType> = {
  dashboard: DashboardSection,
  analytics: AnalyticsSection,
  users: UsersSection,
  games: GamesSection,
  market: MarketAdminSection,
  finance: FinanceSection,
  marketing: MarketingSection,
  telegram: TelegramSection,
  outcome: OutcomeSection,
};

const PATH_TO_SECTION: Record<string, AdminSectionId> = {
  "/admin": "dashboard",
  "/admin/analytics": "analytics",
  "/admin/users": "users",
  "/admin/games": "games",
  "/admin/outcome": "outcome",
  "/admin/market": "market",
  "/admin/finance": "finance",
  "/admin/marketing": "marketing",
  "/admin/telegram": "telegram",
};

export function resolveAdminSection(pathname: string): AdminSectionId {
  return PATH_TO_SECTION[pathname] ?? "dashboard";
}
