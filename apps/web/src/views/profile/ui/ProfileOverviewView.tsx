"use client";

import Link from "next/link";
import { Settings, ShieldCheck, Sparkles, Wallet } from "lucide-react";
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
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">
              {loading ? "…" : user?.first_name || "Игрок"}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {user ? `@${user.username || user.telegram_id}` : "Личный кабинет и статистика"}
            </p>
          </div>

          <Link
            href={APP_ROUTES.profileSettings}
            aria-label="Открыть настройки"
            onClick={() => haptics.impactOccurred("light")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface transition-colors active:bg-surface-raised"
          >
            <Settings className="h-5 w-5 text-muted" />
          </Link>
        </div>

        <div className="panel space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar user={user} size={60} className="rounded-3xl" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{loading ? "…" : user?.first_name || "Игрок"}</p>
              <p className="truncate text-sm text-muted">
                {user ? `Telegram ID ${user.telegram_id}` : "Telegram Web App"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-surface-raised px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Баланс</p>
              <p className="mt-1 text-sm font-bold tabular-nums">
                {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-raised px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Tier</p>
              <p className="mt-1 text-sm font-bold capitalize">
                {loading ? "…" : user?.staking_tier || "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-raised px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Кошелёк</p>
              <p className="mt-1 truncate text-sm font-bold">{user?.ton_wallet ? "Есть" : "Не подключен"}</p>
            </div>
          </div>
        </div>
      </section>

      <Link
        href={APP_ROUTES.profileStaking}
        onClick={() => haptics.impactOccurred("medium")}
        className="panel block space-y-4 transition-colors active:bg-surface-raised"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label">Пассивный доход</p>
            <h2 className="mt-2 text-xl font-bold">Стейкинг подарков</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Открой полный раздел стейкинга — управление доходом и портфелем подарков.
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-accent/15">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-surface-raised px-3 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              Текущий план
            </div>
            <p className="mt-1 text-sm font-bold capitalize">{user?.staking_tier || "base"}</p>
          </div>
          <div className="rounded-2xl bg-surface-raised px-3 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Wallet className="h-3.5 w-3.5" />
              Доходность
            </div>
            <p className="mt-1 text-sm font-bold">{user?.staking_tier === "boost" ? "До 5%/мес" : "До 3%/мес"}</p>
          </div>
        </div>
      </Link>
    </PageShell>
  );
}
