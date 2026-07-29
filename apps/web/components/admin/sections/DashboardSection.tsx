"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminPage, AdminChip, AdminEmpty, AdminMetric, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { invalidateCached, loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGameStats,
  getAdminRevenueSummary,
  getAdminRevenueTimeseries,
  type AdminGameStat,
  type AdminRevenuePoint,
  type AdminRevenueSummary,
} from "@/lib/api";

type RevenuePeriodId = "7d" | "30d" | "all";

const REVENUE_PERIODS: Record<RevenuePeriodId, { label: string; days: number }> = {
  "7d": { label: "7 дней", days: 7 },
  "30d": { label: "30 дней", days: 30 },
  all: { label: "Всё время", days: -1 },
};

function downsampleRevenuePoints(points: AdminRevenuePoint[], targetMaxPoints: number): AdminRevenuePoint[] {
  if (points.length <= targetMaxPoints) return points;
  const bucketSize = Math.ceil(points.length / targetMaxPoints);
  const out: AdminRevenuePoint[] = [];
  for (let i = 0; i < points.length; i += bucketSize) {
    const chunk = points.slice(i, i + bucketSize);
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    out.push({
      period: `${first.period}–${last.period}`,
      revenue_nanoton: chunk.reduce((sum, p) => sum + p.revenue_nanoton, 0),
      deposits_nanoton: chunk.reduce((sum, p) => sum + p.deposits_nanoton, 0),
      game_bets_nanoton: chunk.reduce((sum, p) => sum + p.game_bets_nanoton, 0),
    });
  }
  return out;
}

export default function DashboardSection() {
  const metaKey = "admin:dashboard:v4:meta";
  const revenueKey = (days: number) => `admin:dashboard:v4:revenue:${days}`;

  const [summary, setSummary] = useState<AdminRevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminRevenuePoint[]>([]);
  const [games, setGames] = useState<AdminGameStat[]>([]);
  const [periodId, setPeriodId] = useState<RevenuePeriodId>("7d");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingRevenue, setLoadingRevenue] = useState(false);

  const revenueLoadId = useRef(0);

  async function loadMeta() {
    setLoadingMeta(true);
    try {
      const [summaryData, gameData] = await loadCached(metaKey, () => Promise.all([getAdminRevenueSummary(), getAdminGameStats()]));
      setSummary(summaryData);
      setGames(gameData);
      primeCache(metaKey, [summaryData, gameData]);
    } finally {
      setLoadingMeta(false);
    }
  }

  async function loadRevenue(days: number) {
    const key = revenueKey(days);
    const requestId = ++revenueLoadId.current;
    setLoadingRevenue(true);

    const cached = readCached<AdminRevenuePoint[]>(key);
    if (cached) {
      setTimeseries(cached);
    } else {
      setTimeseries([]);
    }

    try {
      const seriesData = await loadCached(key, () => getAdminRevenueTimeseries(days));
      if (requestId !== revenueLoadId.current) return;
      setTimeseries(seriesData);
      primeCache(key, seriesData);
    } finally {
      if (requestId === revenueLoadId.current) {
        setLoadingRevenue(false);
      }
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cachedMeta = readCached<[AdminRevenueSummary, AdminGameStat[]]>(metaKey);
      if (cachedMeta) {
        setSummary(cachedMeta[0]);
        setGames(cachedMeta[1]);
      }

      const initialDays = REVENUE_PERIODS["7d"].days;
      const cachedRevenue = readCached<AdminRevenuePoint[]>(revenueKey(initialDays));
      if (cachedRevenue) {
        setTimeseries(cachedRevenue);
      }
      loadMeta().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRevenue(REVENUE_PERIODS[periodId].days).catch(() => {});
  }, [periodId]);

  async function refresh() {
    invalidateCached("admin:dashboard:v4");
    await Promise.all([loadMeta(), loadRevenue(REVENUE_PERIODS[periodId].days)]);
  }

  const displaySeries = useMemo(() => {
    if (periodId !== "all") return timeseries;
    return downsampleRevenuePoints(timeseries, 90);
  }, [periodId, timeseries]);

  const maxRevenue = useMemo(
    () => Math.max(1, ...displaySeries.map((point) => Math.max(0, point.revenue_nanoton))),
    [displaySeries],
  );

  return (
    <AdminPage
      title="Дашборд"
      description="Ключевые цифры по деньгам и играм. Ручные действия по выводам вынесены в раздел «Операции»."
    >
      <AdminToolbar>
        <AdminChip onClick={() => refresh().catch(() => {})}>
          {loadingMeta || loadingRevenue ? "Обновляем…" : "Обновить"}
        </AdminChip>
      </AdminToolbar>

      <section className="grid grid-cols-4 gap-4">
        <AdminMetric
          label="Выручка"
          value={summary ? `${formatTON(summary.net_revenue_nanoton)} TON` : "—"}
          hint="Чистый доход"
          accent
        />
        <AdminMetric
          label="GGR"
          value={summary ? `${formatTON(summary.ggr_nanoton)} TON` : "—"}
          hint="Ставки минус выигрыши"
          accent
        />
        <AdminMetric
          label="Выводы"
          value={summary ? `${formatTON(summary.withdrawals_nanoton)} TON` : "—"}
        />
        <AdminMetric
          label="Онлайн (24ч)"
          value={summary ? String(summary.active_users_24h) : "—"}
        />
      </section>

      <section className="grid grid-cols-3 gap-4">
        <AdminMetric
          label="NGR"
          value={summary ? `${formatTON(summary.ngr_nanoton)} TON` : "—"}
          hint="С учётом расходов"
        />
        <AdminMetric
          label="Депозиты"
          value={summary ? `${formatTON(summary.deposits_nanoton)} TON` : "—"}
        />
        <AdminMetric
          label="Обязательства"
          value={summary ? `${formatTON(summary.pending_liability_nanoton)} TON` : "—"}
          hint="Непокрытые выводы"
        />
      </section>

      <AdminPanel title="Доход за период" description="Суммарный revenue по дням в выбранном периоде.">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(REVENUE_PERIODS) as RevenuePeriodId[]).map((id) => (
            <AdminChip key={id} active={periodId === id} onClick={() => setPeriodId(id)}>
              {REVENUE_PERIODS[id].label}
            </AdminChip>
          ))}
        </div>

        {displaySeries.length === 0 ? (
          <AdminEmpty>{loadingRevenue ? "Загружаем…" : "Появится после первых транзакций и ставок."}</AdminEmpty>
        ) : (
          <div className="space-y-3 pt-1">
            {displaySeries.map((point) => (
              <div key={point.period} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--admin-muted)]">{point.period}</span>
                  <span className="font-semibold tabular-nums">
                    {formatTON(point.revenue_nanoton)} TON
                  </span>
                </div>
                <div className="admin-chart-bar">
                  <div
                    className="admin-chart-bar__fill"
                    style={{ width: `${Math.max(6, (point.revenue_nanoton / maxRevenue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminPanel title="Игры" description="GGR и объём ставок по режимам.">
        {games.length === 0 ? (
          <AdminEmpty>Статистика появится после игровых раундов.</AdminEmpty>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {games.map((game) => (
              <div
                key={game.game_type}
                className="rounded-xl bg-[var(--admin-raised)] px-3.5 py-3 text-sm"
              >
                <span className="font-medium uppercase tracking-wide">{game.game_type}</span>
                <p className="mt-2 font-semibold tabular-nums">{formatTON(game.ggr_nanoton)} GGR</p>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  {formatTON(game.bet_volume_nanoton)} объём
                </p>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
