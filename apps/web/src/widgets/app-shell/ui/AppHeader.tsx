"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { hasPromoBalance, mainBalanceNanoton } from "@/lib/balance";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { BalanceGainFx } from "@/src/widgets/app-shell/ui/BalanceGainFx";

export function AppHeader() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();
  const promoBalance = user?.promo_balance ?? 0;
  const mainBalance = user ? mainBalanceNanoton(user) : 0;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 bg-background/90 pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] pt-[var(--app-safe-top)] backdrop-blur-xl hairline-bottom">
      <div className="app-container flex h-14 items-center justify-between gap-3">
        <Link
          href={APP_ROUTES.profile}
          aria-label="Открыть профиль"
          onClick={() => haptics.impactOccurred("light")}
          className="app-control flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-0 transition-[box-shadow] duration-200 hover:ring-2 hover:ring-accent/25"
        >
          <UserAvatar user={user} size={36} />
        </Link>

        <div className="relative flex min-w-0 items-center overflow-visible">
          <BalanceGainFx />
          <div className="balance-pill flex min-w-0 items-center overflow-visible rounded-full">
            <div className="flex min-w-0 items-center gap-1.5 px-3 py-1.5">
              <span className="truncate text-[15px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
                {loading ? "…" : user ? formatTON(mainBalance) : "—"}
              </span>
              <TonIcon variant="brand" className="h-4 w-4 shrink-0" />
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
              className="app-control flex h-9 w-9 shrink-0 items-center justify-center rounded-r-full border-l border-[var(--border)] text-muted hover:bg-accent/15 hover:text-accent active:bg-accent/20"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
