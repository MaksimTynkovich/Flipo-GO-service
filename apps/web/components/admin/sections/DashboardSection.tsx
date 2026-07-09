"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminAuditLogs,
  getAdminGameStats,
  getAdminLedger,
  getAdminRevenueSummary,
  getAdminRevenueTimeseries,
  getAdminRiskUsers,
  getAdminTransfers,
  reviewAdminTransfer,
  type AdminAuditLog,
  type AdminGameStat,
  type AdminLedgerEntry,
  type AdminRevenuePoint,
  type AdminRevenueSummary,
  type AdminRiskUser,
  type WalletTransfer,
} from "@/lib/api";

export default function DashboardSection() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState<AdminRevenueSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AdminRevenuePoint[]>([]);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [ledger, setLedger] = useState<AdminLedgerEntry[]>([]);
  const [games, setGames] = useState<AdminGameStat[]>([]);
  const [riskUsers, setRiskUsers] = useState<AdminRiskUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("");
  const [reviewNote, setReviewNote] = useState("approved by admin");

  async function load() {
    setLoading(true);
    try {
      const [summaryData, seriesData, transferData, ledgerData, gameData, riskData, auditData] =
        await loadCached("admin:dashboard", () =>
          Promise.all([
            getAdminRevenueSummary(),
            getAdminRevenueTimeseries(7),
            getAdminTransfers(),
            getAdminLedger(),
            getAdminGameStats(),
            getAdminRiskUsers(),
            getAdminAuditLogs(),
          ]),
        );
      setSummary(summaryData);
      setTimeseries(seriesData);
      setTransfers(transferData);
      setLedger(ledgerData);
      setGames(gameData);
      setRiskUsers(riskData);
      setAudit(auditData);
      primeCache("admin:dashboard", [
        summaryData,
        seriesData,
        transferData,
        ledgerData,
        gameData,
        riskData,
        auditData,
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<
        [
          AdminRevenueSummary,
          AdminRevenuePoint[],
          WalletTransfer[],
          AdminLedgerEntry[],
          AdminGameStat[],
          AdminRiskUser[],
          AdminAuditLog[],
        ]
      >("admin:dashboard");
      if (cached) {
        setSummary(cached[0]);
        setTimeseries(cached[1]);
        setTransfers(cached[2]);
        setLedger(cached[3]);
        setGames(cached[4]);
        setRiskUsers(cached[5]);
        setAudit(cached[6]);
      }
      load().catch(() => {});
    });
  }, []);

  const maxRevenue = useMemo(
    () => Math.max(1, ...timeseries.map((point) => Math.max(0, point.revenue_nanoton))),
    [timeseries],
  );
  const filteredTransfers = useMemo(
    () => transfers.filter((transfer) => statusFilter === "all" || transfer.status === statusFilter),
    [statusFilter, transfers],
  );
  const reviewQueue = filteredTransfers.filter((transfer) => transfer.status === "pending_review");
  const completedTransfers = filteredTransfers.filter((transfer) => transfer.status === "completed");
  const rejectedTransfers = filteredTransfers.filter((transfer) => transfer.status === "rejected");
  const queuedTransfers = filteredTransfers.filter((transfer) => transfer.status === "queued");
  const totalTransferVolume = filteredTransfers.reduce((sum, transfer) => sum + transfer.net_nanoton, 0);
  const filteredRiskUsers = useMemo(() => {
    const normalized = riskFilter.trim().toLowerCase();
    if (!normalized) return riskUsers;
    return riskUsers.filter((user) =>
      [user.first_name, user.username, user.user_id, user.risk_flags.join(",")]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [riskFilter, riskUsers]);
  const totalGameGGR = games.reduce((sum, game) => sum + game.ggr_nanoton, 0);
  const topGame = games.reduce<AdminGameStat | null>(
    (best, game) => (!best || game.bet_volume_nanoton > best.bet_volume_nanoton ? game : best),
    null,
  );
  const topRiskUser = filteredRiskUsers[0] ?? null;
  const hasData =
    !!summary ||
    timeseries.length > 0 ||
    transfers.length > 0 ||
    games.length > 0 ||
    filteredRiskUsers.length > 0 ||
    ledger.length > 0 ||
    audit.length > 0;

  return (
    <PageShell
      title="Дашборд"
      description="GGR, NGR и ключевые метрики в реальном времени."
    >
      <div className="flex gap-2">
        <Button variant="outline" className="h-10" onClick={() => load().catch(() => {})}>
          {loading ? "Обновляем…" : "Обновить"}
        </Button>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="input-field h-10 py-0"
        >
          <option value="all">Все выводы</option>
          <option value="pending_review">На review</option>
          <option value="queued">Queued</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading && !hasData ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="panel space-y-2 p-3">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
              <div className="h-5 w-32 animate-pulse rounded bg-surface-raised" />
            </div>
          ))}
        </section>
      ) : null}

      {!hasData && !loading ? (
        <section className="panel space-y-2">
          <p className="text-base font-semibold">Пока мало данных</p>
          <p className="text-sm text-muted">Подождите: появятся депозиты, выводы и игровые события.</p>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="GGR"
          value={summary ? `${formatTON(summary.ggr_nanoton)} TON` : "—"}
          hint="Gross Gaming Revenue: ставки минус выигрыши."
          tone="accent"
        />
        <MetricCard
          label="NGR"
          value={summary ? `${formatTON(summary.ngr_nanoton)} TON` : "—"}
          hint="Net Gaming Revenue с учётом расходов."
          tone="accent"
        />
        <MetricCard
          label="Активных за 24ч"
          value={summary ? String(summary.active_users_24h) : "—"}
          hint="Уникальные пользователи с финансовой активностью."
        />
        <MetricCard
          label="Чистый доход"
          value={summary ? `${formatTON(summary.net_revenue_nanoton)} TON` : "—"}
          hint="Net revenue по fee и игровому GGR."
        />
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Чистый доход"
          value={summary ? `${formatTON(summary.net_revenue_nanoton)} TON` : "—"}
          hint="Net revenue по fee и игровому GGR."
          tone="accent"
        />
        <MetricCard
          label="Деньги заведены"
          value={summary ? `${formatTON(summary.deposits_nanoton)} TON` : "—"}
          hint="Подтверждённые депозиты."
        />
        <MetricCard
          label="Деньги выведены"
          value={summary ? `${formatTON(summary.withdrawals_nanoton)} TON` : "—"}
          hint="Реально выведено пользователям."
        />
        <MetricCard
          label="Обязательства"
          value={summary ? `${formatTON(summary.pending_liability_nanoton)} TON` : "—"}
          hint="Pending: сколько ещё нужно покрыть по выводам."
          tone="warning"
        />
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr]">
        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Деньги проекта</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              label="Withdrawal fees"
              value={summary ? `${formatTON(summary.withdrawal_fees_nanoton)} TON` : "—"}
              hint="Комиссии с подтверждённых выводов."
            />
            <MiniStat
              label="Market fees"
              value={summary ? `${formatTON(summary.market_fees_nanoton)} TON` : "—"}
              hint="Комиссии с маркет-операций."
            />
            <MiniStat
              label="PvP fees"
              value={summary ? `${formatTON(summary.pvp_fees_nanoton)} TON` : "—"}
              hint="Комиссии с PvP матчей."
            />
            <MiniStat
              label="Game GGR"
              value={summary ? `${formatTON(summary.game_bets_nanoton - summary.game_wins_nanoton)} TON` : "—"}
              hint="GGR рулетки+краша (bets - wins)."
            />
            <MiniStat
              label="Referral expense"
              value={summary ? `${formatTON(summary.referral_expense_nanoton)} TON` : "—"}
              hint="Расходы на реферальные бонусы."
            />
            <MiniStat
              label="Staking expense"
              value={summary ? `${formatTON(summary.staking_expense_nanoton)} TON` : "—"}
              hint="Расходы на staking."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="section-label">Доход за 7 дней</p>
              <span className="text-xs text-muted">
                {timeseries.length > 0 ? `${timeseries.length} дней` : "Нет данных"}
              </span>
            </div>
            {timeseries.length === 0 ? (
              <EmptyState text="Здесь появится динамика дохода по дням, когда накопятся транзакции и игровые события." />
            ) : (
              <div className="space-y-2 text-sm">
                {timeseries.map((point) => (
                  <div key={point.period} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span>{point.period}</span>
                      <span className="font-semibold">{formatTON(point.revenue_nanoton)} TON</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                      <span>депозиты {formatTON(point.deposits_nanoton)} TON</span>
                      <span>ставки {formatTON(point.game_bets_nanoton)} TON</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(6, (point.revenue_nanoton / maxRevenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel space-y-3">
          <p className="text-base font-semibold">Краткий статус</p>
          <div className="space-y-2">
            <HealthRow
              label="Выводы на review"
              value={String(reviewQueue.length)}
              tone={reviewQueue.length > 0 ? "warning" : "success"}
              hint="Pending review: ждут ручного решения."
            />
            <HealthRow
              label="Queued выводы"
              value={String(queuedTransfers.length)}
              tone={queuedTransfers.length > 0 ? "accent" : "default"}
              hint="Queued: ожидают обработки."
            />
            <HealthRow
              label="Отклонённые выводы"
              value={String(rejectedTransfers.length)}
              tone={rejectedTransfers.length > 0 ? "warning" : "default"}
              hint="Rejected: вывод отклонён."
            />
            <HealthRow
              label="Transfer volume"
              value={`${formatTON(totalTransferVolume)} TON`}
              tone="default"
              hint="Сумма net по отфильтрованным выводам."
            />
            <HealthRow
              label="Суммарный GGR игр"
              value={`${formatTON(totalGameGGR)} TON`}
              tone="accent"
              hint="GGR = bets - wins (рулетка+краш)."
            />
            <HealthRow
              label="Hot wallet exposure"
              value={summary ? `${formatTON(summary.hot_wallet_exposure_nanoton)} TON` : "—"}
              tone="warning"
              hint="Сколько средств в hot wallet под текущие расходы."
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Выводы и выплаты</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Completed" value={String(completedTransfers.length)} />
            <MiniStat label="Queued" value={String(queuedTransfers.length)} />
            <MiniStat label="Rejected" value={String(rejectedTransfers.length)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="section-label">Очередь ручной проверки</p>
              <span className="text-xs text-muted">{reviewQueue.length}</span>
            </div>
            {reviewQueue.length === 0 ? (
              <EmptyState text="Сейчас нет крупных или подозрительных выводов, ожидающих ручного решения." />
            ) : (
              reviewQueue.map((transfer) => (
                <div key={transfer.id} className="rounded-2xl border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{formatTON(transfer.net_nanoton)} TON</p>
                      <p className="mt-1 break-all text-xs text-muted">{transfer.wallet_address}</p>
                      <p className="mt-2 text-xs text-muted">
                        Причина: {transfer.review_reason || transfer.risk_flags?.join(", ") || "manual review"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">Risk score: {transfer.risk_score}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="quick-amount quick-amount-active" onClick={() => review(transfer.id, true, reviewNote || "approved by admin")}>
                        Approve
                      </button>
                      <button className="quick-amount" onClick={() => review(transfer.id, false, reviewNote || "rejected by admin")}>
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <input
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            className="input-field"
            placeholder="Комментарий для approve/reject"
          />
        </div>

        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Последние транзакции</p>
          </div>
          {filteredTransfers.length === 0 ? (
            <EmptyState text="Нет транзакций под выбранный фильтр." />
          ) : (
            <div className="space-y-2 text-xs text-muted">
              {filteredTransfers.slice(0, 12).map((transfer) => (
                <div key={transfer.id} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="uppercase text-[10px]">{transfer.status}</span>
                    <span className="font-semibold text-foreground">{formatTON(transfer.net_nanoton)} TON</span>
                  </div>
                  <div className="mt-1 break-all">{transfer.wallet_address}</div>
                  <div className="mt-1 text-[10px]">
                    {transfer.risk_flags?.length ? `flags: ${transfer.risk_flags.join(", ")}` : "без risk flags"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr]">
        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Игры и доходность</p>
          </div>
          {games.length === 0 ? (
            <EmptyState text="Игровая статистика появится после завершённых раундов и PvP матчей." />
          ) : (
            <div className="space-y-2 text-sm">
              {games.map((game) => (
                <div key={game.game_type} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium uppercase">{game.game_type}</span>
                    <span>{formatTON(game.ggr_nanoton)} TON GGR</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{game.rounds} rounds</span>
                    <span>volume {formatTON(game.bet_volume_nanoton)} TON</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl bg-surface-raised/50 p-3">
            <p className="section-label">Главная игра по объёму</p>
            <p className="mt-1 text-sm font-semibold uppercase">{topGame ? topGame.game_type : "—"}</p>
            <p className="mt-1 text-xs text-muted">
              {topGame ? `${formatTON(topGame.bet_volume_nanoton)} TON объём ставок` : "Нет данных"}
            </p>
          </div>
        </div>

        <div className="panel space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Риски и пользователи</p>
            </div>
            <input
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              className="input-field h-9 w-40 py-0 text-xs"
              placeholder="Фильтр"
            />
          </div>
          {filteredRiskUsers.length === 0 ? (
            <EmptyState text="Пока нет пользователей с risk flags под текущий фильтр." />
          ) : (
            <div className="space-y-2 text-sm">
              {filteredRiskUsers.map((user) => (
                <div key={user.user_id} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>{user.first_name || user.username || user.user_id.slice(0, 8)}</span>
                    <span>{formatTON(user.withdrawal_volume_nanoton)} TON</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{user.risk_flags.join(", ") || "no flags"}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl bg-surface-raised/50 p-3">
            <p className="section-label">Самый заметный риск-пользователь</p>
            <p className="mt-1 text-sm font-semibold">
              {topRiskUser ? topRiskUser.first_name || topRiskUser.username || topRiskUser.user_id.slice(0, 8) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {topRiskUser ? topRiskUser.risk_flags.join(", ") || "без флагов" : "Нет данных"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Финансовый журнал</p>
          </div>
          {ledger.length === 0 ? (
            <EmptyState text="Ledger пока пуст. После финансовых операций здесь появится движение денег." />
          ) : (
            <div className="space-y-2 text-xs text-muted">
              {ledger.slice(0, 16).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-xl bg-surface-raised/50 px-3 py-2">
                  <div>
                    <span className="text-foreground">{entry.type}</span>
                    <p className="mt-0.5 text-[10px]">{entry.reference_type}</p>
                  </div>
                  <span className="font-semibold text-foreground">{formatTON(entry.amount_nanoton)} TON</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel space-y-3">
          <div>
            <p className="text-base font-semibold">Журнал админ-действий</p>
          </div>
          {audit.length === 0 ? (
            <EmptyState text="Admin audit log пока пуст." />
          ) : (
            <div className="space-y-2 text-xs text-muted">
              {audit.slice(0, 12).map((entry) => (
                <div key={entry.id} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                  <span className="text-foreground">{humanizeAudit(entry.action)}</span>
                  <p className="mt-1">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );

  async function review(id: string, approve: boolean, note: string) {
    await reviewAdminTransfer(id, approve, note);
    showToast({
      variant: "success",
      title: approve ? "Вывод подтверждён" : "Вывод отклонён",
    });
    await load();
  }
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "ring-1 ring-inset ring-[color:var(--accent)]/25"
      : tone === "warning"
        ? "ring-1 ring-inset ring-yellow-400/20"
        : "";
  return (
    <div className={`panel space-y-1 p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted">{label}</p>
        {hint ? (
          <AdminInfoHint label={label} hint={hint} />
        ) : null}
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-raised/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-muted">{label}</p>
        {hint ? (
          <AdminInfoHint label={label} hint={hint} />
        ) : null}
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-sm text-muted">
      {text}
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "warning" | "accent";
  hint?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-[color:var(--success)]"
      : tone === "warning"
        ? "text-yellow-300"
        : tone === "accent"
          ? "text-[color:var(--accent)]"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-raised/50 px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-muted">
        {label}
        {hint ? (
          <AdminInfoHint label={label} hint={hint} />
        ) : null}
      </span>
      <span className={`text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function humanizeAudit(action: string): string {
  switch (action) {
    case "withdrawal_approved":
      return "Вывод подтверждён";
    case "withdrawal_rejected":
      return "Вывод отклонён";
    default:
      return action;
  }
}
