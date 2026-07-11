"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON, getReferralStats, ReferralStats } from "@/lib/api";
import { referralTelegramUrl } from "@/lib/bot";
import { REFERRAL_MONTHLY_SHARE_PERCENT } from "@/lib/referral";
import { openTelegramShare } from "@/src/shared/lib/twa";
import { Copy, Send } from "lucide-react";

export default function ProfileReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const referralLink = user ? referralTelegramUrl(user.telegram_id) : "";
  const shareText = [
    "Присоединяйся ко мне в Flipo!",
    "Играй, стейкай подарки и получай пассивный доход в TON.",
  ].join("\n");

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

  async function handleShare() {
    if (!referralLink) return;
    if (openTelegramShare({ url: referralLink, text: shareText })) {
      return;
    }
    await navigator.clipboard.writeText(`${referralLink}\n\n${shareText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell flush className="space-y-4">
      <section className="space-y-1.5 pt-1">
        <h1 className="text-[1.25rem] font-semibold tracking-tight">Рефералы</h1>
        <p className="text-sm leading-relaxed text-muted">
          {REFERRAL_MONTHLY_SHARE_PERCENT}% от дохода стейкинга друзей — каждый день на баланс.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Приглашено</p>
          <p className="mt-1.5 text-xl font-bold tabular-nums">
            {loading ? "…" : (stats?.referral_count ?? 0)}
          </p>
        </div>
        <div className="stat-tile">
          <p className="text-[11px] text-muted">Заработано</p>
          <div className="mt-1.5 text-xl font-bold tabular-nums text-success">
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
