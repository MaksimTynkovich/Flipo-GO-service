"use client";

import { useEffect, useState } from "react";
import {
  AdminButton,
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminCaseOpenStats,
  type AdminCaseOpenCaseRow,
  type AdminCaseOpenDailyPoint,
  type AdminCaseOpenPeriodStats,
  type AdminCaseOpenPrizeHit,
  type AdminCaseOpenPrizeTypeStats,
  type AdminCaseOpenSourceBreakdown,
  type AdminCaseOpenStats,
} from "@/lib/api";

const CACHE_KEY = "admin:case-open-stats:v1";

function formatRtp(bps: number): string {
  if (!bps) return "—";
  return `${(bps / 100).toFixed(1)}%`;
}

function prizeTypeLabel(t: string): string {
  switch (t) {
    case "gift":
      return "Подарки";
    case "ton":
      return "TON";
    default:
      return t || "—";
  }
}

export default function CaseStatsSection() {
  const [stats, setStats] = useState<AdminCaseOpenStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await loadCached(CACHE_KEY, getAdminCaseOpenStats);
      setStats(data);
      primeCache(CACHE_KEY, data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = readCached<AdminCaseOpenStats>(CACHE_KEY);
    if (cached) {
      setStats(cached);
      setLoading(false);
    }
    return runAfterFirstPaint(() => {
      load().catch(() => {});
    });
  }, []);

  return (
    <AdminPage description="Открытия кейсов из case_opens: объёмы, P&L, источники и топы. Периоды в UTC. RTP считается только по платным открытиям.">
      <AdminToolbar>
        <AdminButton variant="secondary" disabled={loading} onClick={() => load().catch(() => {})}>
          {loading ? "…" : "Обновить"}
        </AdminButton>
      </AdminToolbar>

      {stats ? (
        <>
          <PeriodBlock title="Сегодня" period={stats.today} />
          <PeriodBlock title="7 дней" period={stats.last_7_days} />
          <PeriodBlock title="Всё время" period={stats.all_time} />

          <AdminPanel title="Источники" description="Paid / daily / free / promo — сегодня и всё время.">
            <SourceGrid label="Сегодня" sources={stats.sources_today} />
            <SourceGrid label="Всё время" sources={stats.sources_all_time} />
          </AdminPanel>

          <AdminPanel title="Тип приза" description="Gift vs TON за 7 дней и всё время.">
            <PrizeTypeGrid label="7 дней" rows={stats.prize_types_7d} />
            <PrizeTypeGrid label="Всё время" rows={stats.prize_types_all_time} />
          </AdminPanel>

          <AdminPanel title="Открытия за 14 дней">
            <DayBars points={stats.opens_by_day ?? []} />
          </AdminPanel>

          <AdminPanel title="Топ кейсов" description="По числу открытий.">
            <CaseTable label="7 дней" rows={stats.by_case_7d ?? []} />
            <CaseTable label="Всё время" rows={stats.by_case_all_time ?? []} />
          </AdminPanel>

          <AdminPanel title="Топ призов за 7 дней">
            <PrizeHitsTable rows={stats.top_prizes_7d ?? []} />
          </AdminPanel>
        </>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="admin-metric animate-pulse">
              <div className="h-3 w-16 rounded bg-surface-raised" />
              <div className="mt-2 h-5 w-24 rounded bg-surface-raised" />
            </div>
          ))}
        </div>
      ) : (
        <AdminEmpty>Не удалось загрузить статистику кейсов.</AdminEmpty>
      )}
    </AdminPage>
  );
}

function PeriodBlock({ title, period }: { title: string; period: AdminCaseOpenPeriodStats }) {
  return (
    <AdminPanel title={title}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <AdminMetric label="Открытия" value={String(period.opens)} />
        <AdminMetric label="Уникальные" value={String(period.unique_users)} />
        <AdminMetric label="Затрачено" value={`${formatTON(period.spent_nanoton)} TON`} />
        <AdminMetric label="Выдано" value={`${formatTON(period.prize_total_nanoton)} TON`} />
        <AdminMetric
          label="House edge"
          value={`${formatTON(period.house_edge_nanoton)} TON`}
          accent={period.house_edge_nanoton >= 0}
          hint="Затрачено минус оценка выданных призов (включая бесплатные открытия)."
        />
        <AdminMetric
          label="RTP (paid)"
          value={formatRtp(period.actual_rtp_bps)}
          hint="Фактический RTP только по открытиям с price_paid > 0."
        />
        <AdminMetric label="Платные" value={String(period.paid_opens)} />
        <AdminMetric label="Бесплатные" value={String(period.free_opens)} />
        <AdminMetric label="Ср. билет" value={`${formatTON(period.avg_ticket_nanoton)} TON`} />
        <AdminMetric label="Ср. приз" value={`${formatTON(period.avg_prize_nanoton)} TON`} />
      </div>
    </AdminPanel>
  );
}

