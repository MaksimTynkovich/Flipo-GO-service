"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatTON,
  deleteAdminPromoCode,
  getAdminPromoCodes,
  getReferralStats,
  upsertAdminPromoCode,
  type AdminPromoCode,
  type ReferralStats,
} from "@/lib/api";

const EMPTY_PROMO: AdminPromoCode = {
  code: "",
  bonus_nanoton: 500_000_000,
  wager_multiplier: 3,
  max_uses: 100,
  used_count: 0,
  active: true,
};

export default function AdminMarketingPage() {
  const { showToast } = useToast();
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [draft, setDraft] = useState<AdminPromoCode>(EMPTY_PROMO);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const promoCode = draft.code.trim();

  async function load() {
    const [promoData, referralData] = await Promise.all([getAdminPromoCodes(), getReferralStats()]);
    setPromos(promoData);
    setReferral(referralData);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function handleDelete(code: string) {
    if (!window.confirm(`Удалить промокод ${code}?`)) return;
    setDeletingCode(code);
    try {
      await deleteAdminPromoCode(code);
      showToast({ variant: "success", title: "Промокод удалён" });
      if (draft.code === code) setDraft(EMPTY_PROMO);
      await load();
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось удалить",
      });
    } finally {
      setDeletingCode(null);
    }
  }

  return (
    <PageShell title="Маркетинг" description="Промокоды с вейджером и реферальная система.">
      {referral ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Рефералов" value={String(referral.referral_count)} />
          <Stat label="Заработано" value={`${formatTON(referral.total_earned_nanoton)} TON`} />
          <Stat label="Share %" value={`${referral.share_percent}%`} />
          <Stat label="Weekly share" value={`${referral.share_percent_weekly}%`} />
        </section>
      ) : null}

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Промокоды</p>
        {promos.map((promo) => (
          <div key={promo.code} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{promo.code}</span>
                  <span>
                    +{formatTON(promo.bonus_nanoton)} TON · x{promo.wager_multiplier} wager
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {promo.used_count}/{promo.max_uses || "∞"} · {promo.active ? "active" : "off"}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-300 transition-colors active:bg-red-500/10 disabled:opacity-50"
                disabled={deletingCode === promo.code}
                onClick={() => handleDelete(promo.code).catch(() => {})}
              >
                {deletingCode === promo.code ? "…" : "Удалить"}
              </button>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="input-field"
            placeholder="CODE"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
          />
          <input
            className="input-field"
            type="number"
            placeholder="Bonus nanoton"
            value={draft.bonus_nanoton}
            onChange={(e) => setDraft({ ...draft, bonus_nanoton: Number(e.target.value) })}
          />
          <input
            className="input-field"
            type="number"
            placeholder="Wager multiplier"
            value={draft.wager_multiplier}
            onChange={(e) => setDraft({ ...draft, wager_multiplier: Number(e.target.value) })}
          />
          <input
            className="input-field"
            type="number"
            placeholder="Max uses"
            value={draft.max_uses}
            onChange={(e) => setDraft({ ...draft, max_uses: Number(e.target.value) })}
          />
        </div>
        <button
          className="quick-amount quick-amount-active"
          disabled={!promoCode}
          onClick={async () => {
            if (!promoCode) {
              showToast({ variant: "error", title: "Введите промокод" });
              return;
            }
            await upsertAdminPromoCode({ ...draft, code: promoCode.toUpperCase() });
            showToast({ variant: "success", title: "Промокод сохранён" });
            setDraft(EMPTY_PROMO);
            await load();
          }}
        >
          Создать / обновить промокод
        </button>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
