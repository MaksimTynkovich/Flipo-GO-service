"use client";

import { PageShell } from "@/components/PageShell";
import { MarketSection } from "@/components/market/MarketSection";

export default function MarketPage() {
  return (
    <PageShell
      title="Маркет"
      description="Покупай Telegram Gifts с баланса бота или у других игроков"
      flush
    >
      <MarketSection />
    </PageShell>
  );
}
