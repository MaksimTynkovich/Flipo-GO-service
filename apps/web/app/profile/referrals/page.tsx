"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import {
  formatTON,
  getReferralInviteeStatus,
  getReferralStats,
  ReferralInviteeStatus,
  ReferralStats,
} from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import {
  REFERRAL_GGR_SHARE_PERCENT,
  REFERRAL_INVITEE_BOOST_PERCENT,
  REFERRAL_INVITEE_LIMIT_BONUS_TON,
  REFERRAL_MONTHLY_SHARE_PERCENT,
} from "@/lib/referral";
import { openTelegramShare } from "@/src/shared/lib/twa";
import { useAuth } from "@/components/providers/AuthProvider";
import { Copy, Gamepad2, Gift, Link2, Send, Sparkles } from "lucide-react";

export default function ProfileReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [invitee, setInvitee] = useState<ReferralInviteeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const referralLink = user ? referralTelegramUrl(user.telegram_id) : "";
  const shareText = ["🚀 Присоединяйся ко мне в Flipo!","💎 Стейкай подарки напрямую без передачи боту — твои активы остаются только у тебя! По моей ссылке ты получишь повышенный доход от стейкинга и больше бонусов за первый стейк! 🎁",].join("\n");

  useEffect(() => {
    Promise.all([getReferralStats(), getReferralInviteeStatus()])
      .then(([statsData, inviteeData]) => {
        setStats(statsData);
        setInvitee(inviteeData);
      })
      .catch(() => {
        setStats(null);
        setInvitee(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!referralLink) return;
    if (openTelegramShare({ url: referralLink, text: shareText })) {
      return;
    }
    await navigator.clipboard.writeText(`${referralLink}\n\n${shareText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sharePercent = stats?.share_percent ?? REFERRAL_MONTHLY_SHARE_PERCENT;
  const gamesPercent = stats?.ggr_share_percent ?? REFERRAL_GGR_SHARE_PERCENT;
  const limitBonusTon = invitee?.stake_limit_bonus_nanoton
    ? Math.round(invitee.stake_limit_bonus_nanoton / 1_000_000_000)
    : REFERRAL_INVITEE_LIMIT_BONUS_TON;
  const boostPercent = invitee?.staking_boost_percent ?? REFERRAL_INVITEE_BOOST_PERCENT;

  return (
    <PageShell flush className="space-y-4">
      <section className="space-y-1.5 pt-1">
        <h1 className="text-[1.25rem] font-semibold tracking-tight">Рефералы</h1>
        <p className="text-sm leading-relaxed text-muted">
          Бонусы за вход по ссылке и доход с приглашённых друзей.
        </p>
      </section>

      <InviteeSection
        loading={loading}
        invitee={invitee}
        boostPercent={boostPercent}
        limitBonusTon={limitBonusTon}
      />

      <section className="space-y-2">
        <p className="section-label">Приглашайте — зарабатывайте</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="stat-tile">
            <p className="text-[11px] text-muted">Приглашено</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums">
              {loading ? "…" : (stats?.referral_count ?? 0)}
            </p>
          </div>
          <div className="stat-tile">
            <p className="text-[11px] text-muted">Заработано</p>
            <div className="mt-1.5 text-lg font-bold tabular-nums text-success">
              {loading ? (
                "…"
              ) : (
                <TonAmount
                  amount={`+${formatTON(stats?.total_earned_nanoton ?? 0)}`}
                  variant="brand"
                  iconClassName="h-4 w-4"
                />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <InfoCard
            icon={<Gift className="h-4 w-4" />}
            title={`${sharePercent}% от стейкинга`}
            hint="Доля от дохода друзей по подаркам"
            value={loading ? "…" : `${formatTON(stats?.staking_earned_nanoton ?? 0)} TON`}
          />
          <InfoCard
            icon={<Gamepad2 className="h-4 w-4" />}
            title={`${gamesPercent}% от игр`}
            hint="Доля от игры друзей"
            value={loading ? "…" : `${formatTON(stats?.ggr_earned_nanoton ?? 0)} TON`}
          />
          <InfoCard
            icon={<Sparkles className="h-4 w-4" />}
            title="За первую ставку друга"
            hint="Бонус от 0.1 TON в игре"
            value={loading ? "…" : `${formatTON(stats?.milestone_earned_nanoton ?? 0)} TON`}
          />
        </div>
      </section>

      <section className="panel space-y-3">
        <div>
          <p className="section-label">Ваша ссылка</p>
          <p className="mt-2 break-all rounded-xl bg-surface-raised px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground/90">
            {referralLink || "…"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11 w-full rounded-xl" onClick={handleShare}>
            <Send className="mr-2 h-4 w-4" />
            Поделиться
          </Button>
          <Button className="h-11 w-full rounded-xl" variant="outline" onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
      </section>
    </PageShell>
  );
}

function InviteeSection({
  loading,
  invitee,
  boostPercent,
  limitBonusTon,
}: {
  loading: boolean;
  invitee: ReferralInviteeStatus | null;
  boostPercent: number;
  limitBonusTon: number;
}) {
  if (loading) {
    return (
      <section className="panel animate-pulse space-y-2 py-4">
        <div className="h-4 w-32 rounded bg-surface-raised" />
        <div className="h-10 rounded bg-surface-raised" />
      </section>
    );
  }

  if (!invitee?.has_referrer) {
    return (
      <section className="panel flex gap-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Вы зашли без реферальной ссылки</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Бонусы по реферальной ссылке доступны только новым пользователям.
          </p>
        </div>
      </section>
    );
  }

  if (invitee.perks_pending) {
    return (
      <section className="panel space-y-3 bg-accent/5 py-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Gift className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Вы пришли по приглашению</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Бонусы включатся после первого стейка подарка в разделе «Стейкинг».
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PerkCard
            value={`+${boostPercent}%`}
            label="к стейкингу"
            hint="На 30 дней"
            muted
          />
          <PerkCard
            value={`+${limitBonusTon}`}
            label="TON к лимиту"
            hint="Больше подарков"
            muted
          />
        </div>
        <p className="text-center text-[11px] text-muted">Ожидает первого стейка</p>
      </section>
    );
  }

  if (invitee.perks_active) {
    return (
      <section className="panel space-y-3 border border-success/20 bg-success/5 py-3">
        <p className="text-sm font-medium text-success">Бонусы по ссылке активны</p>
        <div className="grid grid-cols-2 gap-2">
          <PerkCard
            value={`+${boostPercent}%`}
            label="к стейкингу"
            hint="Уже в доходе"
          />
          <PerkCard
            value={`+${limitBonusTon}`}
            label="TON к лимиту"
            hint="В стейкинге"
          />
        </div>
        {invitee.expires_at ? (
          <p className="text-center text-[11px] text-muted">
            До {new Date(invitee.expires_at).toLocaleDateString("ru-RU")}
          </p>
        ) : null}
      </section>
    );
  }

  return null;
}

function InfoCard({
  icon,
  title,
  hint,
  value,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  value: string;
}) {
  return (
    <div className="panel flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-success">{value}</p>
    </div>
  );
}

function PerkCard({
  value,
  label,
  hint,
  muted,
}: {
  value: string;
  label: string;
  hint: string;
  muted?: boolean;
}) {
  return (
    <div className={`stat-tile text-center ${muted ? "opacity-70" : ""}`}>
      <p className="text-lg font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>
    </div>
  );
}
