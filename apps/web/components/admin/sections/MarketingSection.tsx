"use client";

import { useEffect, useState } from "react";
import { AdminPage, AdminButton, AdminToolbar } from "@/components/admin/admin-ui";
import { AdminFloatField, AdminIntField, AdminTonField } from "@/components/admin/AdminInputs";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { AdminUserPicker } from "@/components/admin/AdminUserPicker";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  deleteAdminPromoCode,
  getAdminPromoCodes,
  getAdminWheelSegments,
  getAdminWheelStats,
  getAdminWheelSpinOverrides,
  createAdminWheelSpinOverride,
  deleteAdminWheelSpinOverride,
  grantAdminWheelBonusSpins,
  getReferralStats,
  upsertAdminPromoCode,
  type AdminPromoCode,
  type AdminWheelSegment,
  type AdminWheelSpinOverride,
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

export default function MarketingSection() {
  const { showToast } = useToast();
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [draft, setDraft] = useState<AdminPromoCode>(EMPTY_PROMO);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [wheelStats, setWheelStats] = useState<WheelAdminStats | null>(null);
  const [wheelSegments, setWheelSegments] = useState<AdminWheelSegment[]>([]);
  const [wheelOverrides, setWheelOverrides] = useState<AdminWheelSpinOverride[]>([]);
  const [overrideTelegramId, setOverrideTelegramId] = useState<number | null>(null);
  const [overrideSegmentId, setOverrideSegmentId] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [grantTelegramId, setGrantTelegramId] = useState<number | null>(null);
  const [grantCount, setGrantCount] = useState("1");
  const [grantSaving, setGrantSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [promosLoading, setPromosLoading] = useState(true);
  const [referralLoading, setReferralLoading] = useState(true);
  const [wheelLoading, setWheelLoading] = useState(true);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
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
      primeCache("admin:marketing:wheel-segments", data);
      if (!overrideSegmentId && data.length > 0) {
        const firstActive = data.find((s) => s.active) ?? data[0];
        setOverrideSegmentId(firstActive.id);
      }
    } finally {
      setSegmentsLoading(false);
    }
  }

  async function loadWheelOverrides() {
    setOverridesLoading(true);
    try {
      const data = await loadCached("admin:marketing:wheel-overrides", getAdminWheelSpinOverrides);
      setWheelOverrides(data);
      primeCache("admin:marketing:wheel-overrides", data);
    } finally {
      setOverridesLoading(false);
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
      if (cachedSegments) setWheelSegments(cachedSegments);
      const cachedOverrides = readCached<AdminWheelSpinOverride[]>("admin:marketing:wheel-overrides");
      if (cachedOverrides) setWheelOverrides(cachedOverrides);
      loadPromos().catch(() => {});
      loadReferral().catch(() => {});
      loadWheelStats().catch(() => {});
      loadWheelSegments().catch(() => {});
      loadWheelOverrides().catch(() => {});
    });
  }, []);

  async function handleCreateOverride() {
    if (overrideTelegramId == null || overrideTelegramId <= 0) {
      showToast({ variant: "error", title: "Выберите игрока" });
      return;
    }
    if (!overrideSegmentId) {
      showToast({ variant: "error", title: "Выберите приз" });
      return;
    }
    setOverrideSaving(true);
    try {
      await createAdminWheelSpinOverride({
        telegram_id: overrideTelegramId,
        segment_id: overrideSegmentId,
        note: overrideNote.trim() || undefined,
      });
      showToast({ variant: "success", title: "Подкрутка назначена на следующий спин" });
      setOverrideNote("");
      await loadWheelOverrides();
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось назначить подкрутку",
      });
    } finally {
      setOverrideSaving(false);
    }
  }

  async function handleDeleteOverride(id: string) {
    try {
      await deleteAdminWheelSpinOverride(id);
      setWheelOverrides((prev) => prev.filter((row) => row.id !== id));
      showToast({ variant: "success", title: "Подкрутка снята" });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось снять подкрутку",
      });
    }
  }

  async function handleGrantSpins() {
    const count = Number(grantCount);
    if (grantTelegramId == null || grantTelegramId <= 0) {
      showToast({ variant: "error", title: "Выберите игрока" });
      return;
    }
    if (!Number.isFinite(count) || count < 1 || count > 10) {
      showToast({ variant: "error", title: "Можно начислить от 1 до 10 вращений" });
      return;
    }
    setGrantSaving(true);
    try {
      const result = await grantAdminWheelBonusSpins({
        telegram_id: grantTelegramId,
        count: Math.round(count),
      });
      showToast({
        variant: "success",
        title: `Начислено ${result.granted} · всего бонусов ${result.bonus_spins}`,
      });
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : "Не удалось начислить вращения",
      });
    } finally {
      setGrantSaving(false);
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
    <AdminPage
      title="Маркетинг"
      description="Маркетинговая операционка: реферальные метрики, промокоды, бонусные спины и ручные действия по Лаки страйк."
    >
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
            <p className="text-base font-semibold">Подкрутка Лаки страйк</p>
            <p className="text-sm text-muted">
              Назначьте приз игроку — на следующем вращении он выпадет гарантированно. Повторное
              назначение для того же Telegram ID заменяет предыдущее.
            </p>
          </div>
          <AdminButton
            variant="secondary"
            disabled={overridesLoading}
            onClick={() => loadWheelOverrides().catch(() => {})}
          >
            Обновить
          </AdminButton>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <AdminUserPicker
            value={overrideTelegramId}
            onChange={(id) => setOverrideTelegramId(id)}
            className="sm:col-span-2 lg:col-span-1"
          />
          <label className="text-xs text-muted">
            Приз
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
              value={overrideSegmentId}
              onChange={(e) => setOverrideSegmentId(e.target.value)}
            >
              {wheelSegments.map((seg) => (
                <option key={seg.id} value={seg.id}>
                  {seg.label} · {formatTON(seg.amount_nanoton)} TON
                  {!seg.active ? " (выкл)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted sm:col-span-2 lg:col-span-1">
            Заметка
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="опционально"
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <AdminButton
              className="w-full"
              disabled={overrideSaving}
              onClick={() => handleCreateOverride().catch(() => {})}
            >
              {overrideSaving ? "…" : "Назначить"}
            </AdminButton>
          </div>
        </div>

        {overridesLoading && wheelOverrides.length === 0 ? (
          <div className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
        ) : wheelOverrides.length === 0 ? (
          <p className="text-sm text-muted">Активных подкруток нет</p>
        ) : (
          <div className="space-y-2">
            {wheelOverrides.map((row) => {
              const name = row.first_name || row.username || `id ${row.telegram_id}`;
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-raised/50 px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {name}
                      {row.username ? (
                        <span className="ml-1.5 font-normal text-muted">@{row.username}</span>
                      ) : null}
                      <span className="ml-1.5 font-normal text-muted">· {row.telegram_id}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {row.segment_label} · {formatTON(row.amount_nanoton)} TON
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </div>
                  <AdminButton variant="danger" onClick={() => handleDeleteOverride(row.id).catch(() => {})}>
                    Снять
                  </AdminButton>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <div>
          <p className="text-base font-semibold">Начислить вращения</p>
          <p className="text-sm text-muted">
            Бонусные спины Лаки страйк (от 1 до 10). Игроку уйдёт уведомление в бот.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <AdminUserPicker
            value={grantTelegramId}
            onChange={(id) => setGrantTelegramId(id)}
          />
          <label className="text-xs text-muted">
            Количество
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
              value={grantCount}
              onChange={(e) => setGrantCount(e.target.value)}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <AdminButton
              className="w-full"
              disabled={grantSaving}
              onClick={() => handleGrantSpins().catch(() => {})}
            >
              {grantSaving ? "…" : "Начислить"}
            </AdminButton>
          </div>
        </div>
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
