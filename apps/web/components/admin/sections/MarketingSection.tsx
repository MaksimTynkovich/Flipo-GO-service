"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminFloatField, AdminIntField, AdminTonField } from "@/components/admin/AdminInputs";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  getAdminYieldSettings,
  formatTON,
  deleteAdminPromoCode,
  getAdminPromoCodes,
  getAdminWheelSegments,
  getAdminWheelStats,
  getReferralStats,
  updateAdminWheelSegment,
  updateAdminYieldSettings,
  upsertAdminPromoCode,
  type AdminPromoCode,
  type AdminWheelSegment,
  type AdminYieldSettings,
  type ReferralStats,
  type WheelAdminStats,
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
  referral_share_percent: 5,
  referral_ggr_share_percent: 5,
  referral_milestone_nanoton: 50_000_000,
  referral_milestone_monthly_cap: 20,
  referral_monthly_payout_cap_nanoton: 0,
  staking_base_monthly_percent: 3,
  staking_boost_monthly_percent: 4,
  staking_tvl_cap_nanoton: 1_500_000_000_000,
};

export default function MarketingSection() {
  const { showToast } = useToast();
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [draft, setDraft] = useState<AdminPromoCode>(EMPTY_PROMO);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [wheelStats, setWheelStats] = useState<WheelAdminStats | null>(null);
  const [wheelSegments, setWheelSegments] = useState<AdminWheelSegment[]>([]);
  const [wheelDrafts, setWheelDrafts] = useState<Record<string, AdminWheelSegment>>({});
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [yieldSettings, setYieldSettings] = useState<AdminYieldSettings | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [promosLoading, setPromosLoading] = useState(true);
  const [referralLoading, setReferralLoading] = useState(true);
  const [wheelLoading, setWheelLoading] = useState(true);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
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

  async function loadWheelStats() {
    setWheelLoading(true);
    try {
      const data = await loadCached("admin:marketing:wheel:v2", getAdminWheelStats);
      setWheelStats(data);
      primeCache("admin:marketing:wheel:v2", data);
    } finally {
      setWheelLoading(false);
    }
  }

  async function loadWheelSegments() {
    setSegmentsLoading(true);
    try {
      const data = await loadCached("admin:marketing:wheel-segments", getAdminWheelSegments);
      setWheelSegments(data);
      setWheelDrafts(Object.fromEntries(data.map((seg) => [seg.id, { ...seg }])));
      primeCache("admin:marketing:wheel-segments", data);
    } finally {
      setSegmentsLoading(false);
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
      const cachedWheel = readCached<WheelAdminStats>("admin:marketing:wheel:v2");
      if (cachedWheel?.today) setWheelStats(cachedWheel);
      const cachedSegments = readCached<AdminWheelSegment[]>("admin:marketing:wheel-segments");
      if (cachedSegments) {
        setWheelSegments(cachedSegments);
        setWheelDrafts(Object.fromEntries(cachedSegments.map((seg) => [seg.id, { ...seg }])));
      }
      const cachedSettings = readCached<AdminYieldSettings>("admin:marketing:settings");
      if (cachedSettings) setYieldSettings(cachedSettings);
      loadPromos().catch(() => {});
      loadReferral().catch(() => {});
      loadWheelStats().catch(() => {});
      loadWheelSegments().catch(() => {});
      loadYieldSettings().catch(() => {});
    });
  }, []);

  const settingsForm = yieldSettings ?? DEFAULT_YIELD_SETTINGS;

  const wheelChanceTotal = wheelSegments.reduce((sum, seg) => {
    const draftSeg = wheelDrafts[seg.id] ?? seg;
    return draftSeg.active ? sum + Math.max(0, draftSeg.chance_percent) : sum;
  }, 0);

  function patchWheelDraft(id: string, patch: Partial<AdminWheelSegment>) {
    setWheelDrafts((prev) => {
      const base = prev[id] ?? wheelSegments.find((s) => s.id === id);
      if (!base) return prev;
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  async function handleSaveSegment(id: string) {
    const draftSeg = wheelDrafts[id];
    if (!draftSeg) return;
    if (!draftSeg.label.trim()) {
      showToast({ variant: "error", title: "Укажите название приза" });
      return;
    }
    if (draftSeg.amount_nanoton <= 0) {
      showToast({ variant: "error", title: "Сумма приза должна быть больше 0" });
      return;
    }
    if (draftSeg.chance_percent <= 0 || draftSeg.chance_percent > 100) {
      showToast({ variant: "error", title: "Шанс должен быть от 0 до 100%" });
      return;
    }
    setSavingSegmentId(id);
    try {
      const updated = await updateAdminWheelSegment(id, {
        label: draftSeg.label.trim(),
        amount_nanoton: draftSeg.amount_nanoton,
        chance_percent: draftSeg.chance_percent,
        sort_order: draftSeg.sort_order,
        active: draftSeg.active,
      });
      showToast({ variant: "success", title: "Приз сохранён" });
      await loadWheelSegments();
      // Keep focus on saved row with server-normalized chance.
      setWheelDrafts((prev) => ({ ...prev, [id]: updated }));
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось сохранить приз",
      });
    } finally {
      setSavingSegmentId(null);
    }
  }

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
    <AdminPage title="Маркетинг" description="Промокоды с вейджером, рефералы и Лаки страйк.">
      {referral ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Рефералов" value={String(referral.referral_count)} hint="Сколько пользователей закрепились за текущим реферером." />
          <Stat label="Заработано" value={`${formatTON(referral.total_earned_nanoton)} TON`} hint="Сколько TON всего начислено рефереру за счёт бонусов от приглашённых." />
          <Stat label="Share %" value={`${referral.share_percent.toFixed(2)}%`} hint="Доля от дохода приглашённого пользователя, которая начисляется рефереру." />
          <Stat label="GGR share" value={`${referral.ggr_share_percent.toFixed(2)}%`} hint="Доля от игрового GGR квалифицированных рефералов." />
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

      {wheelStats ? (
        <section className="panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold">Лаки страйк</p>
              <p className="text-sm text-muted">
                Прокруты и выплаты без админских тестовых спинов. Периоды в UTC.
              </p>
            </div>
            <AdminButton
              variant="secondary"
              disabled={wheelLoading}
              onClick={() => loadWheelStats().catch(() => {})}
            >
              {wheelLoading ? "…" : "Обновить"}
            </AdminButton>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Сегодня</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Прокруты" value={String(wheelStats.today.spins)} hint="Сколько прокрутов сделали пользователи за текущие сутки UTC." />
              <Stat label="Уникальные" value={String(wheelStats.today.unique_users)} hint="Сколько разных пользователей крутило сегодня." />
              <Stat label="Выплаты" value={`${formatTON(wheelStats.today.prizes_nanoton)} TON`} hint="Сумма TON, начисленных с Лаки страйк сегодня." />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">7 дней</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Прокруты" value={String(wheelStats.last_7_days.spins)} />
              <Stat label="Уникальные" value={String(wheelStats.last_7_days.unique_users)} />
              <Stat label="Выплаты" value={`${formatTON(wheelStats.last_7_days.prizes_nanoton)} TON`} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Всё время</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Прокруты" value={String(wheelStats.all_time.spins)} />
              <Stat label="Уникальные" value={String(wheelStats.all_time.unique_users)} />
              <Stat label="Выплаты" value={`${formatTON(wheelStats.all_time.prizes_nanoton)} TON`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat
              label="Daily сегодня"
              value={String(wheelStats.sources_today.daily.spins)}
              hint="Бесплатные ежедневные прокруты за сегодня."
            />
            <Stat
              label="Bonus сегодня"
              value={String(wheelStats.sources_today.bonus.spins)}
              hint="Прокруты за счёт бонусных вращений (рефералы и т.п.) за сегодня."
            />
            <Stat
              label="Daily всего"
              value={String(wheelStats.sources_all_time.daily.spins)}
            />
            <Stat
              label="Bonus всего"
              value={String(wheelStats.sources_all_time.bonus.spins)}
            />
            <Stat
              label="Бонусы в очереди"
              value={String(wheelStats.pending_bonus_spins)}
              hint="Сумма неиспользованных bonus_spins у всех пользователей."
            />
          </div>

          {(wheelStats.spins_by_day?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Прокруты за 14 дней</p>
              <WheelDayBars points={wheelStats.spins_by_day} />
            </div>
          ) : null}

          {(wheelStats.prize_breakdown?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Разбивка по призам</p>
              <div className="overflow-x-auto rounded-xl bg-surface-raised/40">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-white/5">
                      <th className="px-3 py-2 font-medium">Приз</th>
                      <th className="px-3 py-2 font-medium">Сумма</th>
                      <th className="px-3 py-2 font-medium">Hits</th>
                      <th className="px-3 py-2 font-medium">%</th>
                      <th className="px-3 py-2 font-medium">Выплачено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wheelStats.prize_breakdown.map((row) => (
                      <tr key={row.segment_id} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">
                          {formatTON(row.amount_nanoton)} TON
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.hits}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">
                          {row.share_percent.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatTON(row.total_prizes_nanoton)} TON
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Пока нет прокрутов для разбивки по призам.</p>
          )}
        </section>
      ) : wheelLoading ? (
        <section className="panel space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-surface-raised" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="panel p-3">
                <div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
                <div className="mt-2 h-5 w-24 animate-pulse rounded bg-surface-raised" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold">Призы Лаки страйк</p>
            <p className="text-sm text-muted">
              Шанс — относительный вес. Сумма активных сейчас:{" "}
              <span className={wheelChanceTotal > 100.5 || wheelChanceTotal < 99.5 ? "text-amber-400" : ""}>
                {wheelChanceTotal.toFixed(2)}%
              </span>
              . После сохранения проценты пересчитываются по всем активным призам.
            </p>
          </div>
          <AdminButton
            variant="secondary"
            disabled={segmentsLoading}
            onClick={() => loadWheelSegments().catch(() => {})}
          >
            Обновить
          </AdminButton>
        </div>

        {segmentsLoading && wheelSegments.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-surface-raised/50" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {wheelSegments.map((seg) => {
              const row = wheelDrafts[seg.id] ?? seg;
              const saving = savingSegmentId === seg.id;
              return (
                <div
                  key={seg.id}
                  className="space-y-2 rounded-xl bg-surface-raised/50 px-3 py-3"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs text-muted">
                      Название
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
                        value={row.label}
                        onChange={(e) => patchWheelDraft(seg.id, { label: e.target.value })}
                      />
                    </label>
                    <AdminTonField
                      label="Приз (TON)"
                      valueNanoton={row.amount_nanoton}
                      onChangeNanoton={(v) => patchWheelDraft(seg.id, { amount_nanoton: v })}
                      hint="Сумма, которую получит игрок при выпадении этого сегмента."
                    />
                    <AdminFloatField
                      label="Шанс %"
                      min={0.01}
                      step={0.01}
                      value={row.chance_percent}
                      onChange={(v) => patchWheelDraft(seg.id, { chance_percent: v })}
                      hint="Относительный шанс выпадения среди активных призов."
                    />
                    <AdminIntField
                      label="Порядок"
                      min={0}
                      value={row.sort_order}
                      onChange={(v) => patchWheelDraft(seg.id, { sort_order: v })}
                      hint="Порядок в рулетке и списке призов."
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) => patchWheelDraft(seg.id, { active: e.target.checked })}
                      />
                      Активен
                      <span className="text-xs opacity-70">
                        вес {row.weight} · факт. {seg.chance_percent.toFixed(2)}%
                      </span>
                    </label>
                    <AdminButton
                      disabled={saving}
                      onClick={() => handleSaveSegment(seg.id).catch(() => {})}
                    >
                      {saving ? "…" : "Сохранить"}
                    </AdminButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <div>
          <p className="text-base font-semibold">Проценты системы</p>
          <p className="text-sm text-muted">Настройки применяются к новым расчётам стейкинга и реферальных начислений.</p>
        </div>
        {settingsLoading && !yieldSettings ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
                <div className="mt-2 h-10 w-full animate-pulse rounded bg-surface-raised" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <AdminFloatField
                label="Реф. % стейкинга"
                min={0}
                value={settingsForm.referral_share_percent}
                onChange={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    referral_share_percent: v,
                  })
                }
              />
              <AdminFloatField
                label="Реф. % GGR"
                min={0}
                value={settingsForm.referral_ggr_share_percent}
                onChange={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    referral_ggr_share_percent: v,
                  })
                }
              />
              <AdminTonField
                label="Milestone (TON)"
                valueNanoton={settingsForm.referral_milestone_nanoton}
                onChangeNanoton={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    referral_milestone_nanoton: v,
                  })
                }
              />
              <AdminIntField
                label="Milestone cap / мес"
                min={0}
                value={settingsForm.referral_milestone_monthly_cap}
                onChange={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    referral_milestone_monthly_cap: v,
                  })
                }
              />
              <AdminTonField
                label="Monthly payout cap (TON)"
                valueNanoton={settingsForm.referral_monthly_payout_cap_nanoton}
                onChangeNanoton={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    referral_monthly_payout_cap_nanoton: v,
                  })
                }
              />
              <AdminFloatField
                label="Staking base % / месяц"
                min={0}
                value={settingsForm.staking_base_monthly_percent}
                onChange={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    staking_base_monthly_percent: v,
                  })
                }
              />
              <AdminFloatField
                label="Staking boost % / месяц"
                min={0}
                value={settingsForm.staking_boost_monthly_percent}
                onChange={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    staking_boost_monthly_percent: v,
                  })
                }
              />
              <AdminTonField
                label="TVL cap (TON)"
                decimals={0}
                step={1}
                valueNanoton={settingsForm.staking_tvl_cap_nanoton ?? 1_500_000_000_000}
                onChangeNanoton={(v) =>
                  setYieldSettings({
                    ...settingsForm,
                    staking_tvl_cap_nanoton: v,
                  })
                }
              />
            </div>
            <AdminToolbar>
              <AdminButton
                onClick={async () => {
                  await updateAdminYieldSettings(settingsForm);
                  primeCache("admin:marketing:settings", settingsForm);
                  setYieldSettings(settingsForm);
                  await loadReferral();
                  showToast({ variant: "success", title: "Проценты сохранены" });
                }}
              >
                Сохранить проценты
              </AdminButton>
            </AdminToolbar>
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
          <label className="text-xs text-muted">
            Промокод
            <input
              className="input-field mt-1"
              placeholder="SUMMER25"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            />
          </label>
          <AdminTonField
            label="Бонус (TON)"
            valueNanoton={draft.bonus_nanoton}
            onChangeNanoton={(v) => setDraft({ ...draft, bonus_nanoton: v })}
          />
          <AdminFloatField
            label="Wager multiplier"
            min={1}
            value={draft.wager_multiplier}
            onChange={(v) => setDraft({ ...draft, wager_multiplier: v })}
          />
          <AdminIntField
            label="Max uses"
            min={0}
            value={draft.max_uses}
            onChange={(v) => setDraft({ ...draft, max_uses: v })}
          />
        </div>
        <AdminToolbar>
          <AdminButton
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
          </AdminButton>
        </AdminToolbar>
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

function WheelDayBars({
  points,
}: {
  points: Array<{ date: string; spins: number; unique_users: number; prizes_nanoton: number }>;
}) {
  const max = Math.max(1, ...points.map((p) => p.spins));
  if (points.every((p) => p.spins === 0)) {
    return <p className="text-sm text-muted">Нет прокрутов за последние 14 дней.</p>;
  }
  return (
    <div className="space-y-1">
      {points.map((point) => (
        <div key={point.date} className="flex items-center gap-2 text-xs">
          <span className="w-14 shrink-0 tabular-nums text-muted">{point.date.slice(5)}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent/80"
              style={{ width: `${point.spins === 0 ? 0 : Math.max(4, (point.spins / max) * 100)}%` }}
              title={`${point.date}: ${point.spins} прокрутов, ${point.unique_users} уник., ${formatTON(point.prizes_nanoton)} TON`}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums font-medium">{point.spins}</span>
        </div>
      ))}
    </div>
  );
}
