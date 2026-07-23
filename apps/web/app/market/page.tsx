import { redirect } from "next/navigation";
import { MARKET_ENABLED } from "@/src/shared/config/features";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { MarketView } from "@/src/views/market";

export default function MarketPage() {
  if (!MARKET_ENABLED) {
    redirect(APP_ROUTES.cases);
  }
  return <MarketView />;
}
