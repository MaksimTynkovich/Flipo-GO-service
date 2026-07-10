"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Shield,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  activatePromoCode,
  ApiRequestError,
  formatTON,
  getMe,
} from "@/lib/api";
import { hasPromoBalance, mainBalanceNanoton } from "@/lib/balance";
import { PROMO_REQUIRED_CHANNEL, promoChannelMention, promoChannelUrl } from "@/lib/promo-channel";
import { shortenTonWalletAddress } from "@/lib/wallet";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { REFERRAL_MONTHLY_SHARE_PERCENT } from "@/lib/referral";
import { cn } from "@/lib/utils";

export function ProfileOverviewView() {
  const { user, loading, setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChannelLink, setPromoChannelLink] = useState<{ url: string; label: string } | null>(
    null,
  );

  const walletConnected = Boolean(user?.ton_wallet?.trim());
  const showPromoBalance = !loading && user && hasPromoBalance(user);

  async function activatePromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoMessage(null);
    setPromoError(null);
    setPromoChannelLink(null);
    try {
      const status = await activatePromoCode(promoCode.trim());
      setPromoCode("");
      try {
        setUser(await getMe());
      } catch {
        // WS balance update may still refresh balances.
      }
      setPromoMessage(
        status.replaced_promo_code
          ? `Активирован. ${status.replaced_promo_code} отменён`
          : "Промокод активирован",
      );
      haptics.notificationOccurred("success");
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "Не удалось активировать");
      if (e instanceof ApiRequestError && e.code === "channel_not_subscribed") {
        const channel = e.channel || PROMO_REQUIRED_CHANNEL;
        const url = promoChannelUrl(channel);
        const label = promoChannelMention(channel);
        if (url && label) {
          setPromoChannelLink({ url, label });
        }
      }
      haptics.notificationOccurred("error");
    } finally {
      setPromoLoading(false);
    }
  }

  return (
    <PageShell flush className="space-y-4">
      <section className="flex min-w-0 items-center gap-3.5 pt-1">
        <UserAvatar user={user} size={56} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.25rem] font-semibold leading-tight tracking-tight">
            {loading ? "…" : user?.first_name || "Игрок"}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {user ? `@${user.username || user.telegram_id}` : "Telegram Web App"}
          </p>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted">Баланс</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1 text-[1.125rem] font-semibold tabular-nums leading-none">
                {loading ? "…" : user ? formatTON(mainBalanceNanoton(user)) : "—"}
                <TonIcon variant="brand" className="h-5 w-5" />
              </span>
              {showPromoBalance ? (
                <span className="text-xs font-semibold tabular-nums text-accent">
                  +{formatTON(user.promo_balance ?? 0)} бонус
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={APP_ROUTES.deposit}
            onClick={() => haptics.impactOccurred("medium")}
            className="app-control btn-primary shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold"
          >
            Пополнить
          </Link>
        </div>

        <div className="hairline-top" />

        <Link
          href={APP_ROUTES.deposit}
          onClick={() => haptics.impactOccurred("light")}
          className="app-control flex items-center gap-3 px-4 py-3 active:bg-surface-raised/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted">
            <Wallet className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">TON-кошелёк</span>
            <span
              className={cn(
                "mt-0.5 block truncate text-xs",
                walletConnected ? "font-mono text-muted" : "text-muted",
              )}
            >
              {walletConnected
                ? shortenTonWalletAddress(user!.ton_wallet!)
                : "Не подключён — подключить"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </section>

      <section className="panel overflow-hidden p-0">
        <ProfileMenuLink
          href={APP_ROUTES.profileStaking}
          icon={<Sparkles className="h-4 w-4" />}
          title="Стейкинг"
          subtitle="Доход с подарков"
          onClick={() => haptics.impactOccurred("medium")}
        />
        <div className="mx-4 hairline-top" />
        <ProfileMenuLink
          href={APP_ROUTES.profileReferrals}
          icon={<Users className="h-4 w-4" />}
          title="Рефералы"
          subtitle={`${REFERRAL_MONTHLY_SHARE_PERCENT}% со стейкинга друзей`}
          onClick={() => haptics.impactOccurred("medium")}
        />
        {user?.is_admin ? (
          <>
            <div className="mx-4 hairline-top" />
            <ProfileMenuLink
              href={APP_ROUTES.admin}
              icon={<Shield className="h-4 w-4" />}
              title="Система"
              subtitle="Админ-панель"
              onClick={() => haptics.impactOccurred("medium")}
            />
          </>
        ) : null}
      </section>

      <section className="panel overflow-hidden p-0">
        <button
          type="button"
          onClick={() => {
            setPromoOpen((v) => !v);
            haptics.impactOccurred("light");
          }}
          className="app-control flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-raised/60"
          aria-expanded={promoOpen}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <Ticket className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Промокод</span>
            <span className="mt-0.5 block text-xs text-muted">Активировать бонус</span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
              promoOpen && "rotate-180",
            )}
          />
        </button>

        {promoOpen ? (
          <div className="segment-panel space-y-3 border-t border-[var(--border)] px-4 pb-4 pt-3">
            <div className="flex gap-2">
              <input
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase());
                  if (promoError) setPromoError(null);
                  if (promoChannelLink) setPromoChannelLink(null);
                  if (promoMessage) setPromoMessage(null);
                }}
                className="input-field h-10 flex-1"
                placeholder="Введите код"
                autoFocus
              />
              <button
                type="button"
                className="quick-amount quick-amount-active h-10 shrink-0 px-3.5"
                disabled={promoLoading || !promoCode.trim()}
                onClick={() => activatePromo().catch(() => {})}
              >
                {promoLoading ? "…" : "OK"}
              </button>
            </div>
            {promoError ? (
              <div className="space-y-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <p>{promoError}</p>
                {promoChannelLink ? (
                  <a
                    href={promoChannelLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex font-semibold text-accent underline underline-offset-2"
                  >
                    Подписаться на {promoChannelLink.label}
                  </a>
                ) : null}
              </div>
            ) : null}
            {promoMessage ? (
              <p className="rounded-xl bg-[color:var(--success)]/10 px-3 py-2 text-xs text-[color:var(--success)]">
                {promoMessage}
              </p>
            ) : null}
          </div>
        ) : null}
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
      className="app-control flex items-center gap-3 px-4 py-3.5 active:bg-surface-raised/60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}
