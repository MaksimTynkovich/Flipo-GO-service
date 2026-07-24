"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage, AdminChip, AdminEmpty, AdminMetric, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGameStats,
  getAdminRevenueSummary,
  getAdminRevenueTimeseries,
  type AdminGameStat,
  type AdminRevenuePoint,
  type AdminRevenueSummary,
} from "@/lib/api";

export default function DashboardSection() {
  const [summary, setSummary] = useState<AdminRevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminRevenuePoint[]>([]);
  const [games, setGames] = useState<AdminGameStat[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [summaryData, seriesData, gameData] = await loadCached("admin:dashboard:v3", () =>
        Promise.all([
          getAdminRevenueSummary(),
          getAdminRevenueTimeseries(7),
          getAdminGameStats(),
        ]),
      );
      setSummary(summaryData);
      setTimeseries(seriesData);
      setGames(gameData);
      primeCache("admin:dashboard:v3", [summaryData, seriesData, gameData]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<[AdminRevenueSummary, AdminRevenuePoint[], AdminGameStat[]]>(
        "admin:dashboard:v3",
      );
      if (cached) {
        setSummary(cached[0]);
        setTimeseries(cached[1]);
        setGames(cached[2]);
      }
      load().catch(() => {});
    });
  }, []);

  const maxRevenue = useMemo(
    () => Math.max(1, ...timeseries.map((point) => Math.max(0, point.revenue_nanoton))),
    [timeseries],
  );

  return (
    <AdminPage
      title="Дашборд"
      description="Ключевые цифры по деньгам и играм. Ручные действия по выводам вынесены в раздел «Операции»."
    >
      <AdminToolbar>
        <AdminChip onClick={() => load().catch(() => {})}>{loading ? "Обновляем…" : "Обновить"}</AdminChip>
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

      <AdminPanel title="Доход за 7 дней" description="Суммарный revenue по дням.">
          {timeseries.length === 0 ? (
            <AdminEmpty>Появится после первых транзакций и ставок.</AdminEmpty>
          ) : (
            <div className="space-y-3 pt-1">
              {timeseries.map((point) => (
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
