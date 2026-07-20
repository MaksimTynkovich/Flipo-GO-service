"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { hasPromoBalance, mainBalanceNanoton } from "@/lib/balance";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES, getScreenContext, isTabRoot, MAIN_TABS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { BalanceGainFx } from "@/src/widgets/app-shell/ui/BalanceGainFx";

function headerTitle(pathname: string): string {
  if (isTabRoot(pathname)) {
    return MAIN_TABS.find((t) => t.href === pathname)?.label ?? "";
  }
  return getScreenContext(pathname).title || "";
}

export function AppHeader() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();
  const promoBalance = user?.promo_balance ?? 0;
  const mainBalance = user ? mainBalanceNanoton(user) : 0;
  const title = headerTitle(pathname);

  return (
    <header className="app-header absolute left-0 right-0 top-0 z-50 bg-background pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] pt-[var(--app-safe-top)] hairline-bottom">
      <div className="app-container relative flex h-14 items-center justify-between gap-3">
        <h1 className="relative z-10 min-w-0 truncate text-[1.375rem] font-bold leading-none tracking-tight text-foreground">
          {title || "Flipo"}
        </h1>

        <div
          className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
          aria-live="polite"
        >
          <BalanceGainFx />
        </div>

        <div className="relative z-10 flex min-w-0 items-center overflow-visible">
          <div className="balance-pill flex min-w-0 items-center overflow-visible rounded-full">
            <div className="flex min-w-0 items-center gap-1.5 px-3 py-1.5">
              <TonIcon variant="brand" className="h-4 w-4 shrink-0" />
              <span className="truncate text-[15px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
                {loading ? "…" : user ? `${formatTON(mainBalance)} TON` : "—"}
              </span>
              {!loading && user && hasPromoBalance(user) ? (
                <span className="shrink-0 text-[11px] font-semibold tabular-nums leading-none text-accent">
                  +{formatTON(promoBalance)}
                </span>
              ) : null}
            </div>

            <Link
              href={APP_ROUTES.deposit}
              aria-label="Пополнить баланс"
              onClick={() => haptics.impactOccurred("medium")}
              className="app-control flex h-9 w-9 shrink-0 items-center justify-center rounded-r-full border-l border-[var(--border)] bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
