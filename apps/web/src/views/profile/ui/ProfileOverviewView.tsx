"use client";

import Link from "next/link";
import { ChevronRight, Gift, Plus, Sparkles, Users } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function ProfileOverviewView() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();

  return (
    <PageShell flush>
      <section className="flex min-w-0 items-center gap-3">
        <UserAvatar user={user} size={52} className="rounded-full" />
        <div className="min-w-0">
          <h1 className="truncate text-[1.375rem] font-semibold leading-tight">
            {loading ? "…" : user?.first_name || "Игрок"}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {user ? `@${user.username || user.telegram_id}` : "Telegram Web App"}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Баланс</p>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold tabular-nums text-foreground">
              {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
              <TonIcon variant="brand" className="h-4 w-4 shrink-0" />
            </span>
            <Link
              href={APP_ROUTES.deposit}
              aria-label="Пополнить баланс"
              onClick={() => haptics.impactOccurred("medium")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-muted transition-colors active:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Кошелёк</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {user?.ton_wallet ? "Подключён" : "Не подключён"}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <p className="section-label px-0.5">Разделы</p>
        <div className="space-y-2">
          <Link
            href={APP_ROUTES.profileStaking}
            onClick={() => haptics.impactOccurred("medium")}
            className="panel flex items-center gap-3.5 transition-transform active:scale-[0.99]"
          >
            <div className="icon-box h-11 w-11">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Стейкинг подарков</p>
              <p className="mt-0.5 text-xs text-muted">Пассивный доход с Telegram Gifts</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
            </div>
          </Link>

          <Link
            href={APP_ROUTES.inventory}
            onClick={() => haptics.impactOccurred("medium")}
            className="panel flex items-center gap-3.5 transition-transform active:scale-[0.99]"
          >
            <div className="icon-box h-11 w-11">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Инвентарь</p>
              <p className="mt-0.5 text-xs text-muted">Твои подарки — продажа и выставление на маркет</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
            </div>
          </Link>

          <Link
            href={APP_ROUTES.profileReferrals}
            onClick={() => haptics.impactOccurred("medium")}
            className="panel flex items-center gap-3.5 transition-transform active:scale-[0.99]"
          >
            <div className="icon-box h-11 w-11">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Рефералы</p>
              <p className="mt-0.5 text-xs text-muted">Приглашай друзей и получай бонусы</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
            </div>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
