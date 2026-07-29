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

const CHART_WIDTH = 960;
const CHART_HEIGHT = 280;
const CHART_PADDING_X = 20;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 28;

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

function formatPeriodLabel(period: string) {
  if (period.includes("–")) return period;
  const [year, month, day] = period.split("-");
  if (!year || !month || !day) return period;
  return `${day}.${month}`;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0]!;
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
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

  const chartData = useMemo(() => {
    if (displaySeries.length === 0) return null;

    const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const denominator = Math.max(displaySeries.length - 1, 1);

    const points = displaySeries.map((point, index) => {
      const x = CHART_PADDING_X + (innerWidth * index) / denominator;
      const y =
        CHART_PADDING_TOP +
        innerHeight -
        (Math.max(0, point.revenue_nanoton) / maxRevenue) * innerHeight;
      return {
        ...point,
        x,
        y,
      };
    });

    const linePath = buildSmoothPath(points);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const areaPath = `${linePath} L ${last.x} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} L ${first.x} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} Z`;

    const ticks = [0, 0.5, 1].map((ratio) => ({
      y: CHART_PADDING_TOP + innerHeight - innerHeight * ratio,
      value: Math.round(maxRevenue * ratio),
    }));

    const xLabelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

    return {
      points,
      linePath,
      areaPath,
      ticks,
      xLabelIndexes,
    };
  }, [displaySeries, maxRevenue]);

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
          <div className="space-y-4 pt-1">
            <div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-raised)] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--admin-muted)]">Revenue</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--admin-fg)]">
                    {formatTON(displaySeries[displaySeries.length - 1]?.revenue_nanoton ?? 0)} TON
                  </p>
                </div>
                <p className="max-w-xs text-right text-xs leading-relaxed text-[var(--admin-muted)]">
                  {periodId === "all" ? "Для длинного периода точки агрегируются по диапазонам." : "Помесячный срез не нужен: показываем динамику по дням."}
                </p>
              </div>

              {chartData ? (
                <>
                  <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="block h-64 w-full"
                    role="img"
                    aria-label="График дохода"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="adminRevenueArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--admin-accent)" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="var(--admin-accent)" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>

                    {chartData.ticks.map((tick) => (
                      <g key={tick.y}>
                        <line
                          x1={CHART_PADDING_X}
                          x2={CHART_WIDTH - CHART_PADDING_X}
                          y1={tick.y}
                          y2={tick.y}
                          stroke="rgba(255,255,255,0.08)"
                          strokeDasharray="4 6"
                        />
                        <text
                          x={CHART_PADDING_X}
                          y={tick.y - 6}
                          fill="var(--admin-muted)"
                          fontSize="12"
                        >
                          {formatTON(tick.value)} TON
                        </text>
                      </g>
                    ))}

                    <path d={chartData.areaPath} fill="url(#adminRevenueArea)" />
                    <path
                      d={chartData.linePath}
                      fill="none"
                      stroke="var(--admin-accent)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {chartData.points.map((point) => (
                      <g key={point.period}>
                        <circle cx={point.x} cy={point.y} r="4" fill="var(--admin-bg)" />
                        <circle cx={point.x} cy={point.y} r="2.5" fill="var(--admin-accent)" />
                        <title>{`${point.period}: ${formatTON(point.revenue_nanoton)} TON`}</title>
                      </g>
                    ))}
                  </svg>

                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--admin-muted)]">
                    {chartData.xLabelIndexes.map((index) => {
                      const point = chartData.points[index]!;
                      return (
                        <span key={`${point.period}:${index}`} className="tabular-nums">
                          {formatPeriodLabel(point.period)}
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-[var(--admin-raised)] px-3.5 py-3">
                <span className="text-[var(--admin-muted)]">Максимум</span>
                <p className="mt-1 font-semibold tabular-nums">{formatTON(maxRevenue)} TON</p>
              </div>
              <div className="rounded-xl bg-[var(--admin-raised)] px-3.5 py-3">
                <span className="text-[var(--admin-muted)]">Точек</span>
                <p className="mt-1 font-semibold tabular-nums">{displaySeries.length}</p>
              </div>
              <div className="rounded-xl bg-[var(--admin-raised)] px-3.5 py-3">
                <span className="text-[var(--admin-muted)]">Сумма</span>
                <p className="mt-1 font-semibold tabular-nums">
                  {formatTON(displaySeries.reduce((sum, point) => sum + point.revenue_nanoton, 0))} TON
                </p>
              </div>
            </div>
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
