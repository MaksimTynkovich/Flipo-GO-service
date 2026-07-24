"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { BalanceGainFx } from "@/src/widgets/app-shell/ui/BalanceGainFx";

export function AppHeader() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();

  return (
    <header className="app-header absolute left-0 right-0 top-0 z-50 bg-background pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] pt-[var(--app-safe-top)] hairline-bottom">
      <div className="app-container relative flex h-14 items-center justify-between gap-3">
        <Link
          href={APP_ROUTES.profile}
          aria-label="Профиль"
          onClick={() => haptics.impactOccurred("light")}
          className="app-control relative z-10 flex shrink-0 items-center rounded-full active:opacity-80"
        >
          <UserAvatar user={user} size={34} />
        </Link>

        <div
          className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
          aria-live="polite"
        >
          <BalanceGainFx />
        </div>

        <div className="relative z-10 flex min-w-0 items-center overflow-visible">
          <div className="balance-pill">
            <div className="balance-pill__amount">
              <TonIcon className="balance-pill__ton h-6 w-6 shrink-0" />
              <span className="balance-pill__value truncate">
                {loading ? "…" : user ? `${formatTON(user.betting_balance)}` : "—"}
              </span>
            </div>

            <Link
              href={APP_ROUTES.deposit}
              aria-label="Пополнить баланс"
              onClick={() => haptics.impactOccurred("medium")}
              className="app-control balance-pill__deposit"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
