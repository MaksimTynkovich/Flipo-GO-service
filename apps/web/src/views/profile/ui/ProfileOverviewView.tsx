"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Gift,
  Languages,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { formatTON, updateLocale } from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";
import { shortenTonWalletAddress } from "@/lib/wallet";
import { TonIcon } from "@/components/icons/TonIcon";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { REFERRAL_MONTHLY_SHARE_PERCENT } from "@/lib/referral";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/i18n";

export function ProfileOverviewView() {
  const { user, loading, setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const { t, locale, setLocale } = useI18n();
  const { showToast } = useToast();
  const [savingLocale, setSavingLocale] = useState(false);

  const walletConnected = Boolean(user?.ton_wallet?.trim());

  async function handleLocaleChange(next: Locale) {
    if (next === locale || savingLocale) return;
    const previous = locale;
    setLocale(next);
    haptics.selectionChanged();
    setSavingLocale(true);
    try {
      const updated = await updateLocale(next);
      setUser(updated);
    } catch (error) {
      setLocale(previous);
      showToast({
        variant: "error",
        title: formatUserError(error, t("profile.languageFailed")),
      });
    } finally {
      setSavingLocale(false);
    }
  }

  return (
    <PageShell flush className="space-y-5">
      <section className="flex min-w-0 items-center gap-4 pt-1">
        <UserAvatar user={user} size={64} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.45rem] font-semibold leading-tight tracking-tight">
            {loading ? "…" : user?.first_name || t("common.player")}
          </h1>
          <p className="mt-1 truncate text-[0.9375rem] text-muted">
            {user ? `@${user.username || user.telegram_id}` : "Telegram Web App"}
          </p>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{t("profile.balance")}</p>
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
            {t("profile.topUp")}
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
            <span className="block text-[0.9375rem] font-medium text-foreground">{t("profile.wallet")}</span>
            <span
              className={cn(
                "mt-0.5 block truncate text-[0.8125rem]",
                walletConnected ? "font-mono text-muted" : "text-muted",
              )}
            >
              {walletConnected
                ? shortenTonWalletAddress(user!.ton_wallet!)
                : t("profile.walletDisconnected")}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      </section>

      <section className="panel overflow-hidden p-0">
        <ProfileMenuLink
          href={APP_ROUTES.inventory}
          icon={<Gift className="h-5 w-5" />}
          title={t("nav.inventory")}
          subtitle={t("profile.inventorySubtitle")}
          onClick={() => haptics.impactOccurred("medium")}
        />
        <div className="mx-4 hairline-top" />
        <ProfileMenuLink
          href={APP_ROUTES.profileStaking}
          icon={<Sparkles className="h-5 w-5" />}
          title={t("nav.staking")}
          subtitle={t("profile.stakingSubtitle")}
          onClick={() => haptics.impactOccurred("medium")}
        />
        <div className="mx-4 hairline-top" />
        <ProfileMenuLink
          href={APP_ROUTES.profileReferrals}
          icon={<Users className="h-5 w-5" />}
          title={t("nav.referrals")}
          subtitle={t("profile.referralsSubtitle", { percent: REFERRAL_MONTHLY_SHARE_PERCENT })}
          onClick={() => haptics.impactOccurred("medium")}
        />
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="flex min-h-[3.75rem] items-center gap-3.5 px-4 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
            <Languages className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium text-foreground">{t("profile.language")}</span>
            <span className="mt-0.5 block text-[0.8125rem] text-muted">{t("profile.languageHint")}</span>
          </span>
        </div>
        <div className="px-4 pb-4">
          <div className="segment-control">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                disabled={savingLocale}
                onClick={() => void handleLocaleChange(code)}
                className={cn(
                  "app-control min-h-10 flex-1 rounded-xl text-sm font-semibold",
                  locale === code ? "bg-surface-raised text-foreground" : "text-muted",
                )}
              >
                {code === "en" ? t("profile.languageEn") : t("profile.languageRu")}
              </button>
            ))}
          </div>
        </div>
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
