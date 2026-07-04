import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { InventorySection } from "@/components/profile/InventorySection";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export function InventoryView() {
  return (
    <PageShell
      title="Инвентарь"
      description="Хранилище вещей пользователя с быстрым доступом к продаже и выставлению на маркет."
    >
      <section className="panel flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">Быстрая продажа</p>
          <p className="mt-1 text-sm text-muted">
            Любой доступный предмет можно моментально продать боту прямо из карточки ниже.
          </p>
        </div>
        <Link
          href={APP_ROUTES.market}
          className="shrink-0 rounded-2xl bg-surface-raised px-3 py-2 text-sm font-semibold text-foreground transition-colors active:bg-surface"
        >
          Маркет
        </Link>
      </section>

      <InventorySection />
    </PageShell>
  );
}
