"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift, Plus, Shield, Sparkles, Users } from "lucide-react";
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

export function ProfileOverviewView() {
  const { user, loading, setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChannelLink, setPromoChannelLink] = useState<{ url: string; label: string } | null>(null);

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
          <p className="text-[11px] text-muted">Основной</p>
          <div className="mt-1 flex items-center justify-between gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold tabular-nums text-foreground">
              {loading ? "…" : user ? formatTON(mainBalanceNanoton(user)) : "—"}
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
        <div className="stat-tile border border-accent/20 bg-accent/5">
          <p className="text-[11px] text-accent">Бонус</p>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-semibold tabular-nums text-accent">
              {loading ? "…" : user && hasPromoBalance(user) ? formatTON(user.promo_balance ?? 0) : "0.00"}
            </span>
            <TonIcon variant="brand" className="h-4 w-4 shrink-0 opacity-80" />
          </div>
        </div>
      </div>

      <div className="stat-tile">
        <p className="text-[11px] text-muted">Кошелёк</p>
        <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
          {user?.ton_wallet?.trim()
            ? shortenTonWalletAddress(user.ton_wallet)
            : "Не подключён"}
        </p>
      </div>

      <section className="panel space-y-3">
        <p className="section-label px-0.5">Промокод</p>
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
          />
          <button
            className="quick-amount quick-amount-active h-10 px-4"
            disabled={promoLoading}
            onClick={() => activatePromo().catch(() => {})}
          >
            {promoLoading ? "…" : "Активировать"}
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
      </section>

      <section className="space-y-2">
        <p className="section-label px-0.5">Разделы</p>
        <div className="space-y-2">
          <Link
            href={APP_ROUTES.profileStaking}
            onClick={() => haptics.impactOccurred("medium")}
            className="app-control interactive-card panel stagger-item group flex items-center gap-3.5"
          >
            <div className="icon-box h-11 w-11 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Стейкинг подарков</p>
              <p className="mt-0.5 text-xs text-muted">Пассивный доход с Telegram Gifts</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" strokeWidth={2.25} />
            </div>
          </Link>

          <Link
            href={APP_ROUTES.inventory}
            onClick={() => haptics.impactOccurred("medium")}
            className="app-control interactive-card panel stagger-item group flex items-center gap-3.5"
            style={{ animationDelay: "70ms" }}
          >
            <div className="icon-box h-11 w-11 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Инвентарь</p>
              <p className="mt-0.5 text-xs text-muted">Твои подарки — продажа и выставление на маркет</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" strokeWidth={2.25} />
            </div>
          </Link>

          <Link
            href={APP_ROUTES.profileReferrals}
            onClick={() => haptics.impactOccurred("medium")}
            className="app-control interactive-card panel stagger-item group flex items-center gap-3.5"
            style={{ animationDelay: "140ms" }}
          >
            <div className="icon-box h-11 w-11 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Рефералы</p>
              <p className="mt-0.5 text-xs text-muted">3% с дохода стейкинга приглашённых</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-accent">
              <span className="text-xs font-semibold">Открыть</span>
              <ChevronRight className="h-5 w-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" strokeWidth={2.25} />
            </div>
          </Link>

          {user?.is_admin ? (
            <Link
              href={APP_ROUTES.admin}
              onClick={() => haptics.impactOccurred("medium")}
              className="app-control interactive-card panel stagger-item group flex items-center gap-3.5"
              style={{ animationDelay: "210ms" }}
            >
              <div className="icon-box h-11 w-11 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3">
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Система</p>
                <p className="mt-0.5 text-xs text-muted">Финансы, риски, RTP и управление проектом</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-accent">
                <span className="text-xs font-semibold">Открыть</span>
                <ChevronRight className="h-5 w-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" strokeWidth={2.25} />
              </div>
            </Link>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
