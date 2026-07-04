import { PageShell } from "@/components/PageShell";
import { MarketSection } from "@/components/market/MarketSection";

export function MarketView() {
  return (
    <PageShell
      title="Маркет"
      description="Магазин игровых предметов и Telegram Gifts с быстрым входом из таб-бара."
      flush
    >
      <MarketSection />
    </PageShell>
  );
}
