import { PageShell } from "@/components/PageShell";
import { InventorySection } from "@/components/profile/InventorySection";

export function InventoryView() {
  return (
    <PageShell title="Инвентарь" description="Пополняй подарками через бота, стейкай или продавай">
      <InventorySection />
    </PageShell>
  );
}
