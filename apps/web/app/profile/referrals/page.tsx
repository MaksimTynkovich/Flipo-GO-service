"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON, getReferralStats, ReferralStats } from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import { REFERRAL_MONTHLY_SHARE_PERCENT } from "@/lib/referral";
import { ArrowUpRight, Copy, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";

export default function ProfileReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const referralLink = user ? referralTelegramUrl(user.id) : referralTelegramUrl("");

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
      <section className="panel overflow-hidden p-0">
        <div className="bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--accent)_20%,transparent),_transparent_60%)] px-5 py-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <span className="chip chip-accent">Referral Program</span>
              <div className="space-y-2">
                <p className="text-[1.4rem] font-semibold leading-tight text-foreground">
                  Приглашай друзей и строй свой пассивный доход
                </p>
                <p className="text-sm leading-relaxed text-muted">
                  Получай {REFERRAL_MONTHLY_SHARE_PERCENT}% от дохода со стейкинга каждого
                  приглашённого друга. Бонус начисляется автоматически каждый день и сразу поступает
                  на баланс.
                </p>
              </div>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_20%,transparent)]">
              <Users className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">Приглашено</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {loading ? "…" : (stats?.referral_count ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-raised/80 p-3">
              <p className="text-[11px] text-muted">Всего заработано</p>
              <div className="mt-1 text-xl font-bold tabular-nums text-success">
                {loading ? (
                  "…"
                ) : (
                  <TonAmount
                    amount={`+${formatTON(stats?.total_earned_nanoton ?? 0)}`}
                    variant="brand"
                    iconClassName="h-5 w-5"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="panel space-y-2">
          <div className="icon-box h-10 w-10 rounded-xl">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Рост вместе с сетью</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Чем активнее и сильнее стейк у твоих рефералов, тем выше твой пассивный доход.
            </p>
          </div>
        </div>

        <div className="panel space-y-2">
          <div className="icon-box h-10 w-10 rounded-xl">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Ежедневные начисления</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Бонус приходит каждый день автоматически и сразу становится доступен на балансе.
            </p>
          </div>
        </div>

        <div className="panel space-y-2">
          <div className="icon-box h-10 w-10 rounded-xl">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Без лимита сверху</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Приглашай больше друзей и превращай раздел рефералов в дополнительный источник TON.
            </p>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="section-label">Твоя ссылка</p>
        </div>
        <div className="space-y-4 p-4">
          <div className="rounded-2xl bg-surface-raised/70 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Referral Link</p>
            <p className="mt-2 break-all text-sm leading-relaxed text-foreground/90">{referralLink}</p>
          </div>

          <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Как это работает</p>
                <p className="text-xs leading-relaxed text-muted">
                  Отправь ссылку другу. Как только он начнёт зарабатывать на стейкинге, часть его
                  дохода будет ежедневно начисляться и тебе.
                </p>
              </div>
            </div>
          </div>

          <Button className="h-11 w-full rounded-xl" variant="outline" onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
