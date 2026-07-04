"use client";

import Link from "next/link";
import { ChevronRight, Settings, Sparkles } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function ProfileOverviewView() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();

  return (
    <PageShell flush>
      <section className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={user} size={52} className="rounded-full" />
          <div className="min-w-0">
            <h1 className="truncate text-[1.375rem] font-semibold leading-tight">
              {loading ? "…" : user?.first_name || "Игрок"}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted">
              {user ? `@${user.username || user.telegram_id}` : "Telegram Web App"}
            </p>
          </div>
        </div>

        <Link
          href={APP_ROUTES.profileSettings}
          aria-label="Открыть настройки"
          onClick={() => haptics.impactOccurred("light")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-muted transition-opacity active:opacity-70"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Баланс</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
          </p>
        </div>
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Tier</p>
          <p className="mt-1 text-sm font-semibold capitalize">{loading ? "…" : user?.staking_tier || "—"}</p>
        </div>
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Кошелёк</p>
          <p className="mt-1 truncate text-sm font-semibold">{user?.ton_wallet ? "Есть" : "—"}</p>
        </div>
      </div>

      <Link
        href={APP_ROUTES.profileStaking}
        onClick={() => haptics.impactOccurred("medium")}
        className="panel flex items-center gap-3.5 transition-opacity active:opacity-80"
      >
        <div className="icon-box h-11 w-11">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Стейкинг</p>
          <p className="mt-0.5 text-xs text-muted">
            Пассивный доход · {user?.staking_tier === "boost" ? "до 5%/мес" : "до 3%/мес"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted/60" />
      </Link>
    </PageShell>
  );
}
