import { PageShell } from "@/components/PageShell";
import { InventorySection } from "@/components/profile/InventorySection";

export function InventoryView() {
  return (
    <PageShell flush>
      <InventorySection />
    </PageShell>
  );
}
