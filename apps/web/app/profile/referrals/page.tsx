"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON, getReferralStats, ReferralStats } from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import {
  REFERRAL_MONTHLY_SHARE_PERCENT,
  REFERRAL_WEEKLY_SHARE_PERCENT,
  referralWeeklyFromPrincipal,
} from "@/lib/referral";
import { Copy, Users } from "lucide-react";

const EXAMPLE_PRINCIPAL_TON = 100;

export default function ProfileReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const referralLink = user ? referralTelegramUrl(user.id) : referralTelegramUrl("");

  const exampleWeeklyNanoton = referralWeeklyFromPrincipal(EXAMPLE_PRINCIPAL_TON * 1_000_000_000, 0.03);
  const exampleWeeklyBoostNanoton = referralWeeklyFromPrincipal(EXAMPLE_PRINCIPAL_TON * 1_000_000_000, 0.05);

  useEffect(() => {
    getReferralStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell flush>
      <div className="panel flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15">
          <Users className="h-8 w-8 text-success" />
        </div>
        <div>
          <p className="font-semibold">Реферальная программа</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Получай {REFERRAL_MONTHLY_SHARE_PERCENT}% с ежемесячного дохода стейкинга каждого приглашённого друга.
            Выплата раз в неделю вместе с эпохой стейкинга.
          </p>
        </div>
      </div>

      <div className="panel space-y-3">
        <p className="section-label">Сколько в неделю</p>
        <p className="text-sm leading-relaxed text-muted">
          {REFERRAL_MONTHLY_SHARE_PERCENT}% в месяц — это примерно{" "}
          <span className="font-medium text-foreground">
            {REFERRAL_WEEKLY_SHARE_PERCENT.toFixed(4)}%
          </span>{" "}
          от недельного дохода стейкинга реферала (эпоха 7 дней).
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="stat-tile text-left">
            <p className="text-muted">1 реферал · 100 TON · 3%/мес</p>
            <p className="mt-1 font-semibold tabular-nums text-success">
              +<TonAmount amount={formatTON(exampleWeeklyNanoton)} variant="brand" iconClassName="h-4 w-4" />
              <span className="text-muted"> /нед</span>
            </p>
          </div>
          <div className="stat-tile text-left">
            <p className="text-muted">1 реферал · 100 TON · 5%/мес</p>
            <p className="mt-1 font-semibold tabular-nums text-success">
              +<TonAmount amount={formatTON(exampleWeeklyBoostNanoton)} variant="brand" iconClassName="h-4 w-4" />
              <span className="text-muted"> /нед</span>
            </p>
          </div>
        </div>
      </div>

      <div className="panel space-y-3">
        <p className="section-label">Твоя ссылка</p>
        <p className="break-all text-sm text-muted">{referralLink}</p>
        <Button className="w-full" variant="outline" onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Скопировано" : "Копировать ссылку"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="panel text-center">
          <p className="text-2xl font-bold tabular-nums">
            {loading ? "…" : (stats?.referral_count ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">Приглашено</p>
        </div>
        <div className="panel text-center">
          <p className="text-2xl font-bold tabular-nums text-success">
            {loading ? (
              "…"
            ) : (
              <TonAmount
                amount={`+${formatTON(stats?.total_earned_nanoton ?? 0)}`}
                variant="brand"
                iconClassName="h-5 w-5"
              />
            )}
          </p>
          <p className="mt-1 text-xs text-muted">Заработано</p>
        </div>
      </div>
    </PageShell>
  );
}
