import { PageShell } from "@/components/PageShell";
import { MarketSection } from "@/components/market/MarketSection";

export function MarketView() {
  return (
    <PageShell flush>
      <MarketSection />
    </PageShell>
  );
}
