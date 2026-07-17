"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage, AdminChip, AdminEmpty, AdminMetric, AdminPanel, AdminToolbar } from "@/components/admin/admin-ui";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminGameStats,
  getAdminRevenueSummary,
  getAdminRevenueTimeseries,
  getAdminTransfers,
  reviewAdminTransfer,
  type AdminGameStat,
  type AdminRevenuePoint,
  type AdminRevenueSummary,
  type WalletTransfer,
} from "@/lib/api";

export default function DashboardSection() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState<AdminRevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminRevenuePoint[]>([]);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [games, setGames] = useState<AdminGameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState("одобрено админом");

  async function load() {
    setLoading(true);
    try {
      const [summaryData, seriesData, transferData, gameData] = await loadCached("admin:dashboard:v2", () =>
        Promise.all([
          getAdminRevenueSummary(),
          getAdminRevenueTimeseries(7),
          getAdminTransfers(),
          getAdminGameStats(),
        ]),
      );
      setSummary(summaryData);
      setTimeseries(seriesData);
      setTransfers(transferData);
      setGames(gameData);
      primeCache("admin:dashboard:v2", [summaryData, seriesData, transferData, gameData]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<
        [AdminRevenueSummary, AdminRevenuePoint[], WalletTransfer[], AdminGameStat[]]
      >("admin:dashboard:v2");
      if (cached) {
        setSummary(cached[0]);
        setTimeseries(cached[1]);
        setTransfers(cached[2]);
        setGames(cached[3]);
      }
      load().catch(() => {});
    });
  }, []);

  const reviewQueue = useMemo(
    () => transfers.filter((transfer) => transfer.status === "pending_review"),
    [transfers],
  );
  const maxRevenue = useMemo(
    () => Math.max(1, ...timeseries.map((point) => Math.max(0, point.revenue_nanoton))),
    [timeseries],
  );

  return (
    <AdminPage
      title="Дашборд"
      description="Ключевые цифры по деньгам и играм. Детали выводов — в разделе «Финансы»."
    >
      <AdminToolbar>
        <AdminChip onClick={() => load().catch(() => {})}>{loading ? "Обновляем…" : "Обновить"}</AdminChip>
      </AdminToolbar>

      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <AdminMetric
          label="GGR"
          value={summary ? `${formatTON(summary.ggr_nanoton)} TON` : "—"}
          hint="Ставки минус выигрыши"
          accent
        />
        <AdminMetric
          label="NGR"
          value={summary ? `${formatTON(summary.ngr_nanoton)} TON` : "—"}
          hint="С учётом расходов"
          accent
        />
        <AdminMetric
          label="Активных за 24ч"
          value={summary ? String(summary.active_users_24h) : "—"}
        />
        <AdminMetric
          label="Обязательства"
          value={summary ? `${formatTON(summary.pending_liability_nanoton)} TON` : "—"}
          hint="Непокрытые выводы"
        />
      </section>

      <section className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        <AdminMetric
          label="Депозиты"
          value={summary ? `${formatTON(summary.deposits_nanoton)} TON` : "—"}
        />
        <AdminMetric
          label="Выводы"
          value={summary ? `${formatTON(summary.withdrawals_nanoton)} TON` : "—"}
        />
        <AdminMetric
          label="Чистый доход"
          value={summary ? `${formatTON(summary.net_revenue_nanoton)} TON` : "—"}
        />
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AdminPanel title="Доход за 7 дней" description="Суммарный revenue по дням.">
          {timeseries.length === 0 ? (
            <AdminEmpty>Появится после первых транзакций и ставок.</AdminEmpty>
          ) : (
            <div className="space-y-2">
              {timeseries.map((point) => (
                <div key={point.period} className="rounded-lg bg-surface-raised/40 px-2.5 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">{point.period}</span>
                    <span className="font-semibold tabular-nums">{formatTON(point.revenue_nanoton)} TON</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-accent"
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
            <div className="space-y-1.5">
              {games.map((game) => (
                <div
                  key={game.game_type}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised/40 px-2.5 py-2 text-sm"
                >
                  <span className="font-medium uppercase">{game.game_type}</span>
                  <span className="text-right text-xs">
                    <span className="block font-semibold tabular-nums">{formatTON(game.ggr_nanoton)} GGR</span>
                    <span className="text-muted">{formatTON(game.bet_volume_nanoton)} объём</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </div>

      <AdminPanel
        title={`Выводы на проверке (${reviewQueue.length})`}
        description="Крупные или подозрительные выводы. Подробный журнал — в «Финансы»."
      >
        <input
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          className="input-field h-9"
          placeholder="Комментарий к решению"
        />
        {reviewQueue.length === 0 ? (
          <AdminEmpty>Сейчас нет выводов, ожидающих ручного решения.</AdminEmpty>
        ) : (
          <div className="space-y-2">
            {reviewQueue.map((transfer) => (
              <div key={transfer.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tabular-nums">{formatTON(transfer.net_nanoton)} TON</p>
                    <p className="mt-1 break-all text-xs text-muted">{transfer.wallet_address}</p>
                    <p className="mt-1 text-xs text-muted">
                      {transfer.review_reason || transfer.risk_flags?.join(", ") || "ручная проверка"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <AdminChip onClick={() => review(transfer.id, true)}>Одобрить</AdminChip>
                    <AdminChip onClick={() => review(transfer.id, false)}>Отклонить</AdminChip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );

  async function review(id: string, approve: boolean) {
    await reviewAdminTransfer(id, approve, reviewNote || (approve ? "одобрено админом" : "отклонено админом"));
    showToast({
      variant: "success",
      title: approve ? "Вывод одобрен" : "Вывод отклонён",
    });
    await load();
  }
}
