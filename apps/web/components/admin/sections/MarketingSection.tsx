"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  getAdminYieldSettings,
  formatTON,
  deleteAdminPromoCode,
  getAdminPromoCodes,
  getReferralStats,
  updateAdminYieldSettings,
  upsertAdminPromoCode,
  type AdminPromoCode,
  type AdminYieldSettings,
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

const DEFAULT_YIELD_SETTINGS: AdminYieldSettings = {
  id: 1,
  referral_share_percent: 3,
  staking_base_monthly_percent: 3,
  staking_boost_monthly_percent: 5,
};

export default function MarketingSection() {
  const { showToast } = useToast();
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [draft, setDraft] = useState<AdminPromoCode>(EMPTY_PROMO);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [yieldSettings, setYieldSettings] = useState<AdminYieldSettings | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [promosLoading, setPromosLoading] = useState(true);
  const [referralLoading, setReferralLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const promoCode = draft.code.trim();

  async function loadPromos() {
    setPromosLoading(true);
    try {
      const data = await loadCached("admin:marketing:promos", getAdminPromoCodes);
      setPromos(data);
      primeCache("admin:marketing:promos", data);
    } finally {
      setPromosLoading(false);
    }
  }

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

  async function loadYieldSettings() {
    setSettingsLoading(true);
    try {
      const data = await loadCached("admin:marketing:settings", getAdminYieldSettings);
      setYieldSettings(data);
      primeCache("admin:marketing:settings", data);
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedPromos = readCached<AdminPromoCode[]>("admin:marketing:promos");
      if (cachedPromos) setPromos(cachedPromos);
      const cachedReferral = readCached<ReferralStats>("admin:marketing:referral");
      if (cachedReferral) setReferral(cachedReferral);
      const cachedSettings = readCached<AdminYieldSettings>("admin:marketing:settings");
      if (cachedSettings) setYieldSettings(cachedSettings);
      loadPromos().catch(() => {});
      loadReferral().catch(() => {});
      loadYieldSettings().catch(() => {});
    });
  }, []);

  const settingsForm = yieldSettings ?? DEFAULT_YIELD_SETTINGS;

  async function handleDelete(code: string) {
    if (!window.confirm(`Удалить промокод ${code}?`)) return;
    setDeletingCode(code);
    try {
      await deleteAdminPromoCode(code);
      showToast({ variant: "success", title: "Промокод удалён" });
      if (draft.code === code) setDraft(EMPTY_PROMO);
      await loadPromos();
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
          <Stat label="Рефералов" value={String(referral.referral_count)} hint="Сколько пользователей закрепились за текущим реферером." />
          <Stat label="Заработано" value={`${formatTON(referral.total_earned_nanoton)} TON`} hint="Сколько TON всего начислено рефереру за счёт бонусов от приглашённых." />
          <Stat label="Share %" value={`${referral.share_percent.toFixed(2)}%`} hint="Доля от дохода приглашённого пользователя, которая начисляется рефереру." />
          <Stat label="Weekly share" value={`${referral.share_percent_weekly.toFixed(2)}%`} hint="Эффективная недельная доля при текущей схеме начисления бонуса." />
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

      <section className="panel space-y-3">
        <div>
          <p className="text-base font-semibold">Проценты системы</p>
          <p className="text-sm text-muted">Настройки применяются к новым расчётам стейкинга и реферальных начислений.</p>
        </div>
        {settingsLoading && !yieldSettings ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
                <div className="mt-2 h-10 w-full animate-pulse rounded bg-surface-raised" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted">
                Реферальный процент
                <input
                  className="input-field mt-1"
                  type="number"
                  min={0}
                  step="0.1"
                  value={settingsForm.referral_share_percent}
                  onChange={(e) =>
                    setYieldSettings({
                      ...settingsForm,
                      referral_share_percent: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Staking base % / месяц
                <input
                  className="input-field mt-1"
                  type="number"
                  min={0}
                  step="0.1"
                  value={settingsForm.staking_base_monthly_percent}
                  onChange={(e) =>
                    setYieldSettings({
                      ...settingsForm,
                      staking_base_monthly_percent: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Staking boost % / месяц
                <input
                  className="input-field mt-1"
                  type="number"
                  min={0}
                  step="0.1"
                  value={settingsForm.staking_boost_monthly_percent}
                  onChange={(e) =>
                    setYieldSettings({
                      ...settingsForm,
                      staking_boost_monthly_percent: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <button
              className="quick-amount quick-amount-active"
              onClick={async () => {
                await updateAdminYieldSettings(settingsForm);
                primeCache("admin:marketing:settings", settingsForm);
                setYieldSettings(settingsForm);
                await loadReferral();
                showToast({ variant: "success", title: "Проценты сохранены" });
              }}
            >
              Сохранить проценты
            </button>
          </>
        )}
      </section>

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Промокоды</p>
        {promos.length === 0 && promosLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-raised" />
              <div className="mt-2 h-3 w-40 animate-pulse rounded bg-surface-raised" />
            </div>
          ))
        ) : (
          promos.map((promo) => (
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
          ))
        )}

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
            await loadPromos();
          }}
        >
          Создать / обновить промокод
        </button>
      </section>
    </PageShell>
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
