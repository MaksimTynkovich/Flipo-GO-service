import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { InventorySection } from "@/components/profile/InventorySection";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export function InventoryView() {
  return (
    <PageShell title="Инвентарь" description="Продавай предметы боту или выставляй на маркет">
      <section className="panel flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Быстрая продажа доступна в карточке каждого предмета</p>
        <Link href={APP_ROUTES.market} className="chip chip-accent shrink-0 px-3 py-1.5 text-xs font-semibold">
          Маркет
        </Link>
      </section>

      <InventorySection />
    </PageShell>
  );
}
