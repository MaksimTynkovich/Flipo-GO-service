import type { ComponentType } from "react";
import AnalyticsSection from "./sections/AnalyticsSection";
import CasesSection from "./sections/CasesSection";
import CaseStatsSection from "./sections/CaseStatsSection";
import DashboardSection from "./sections/DashboardSection";
import FinanceSection from "./sections/FinanceSection";
import GamesSection from "./sections/GamesSection";
import GiftPricingSection from "./sections/GiftPricingSection";
import MarketAdminSection from "./sections/MarketAdminSection";
import MarketDisabledSection from "./sections/MarketDisabledSection";
import MarketingSection from "./sections/MarketingSection";
import QuestsSection from "./sections/QuestsSection";
import NotificationsSection from "./sections/NotificationsSection";
import SystemSection from "./sections/SystemSection";
import TelegramSection from "./sections/TelegramSection";
import UsersSection from "./sections/UsersSection";
import OutcomeSection from "./sections/OutcomeSection";
import StakingSection from "./sections/StakingSection";
import { MARKET_ENABLED } from "@/src/shared/config/features";

export type AdminSectionId =
  | "dashboard"
  | "notifications"
  | "analytics"
  | "users"
  | "games"
  | "cases"
  | "case-stats"
  | "market"
  | "gift-pricing"
  | "finance"
  | "marketing"
  | "quests"
  | "staking"
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
  { id: "notifications", href: "/admin/notifications", label: "Уведомления" },
  { id: "analytics", href: "/admin/analytics", label: "Аналитика" },
  { id: "users", href: "/admin/users", label: "Пользователи" },
  { id: "games", href: "/admin/games", label: "Игры" },
  { id: "cases", href: "/admin/cases", label: "Кейсы" },
  { id: "case-stats", href: "/admin/case-stats", label: "Статистика кейсов" },
  { id: "outcome", href: "/admin/outcome", label: "Исходы" },
  { id: "market", href: "/admin/market", label: "Маркет", disabled: !MARKET_ENABLED },
  { id: "gift-pricing", href: "/admin/gift-pricing", label: "Цены подарков" },
  { id: "finance", href: "/admin/finance", label: "Операции" },
  { id: "staking", href: "/admin/staking", label: "Стейкинг" },
  { id: "marketing", href: "/admin/marketing", label: "Маркетинг" },
  { id: "quests", href: "/admin/quests", label: "Задания" },
  { id: "settings", href: "/admin/system", label: "Система" },
  { id: "telegram", href: "/admin/telegram", label: "Telegram" },
];

export const ADMIN_SECTIONS: Record<AdminSectionId, ComponentType> = {
  dashboard: DashboardSection,
  notifications: NotificationsSection,
  analytics: AnalyticsSection,
  users: UsersSection,
  games: GamesSection,
  cases: CasesSection,
  "case-stats": CaseStatsSection,
  market: MARKET_ENABLED ? MarketAdminSection : MarketDisabledSection,
  "gift-pricing": GiftPricingSection,
  finance: FinanceSection,
  staking: StakingSection,
  marketing: MarketingSection,
  quests: QuestsSection,
  settings: SystemSection,
  telegram: TelegramSection,
  outcome: OutcomeSection,
};

const PATH_TO_SECTION: Record<string, AdminSectionId> = {
  "/admin": "dashboard",
  "/admin/notifications": "notifications",
  "/admin/analytics": "analytics",
  "/admin/users": "users",
  "/admin/games": "games",
  "/admin/cases": "cases",
  "/admin/case-stats": "case-stats",
  "/admin/outcome": "outcome",
  "/admin/market": "market",
  "/admin/gift-pricing": "gift-pricing",
  "/admin/finance": "finance",
  "/admin/staking": "staking",
  "/admin/marketing": "marketing",
  "/admin/quests": "quests",
  "/admin/settings": "settings",
  "/admin/telegram": "telegram",
  "/admin/system": "settings",
};

export function resolveAdminSection(pathname: string): AdminSectionId {
  return PATH_TO_SECTION[pathname] ?? "dashboard";
}
