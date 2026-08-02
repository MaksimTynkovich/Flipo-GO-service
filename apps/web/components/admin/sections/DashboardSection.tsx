"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
type RevenueSeriesId = "revenue" | "deposits" | "withdrawals" | "bets";

const REVENUE_PERIODS: Record<RevenuePeriodId, { label: string; days: number }> = {
  "7d": { label: "7 дней", days: 7 },
  "30d": { label: "30 дней", days: 30 },
  all: { label: "Всё время", days: -1 },
};

const REVENUE_SERIES: Array<{
  id: RevenueSeriesId;
  label: string;
  dataKey: keyof RevenueChartPoint;
  color: string;
}> = [
  { id: "revenue", label: "Чистая прибыль", dataKey: "revenueNanoton", color: "#2dd4bf" },
  { id: "deposits", label: "Депозиты", dataKey: "depositsNanoton", color: "#60a5fa" },
  { id: "withdrawals", label: "Выводы", dataKey: "withdrawalsNanoton", color: "#f59e0b" },
  { id: "bets", label: "Ставки", dataKey: "gameBetsNanoton", color: "#a78bfa" },
];

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
      withdrawals_nanoton: chunk.reduce((sum, p) => sum + p.withdrawals_nanoton, 0),
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

type RevenueChartPoint = {
  period: string;
  label: string;
  revenueNanoton: number;
  depositsNanoton: number;
  withdrawalsNanoton: number;
  gameBetsNanoton: number;
};

function getSeriesValue(point: RevenueChartPoint, dataKey: keyof RevenueChartPoint) {
  const value = point[dataKey];
  return typeof value === "number" ? value : 0;
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RevenueChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;

  if (!point) return null;

  return (
    <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <p className="text-xs text-[var(--admin-muted)]">{point.period}</p>
      <p className="mt-1 font-semibold tabular-nums text-[var(--admin-fg)]">
        Чистая прибыль: {formatTON(point.revenueNanoton)} TON
      </p>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">
        Депозиты: {formatTON(point.depositsNanoton)} TON
      </p>
      <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
        Выводы: {formatTON(point.withdrawalsNanoton)} TON
      </p>
      <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
        Ставки: {formatTON(point.gameBetsNanoton)} TON
      </p>
    </div>
  );
}

export default function DashboardSection() {
  const metaKey = "admin:dashboard:v5:meta";
  const revenueKey = (days: number) => `admin:dashboard:v5:revenue:${days}`;

  const [summary, setSummary] = useState<AdminRevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminRevenuePoint[]>([]);
  const [games, setGames] = useState<AdminGameStat[]>([]);
  const [periodId, setPeriodId] = useState<RevenuePeriodId>("7d");
  const [enabledSeries, setEnabledSeries] = useState<Record<RevenueSeriesId, boolean>>({
    revenue: true,
    deposits: true,
    withdrawals: true,
    bets: false,
  });
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

  const activeSeries = useMemo(
    () => REVENUE_SERIES.filter((series) => enabledSeries[series.id]),
    [enabledSeries],
  );

  const chartData = useMemo(
    () =>
      displaySeries.map<RevenueChartPoint>((point) => ({
        period: point.period,
        label: formatPeriodLabel(point.period),
        revenueNanoton: point.revenue_nanoton,
        depositsNanoton: point.deposits_nanoton,
        withdrawalsNanoton: point.withdrawals_nanoton,
        gameBetsNanoton: point.game_bets_nanoton,
      })),
    [displaySeries],
  );

  const maxRevenue = useMemo(
    () =>
      Math.max(
        1,
        ...chartData.flatMap((point) =>
          activeSeries.map((series) => Math.max(0, getSeriesValue(point, series.dataKey))),
        ),
      ),
    [activeSeries, chartData],
  );

  const totalRevenue = useMemo(
    () => displaySeries.reduce((sum, point) => sum + point.revenue_nanoton, 0),
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
          label="Чистая прибыль"
          value={summary ? `${formatTON(summary.net_revenue_nanoton)} TON` : "—"}
          hint="Депозиты минус выводы"
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

      <AdminPanel title="Доход за период" description="Чистая прибыль, депозиты, выводы и ставки по дням в выбранном периоде.">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(REVENUE_PERIODS) as RevenuePeriodId[]).map((id) => (
            <AdminChip key={id} active={periodId === id} onClick={() => setPeriodId(id)}>
              {REVENUE_PERIODS[id].label}
            </AdminChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {REVENUE_SERIES.map((series) => (
            <AdminChip
              key={series.id}
              active={enabledSeries[series.id]}
              onClick={() =>
                setEnabledSeries((prev) => {
                  const next = { ...prev, [series.id]: !prev[series.id] };
                  if (Object.values(next).some(Boolean)) return next;
                  return prev;
                })
              }
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                {series.label}
              </span>
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
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--admin-muted)]">Сумма за период</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--admin-fg)]">
                    {formatTON(totalRevenue)} TON
                  </p>
                </div>
                <p className="max-w-xs text-right text-xs leading-relaxed text-[var(--admin-muted)]">
                  {periodId === "all" ? "Для длинного периода точки агрегируются по диапазонам." : "Чистая прибыль считается как депозиты минус выводы."}
                </p>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: 0, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient id="adminRevenueStroke" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="color-mix(in srgb, var(--admin-accent) 75%, #0f766e)" />
                        <stop offset="100%" stopColor="var(--admin-accent)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--admin-muted)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "var(--admin-muted)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      domain={[0, maxRevenue]}
                      tickFormatter={(value: number) => `${formatTON(Number(value))} TON`}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(45,212,191,0.32)", strokeWidth: 1.5 }}
                      content={<RevenueTooltip />}
                    />
                    {activeSeries.map((series) => (
                      <Line
                        key={series.id}
                        type="monotone"
                        dataKey={series.dataKey}
                        stroke={series.id === "revenue" ? "url(#adminRevenueStroke)" : series.color}
                        strokeWidth={series.id === "revenue" ? 3 : 2.25}
                        dot={{ r: 3, fill: series.color, stroke: "var(--admin-bg)", strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: series.color, stroke: "var(--admin-bg)", strokeWidth: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
