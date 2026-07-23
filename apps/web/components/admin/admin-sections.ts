import type { ComponentType } from "react";
import AnalyticsSection from "./sections/AnalyticsSection";
import CasesSection from "./sections/CasesSection";
import DashboardSection from "./sections/DashboardSection";
import FinanceSection from "./sections/FinanceSection";
import GamesSection from "./sections/GamesSection";
import MarketAdminSection from "./sections/MarketAdminSection";
import MarketDisabledSection from "./sections/MarketDisabledSection";
import MarketingSection from "./sections/MarketingSection";
import SystemSection from "./sections/SystemSection";
import TelegramSection from "./sections/TelegramSection";
import UsersSection from "./sections/UsersSection";
import OutcomeSection from "./sections/OutcomeSection";
import { MARKET_ENABLED } from "@/src/shared/config/features";

export type AdminSectionId =
  | "dashboard"
  | "analytics"
  | "users"
  | "games"
  | "cases"
  | "market"
  | "finance"
  | "marketing"
  | "settings"
  | "telegram"
  | "outcome";

export type AdminNavItem = {
  id: AdminSectionId;
  href: string;
  label: string;
  disabled?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "dashboard", href: "/admin", label: "Дашборд" },
  { id: "analytics", href: "/admin/analytics", label: "Аналитика" },
  { id: "users", href: "/admin/users", label: "Пользователи" },
  { id: "games", href: "/admin/games", label: "Игры" },
  { id: "cases", href: "/admin/cases", label: "Кейсы" },
  { id: "outcome", href: "/admin/outcome", label: "Исходы" },
  { id: "market", href: "/admin/market", label: "Маркет", disabled: !MARKET_ENABLED },
  { id: "finance", href: "/admin/finance", label: "Операции" },
  { id: "marketing", href: "/admin/marketing", label: "Маркетинг" },
  { id: "settings", href: "/admin/system", label: "Система" },
  { id: "telegram", href: "/admin/telegram", label: "Telegram" },
];

export const ADMIN_SECTIONS: Record<AdminSectionId, ComponentType> = {
  dashboard: DashboardSection,
  analytics: AnalyticsSection,
  users: UsersSection,
  games: GamesSection,
  cases: CasesSection,
  market: MARKET_ENABLED ? MarketAdminSection : MarketDisabledSection,
  finance: FinanceSection,
  marketing: MarketingSection,
  settings: SystemSection,
  telegram: TelegramSection,
  outcome: OutcomeSection,
};

const PATH_TO_SECTION: Record<string, AdminSectionId> = {
  "/admin": "dashboard",
  "/admin/analytics": "analytics",
  "/admin/users": "users",
  "/admin/games": "games",
  "/admin/cases": "cases",
  "/admin/outcome": "outcome",
  "/admin/market": "market",
  "/admin/finance": "finance",
  "/admin/marketing": "marketing",
  "/admin/settings": "settings",
  "/admin/telegram": "telegram",
  "/admin/system": "settings",
};

export function resolveAdminSection(pathname: string): AdminSectionId {
  return PATH_TO_SECTION[pathname] ?? "dashboard";
}
