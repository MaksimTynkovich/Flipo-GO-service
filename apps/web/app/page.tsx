"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { campaignLandingPath, consumeCampaignLanding } from "@/lib/campaign";
import { useCasesFeatures } from "@/components/providers/CasesFeaturesProvider";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export default function HomePage() {
  const router = useRouter();
  const { casesVisible, ready } = useCasesFeatures();

  useEffect(() => {
    if (!ready) return;
    const landing = consumeCampaignLanding();
    const fromCampaign = landing ? campaignLandingPath(landing, casesVisible) : null;
    router.replace(fromCampaign || (casesVisible ? APP_ROUTES.cases : APP_ROUTES.games));
  }, [ready, casesVisible, router]);

  return null;
}
