import { PageShell } from "@/components/PageShell";
import { InventorySection } from "@/components/profile/InventorySection";

export function InventoryView() {
  return (
    <PageShell title="Инвентарь" description="Продавай подарки боту или выставляй на маркет">
      <InventorySection />
    </PageShell>
  );
}