function SourceGrid({ label, sources }: { label: string; sources: AdminCaseOpenSourceBreakdown }) {
  const rows: Array<{ key: string; name: string; s: AdminCaseOpenSourceBreakdown[keyof AdminCaseOpenSourceBreakdown] }> = [
    { key: "paid", name: "Paid", s: sources.paid },
    { key: "daily", name: "Daily", s: sources.daily },
    { key: "free", name: "Free", s: sources.free },
    { key: "promo", name: "Promo", s: sources.promo },
  ];
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map(({ key, name, s }) => (
          <AdminMetric
            key={key}
            label={name}
            value={String(s?.opens ?? 0)}
            hint={`${s?.unique_users ?? 0} уник. · ${formatTON(s?.spent_nanoton ?? 0)} / ${formatTON(s?.prize_total_nanoton ?? 0)} TON`}
          />
        ))}
      </div>
    </div>
  );
}

function PrizeTypeGrid({ label, rows }: { label: string; rows: AdminCaseOpenPrizeTypeStats[] }) {
  if (!rows.length) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">{label}</p>
        <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Нет открытий.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => (
          <AdminMetric
            key={row.prize_type}
            label={prizeTypeLabel(row.prize_type)}
            value={String(row.opens)}
            hint={`Выдано ${formatTON(row.prize_total_nanoton)} TON`}
          />
        ))}
      </div>
    </div>
  );
}

function DayBars({ points }: { points: AdminCaseOpenDailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.opens));
  if (!points.length || points.every((p) => p.opens === 0)) {
    return <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Нет открытий за последние 14 дней.</p>;
  }
  return (
    <div className="space-y-1">
      {points.map((point) => (
        <div key={point.date} className="flex items-center gap-2 text-xs">
          <span className="w-14 shrink-0 tabular-nums text-[var(--admin-muted,#8b98a8)]">
            {point.date.slice(5)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent/80"
              style={{
                width: `${point.opens === 0 ? 0 : Math.max(4, (point.opens / max) * 100)}%`,
              }}
              title={`${point.date}: ${point.opens} откр., ${point.unique_users} уник., ${formatTON(point.spent_nanoton)} / ${formatTON(point.prize_total_nanoton)} TON`}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums">{point.opens}</span>
        </div>
      ))}
    </div>
  );
}

function CaseTable({ label, rows }: { label: string; rows: AdminCaseOpenCaseRow[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">{label}</p>
      {!rows.length ? (
        <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Нет данных.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface-raised/40">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-[var(--admin-muted,#8b98a8)]">
              <tr className="border-b border-white/5">
                <th className="px-3 py-2 font-medium">Кейс</th>
                <th className="px-3 py-2 font-medium">Откр.</th>
                <th className="px-3 py-2 font-medium">Затрачено</th>
                <th className="px-3 py-2 font-medium">Выдано</th>
                <th className="px-3 py-2 font-medium">Edge</th>
                <th className="px-3 py-2 font-medium">RTP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.case_id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-[var(--admin-muted,#8b98a8)]">{row.slug}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.opens}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTON(row.spent_nanoton)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTON(row.prize_total_nanoton)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTON(row.house_edge_nanoton)}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--admin-muted,#8b98a8)]">
                    {formatRtp(row.actual_rtp_bps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PrizeHitsTable({ rows }: { rows: AdminCaseOpenPrizeHit[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Пока нет открытий для разбивки.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-raised/40">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="text-xs text-[var(--admin-muted,#8b98a8)]">
          <tr className="border-b border-white/5">
            <th className="px-3 py-2 font-medium">Приз</th>
            <th className="px-3 py-2 font-medium">Тип</th>
            <th className="px-3 py-2 font-medium">Hits</th>
            <th className="px-3 py-2 font-medium">%</th>
            <th className="px-3 py-2 font-medium">Выдано</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.loot_entry_id} className="border-b border-white/5 last:border-0">
              <td className="px-3 py-2 font-medium">{row.label}</td>
              <td className="px-3 py-2 text-[var(--admin-muted,#8b98a8)]">
                {prizeTypeLabel(row.prize_type)}
              </td>
              <td className="px-3 py-2 tabular-nums">{row.hits}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--admin-muted,#8b98a8)]">
                {row.share_percent.toFixed(1)}%
              </td>
              <td className="px-3 py-2 tabular-nums">{formatTON(row.prize_total_nanoton)} TON</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
