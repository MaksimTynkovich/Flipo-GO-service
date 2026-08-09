"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin/admin-ui";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { formatTON, getReferralStats, type ReferralStats } from "@/lib/api";

export default function MarketingSection() {
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);

  async function loadReferral() {
    setReferralLoading(true);
    try {
      const data = await loadCached("admin:marketing:referral", getReferralStats);
      setReferral(data);
      primeCache("admin:marketing:referral", data);
    } finally {
      setReferralLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedReferral = readCached<ReferralStats>("admin:marketing:referral");
      if (cachedReferral) setReferral(cachedReferral);
      loadReferral().catch(() => {});
    });
  }, []);

  return (
    <AdminPage
      title="Маркетинг"
      description="Реферальные метрики. Балансовые промокоды отключены — используйте промо кейсов."
    >
      {referral ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Рефералов"
            value={String(referral.referral_count)}
            hint="Сколько пользователей закрепились за текущим реферером."
          />
          <Stat
            label="Заработано"
            value={`${formatTON(referral.total_earned_nanoton)} TON`}
            hint="Сколько TON всего начислено рефереру за счёт бонусов от приглашённых."
          />
          <Stat
            label="Share %"
            value={`${referral.share_percent.toFixed(2)}%`}
            hint="Доля от дохода приглашённого пользователя, которая начисляется рефереру."
          />
          <Stat
            label="GGR share"
            value={`${referral.ggr_share_percent.toFixed(2)}%`}
            hint="Доля от игрового GGR квалифицированных рефералов."
          />
        </section>
      ) : referralLoading ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel p-3">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
              <div className="mt-2 h-5 w-24 animate-pulse rounded bg-surface-raised" />
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel space-y-2">
        <p className="text-base font-semibold">Промокоды на баланс</p>
        <p className="text-sm text-muted">
          Раздел отключён: балансовые промо больше не раздаются. Промокоды на открытие кейса
          настраиваются в{" "}
          <Link href="/admin/cases" className="font-medium text-accent underline underline-offset-2">
            Кейсы
          </Link>
          .
        </p>
      </section>
    </AdminPage>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted">{label}</p>
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
