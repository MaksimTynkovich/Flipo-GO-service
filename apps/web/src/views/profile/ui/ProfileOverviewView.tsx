"use client";

import Link from "next/link";
import {
  ChevronRight,
  Gift,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { shortenTonWalletAddress } from "@/lib/wallet";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { REFERRAL_MONTHLY_SHARE_PERCENT } from "@/lib/referral";
import { cn } from "@/lib/utils";

export function ProfileOverviewView() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();

  const walletConnected = Boolean(user?.ton_wallet?.trim());

  return (
    <PageShell flush className="space-y-5">
      <section className="flex min-w-0 items-center gap-4 pt-1">
        <UserAvatar user={user} size={64} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.45rem] font-semibold leading-tight tracking-tight">
            {loading ? "…" : user?.first_name || "Игрок"}
          </h1>
          <p className="mt-1 truncate text-[0.9375rem] text-muted">
            {user ? `@${user.username || user.telegram_id}` : "Telegram Web App"}
          </p>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Баланс</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1.5 text-[1.3rem] font-semibold tabular-nums leading-none">
                {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
                <TonIcon variant="brand" className="h-6 w-6" />
              </span>
            </div>
          </div>
          <Link
            href={APP_ROUTES.deposit}
            onClick={() => haptics.impactOccurred("medium")}
            className="app-control btn-primary shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Пополнить
          </Link>
        </div>

        <div className="hairline-top" />

        <Link
          href={APP_ROUTES.deposit}
          onClick={() => haptics.impactOccurred("light")}
          className="app-control flex min-h-[3.5rem] items-center gap-3.5 px-4 py-3.5 active:bg-surface-raised/60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-muted">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium text-foreground">TON-кошелёк</span>
            <span
              className={cn(
                "mt-0.5 block truncate text-[0.8125rem]",
                walletConnected ? "font-mono text-muted" : "text-muted",
              )}
            >
              {walletConnected
                ? shortenTonWalletAddress(user!.ton_wallet!)
                : "Не подключён — подключите"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      </section>

      <section className="panel overflow-hidden p-0">
        <ProfileMenuLink
          href={APP_ROUTES.inventory}
          icon={<Gift className="h-5 w-5" />}
          title="Инвентарь"
          subtitle="Подарки и быстрая продажа"
          onClick={() => haptics.impactOccurred("medium")}
        />
        <div className="mx-4 hairline-top" />
        <ProfileMenuLink
          href={APP_ROUTES.profileStaking}
          icon={<Sparkles className="h-5 w-5" />}
          title="Стейкинг"
          subtitle="До 48% APR"
          onClick={() => haptics.impactOccurred("medium")}
        />
        <div className="mx-4 hairline-top" />
        <ProfileMenuLink
          href={APP_ROUTES.profileReferrals}
          icon={<Users className="h-5 w-5" />}
          title="Рефералы"
          subtitle={`${REFERRAL_MONTHLY_SHARE_PERCENT}% со стейкинга друзей`}
          onClick={() => haptics.impactOccurred("medium")}
        />
      </section>
    </PageShell>
  );
}

function ProfileMenuLink({
  href,
  icon,
  title,
  subtitle,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="app-control flex min-h-[3.75rem] items-center gap-3.5 px-4 py-4 active:bg-surface-raised/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] text-muted">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
