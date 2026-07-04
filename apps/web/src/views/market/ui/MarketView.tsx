import { PageShell } from "@/components/PageShell";
import { MarketSection } from "@/components/market/MarketSection";

export function MarketView() {
  return (
    <PageShell title="Маркет" description="Покупай и продавай Telegram Gifts" flush>
      <MarketSection />
    </PageShell>
  );
}
