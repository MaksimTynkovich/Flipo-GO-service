"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Shield,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
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
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChannelLink, setPromoChannelLink] = useState<{ url: string; label: string } | null>(
    null,
  );
  const promoInputRef = useRef<HTMLInputElement | null>(null);

  const walletConnected = Boolean(user?.ton_wallet?.trim());
  const showPromoBalance = !loading && user && hasPromoBalance(user);

  useEffect(() => {
    if (!promoOpen) return;
    const timer = window.setTimeout(() => {
      const input = promoInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [promoOpen]);

  function openPromo() {
    setPromoError(null);
    setPromoChannelLink(null);
    setPromoOpen(true);
    haptics.impactOccurred("light");
  }

  async function activatePromo(closeModal?: () => void) {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoChannelLink(null);
    try {
      await activatePromoCode(promoCode.trim());
      setPromoCode("");
      try {
        setUser(await getMe());
      } catch {
        // WS balance update may still refresh balances.
      }
      haptics.notificationOccurred("success");
      closeModal?.();
      setPromoOpen(false);
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
          onClick={openPromo}
          className="app-control flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-raised/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <Ticket className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Промокод</span>
            <span className="mt-0.5 block text-xs text-muted">Активировать бонус</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </section>

      {promoOpen ? (
        <ModalOverlay onClose={() => setPromoOpen(false)} analyticsModalId="promo_code">
          {(close) => (
            <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
              <div className="mb-4 text-center">
                <p className="text-[15px] font-semibold text-foreground">Промокод</p>
                <p className="mt-1 text-xs text-muted">Введите код, чтобы получить бонус</p>
              </div>

              <div className="space-y-3">
                <input
                  ref={promoInputRef}
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    if (promoError) setPromoError(null);
                    if (promoChannelLink) setPromoChannelLink(null);
                  }}
                  onFocus={(e) => {
                    window.setTimeout(() => {
                      e.target.scrollIntoView({ block: "center", behavior: "smooth" });
                    }, 100);
                  }}
                  className="input-field h-12 text-center text-base font-semibold tracking-wide"
                  placeholder="Введите код"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void activatePromo(close);
                    }
                  }}
                />

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

                <Button
                  variant="accent"
                  className="h-11 w-full rounded-xl"
                  disabled={promoLoading || !promoCode.trim()}
                  onClick={() => activatePromo(close).catch(() => {})}
                >
                  {promoLoading ? "…" : "Активировать"}
                </Button>
              </div>
            </div>
          )}
        </ModalOverlay>
      ) : null}
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
