import { APP_ROUTES } from "@/src/shared/config/navigation";

export const CAMPAIGN_LANDING_KEY = "flipo_campaign_landing";

export function storeCampaignLanding(landing?: string | null) {
  if (typeof window === "undefined" || !landing?.trim()) return;
  sessionStorage.setItem(CAMPAIGN_LANDING_KEY, landing.trim());
}

export function consumeCampaignLanding(): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(CAMPAIGN_LANDING_KEY);
  if (value) sessionStorage.removeItem(CAMPAIGN_LANDING_KEY);
  return value;
}

export function campaignLandingPath(landing: string, casesVisible: boolean): string | null {
  switch (landing.trim().toLowerCase()) {
    case "cases":
      return casesVisible ? APP_ROUTES.cases : APP_ROUTES.games;
    case "games":
      return APP_ROUTES.games;
    case "crash":
      return APP_ROUTES.crash;
    default:
      return null;
  }
}
