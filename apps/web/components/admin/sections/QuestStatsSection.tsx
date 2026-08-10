"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { cn } from "@/lib/utils";
import {
  formatTON,
  getAdminQuestStats,
  type AdminQuestByQuestRow,
  type AdminQuestByRewardRow,
  type AdminQuestDailyPoint,
  type AdminQuestPeriodStats,
  type AdminQuestStats,
} from "@/lib/api";

const CACHE_KEY = "admin:quest-stats:v1";

type PeriodId = "today" | "7d" | "30d" | "all";

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "today", label: "День" },
  { id: "7d", label: "Неделя" },
  { id: "30d", label: "Месяц" },
  { id: "all", label: "Всё время" },
];

function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function formatTonLabel(nanoton: number): string {
  return `${formatTON(nanoton)} TON`;
}

function formatBps(bps: number): string {
  if (!bps) return "0%";
  return `${(bps / 100).toFixed(1)}%`;
}

function periodStats(stats: AdminQuestStats, id: PeriodId): AdminQuestPeriodStats {
  if (id === "today") return stats.today;
  if (id === "7d") return stats.last_7_days;
  if (id === "30d") return stats.last_30_days;
  return stats.all_time;
}

function byQuestRows(stats: AdminQuestStats, id: PeriodId): AdminQuestByQuestRow[] {
  if (id === "today") return stats.by_quest_today ?? [];
  if (id === "7d") return stats.by_quest_7d ?? [];
  if (id === "30d") return stats.by_quest_30d ?? [];
  return stats.by_quest_all_time ?? [];
}

function rewardLabel(t: string): string {
  switch (t) {
    case "balance_nanoton":
      return "TON на баланс";
    case "free_case_open":
      return "Бесплатный кейс";
    case "gift":
      return "Подарок";
    case "none":
      return "Без награды";
    default:
      return t || "—";
  }
}

export default function QuestStatsSection() {
  const [stats, setStats] = useState<AdminQuestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [rewardPeriod, setRewardPeriod] = useState<"7d" | "all">("7d");

  async function load() {
    setLoading(true);
    try {
      const next = await loadCached(CACHE_KEY, getAdminQuestStats);
      setStats(next);
      primeCache(CACHE_KEY, next);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = readCached<AdminQuestStats>(CACHE_KEY);
    if (cached) {
      setStats(cached);
      setLoading(false);
    }
    return runAfterFirstPaint(() => {
      load().catch(() => {});
    });
  }, []);

  const active = stats ? periodStats(stats, period) : null;
  const questRows = stats ? byQuestRows(stats, period) : [];
  const rewardRows: AdminQuestByRewardRow[] = stats
    ? rewardPeriod === "7d"
      ? stats.by_reward_7d ?? []
      : stats.by_reward_all_time ?? []
    : [];

  return (
    <AdminPage
      title="Статистика заданий"
      description="Клеймы, бонус дня, free-кейсы и стоимость наград. Дни — по МСК."
    >
      <AdminToolbar>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <AdminChip
              key={p.id}
              active={period === p.id}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </AdminChip>
          ))}
        </div>
        <AdminButton
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Загрузка…" : "Обновить"}
        </AdminButton>
      </AdminToolbar>

      {!stats && !loading ? (
        <AdminEmpty title="Не удалось загрузить статистику" />
      ) : null}

      {active ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <AdminMetric label="Клеймы заданий" value={formatCount(active.task_claims)} />
          <AdminMetric label="Уникальные игроки" value={formatCount(active.unique_claimers)} />
          <AdminMetric label="Бонус дня" value={formatCount(active.bonus_claims)} />
          <AdminMetric
            label="Доходимость до бонуса"
            value={formatBps(active.bonus_completion_bps)}
            hint={`${formatCount(active.bonus_claimers)} / ${formatCount(active.task_claimers)} с ≥1 заданием`}
          />
          <AdminMetric
            label="Стоимость платформы"
            value={formatTonLabel(active.platform_cost_nanoton)}
            hint="TON/подарки с клеймов + призы quest-opens"
            accent={active.platform_cost_nanoton > 0}
          />
          <AdminMetric
            label="TON с клеймов"
            value={formatTonLabel(active.balance_reward_nanoton)}
          />
          <AdminMetric
            label="Подарки (оценка)"
            value={formatTonLabel(active.gift_reward_nanoton)}
          />
          <AdminMetric
            label="Free-кейсы (клеймы)"
            value={formatCount(active.free_case_claims)}
          />
          <AdminMetric
            label="Entitlements выдано"
            value={formatCount(active.entitlements_granted)}
          />
          <AdminMetric
            label="Открыто free-кейсов"
            value={formatCount(active.quest_opens)}
            hint={`${formatCount(active.quest_open_users)} уник. · redemption ${formatBps(active.entitlement_redeem_bps)}`}
          />
          <AdminMetric
            label="Призы free-opens"
            value={formatTonLabel(active.quest_prize_total_nanoton)}
            accent={active.quest_prize_total_nanoton > 0}
          />
          <AdminMetric
            label="Неоткрытые entitlements"
            value={formatCount(active.entitlements_available)}
          />
        </div>
      ) : loading ? (
        <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Загрузка метрик…</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AdminPanel title="По заданиям" description="Клеймы task за выбранный период">
          <QuestTable rows={questRows} />
        </AdminPanel>
        <AdminPanel title="Типы наград" description="Все клеймы (task + bonus)">
          <div className="mb-3 flex gap-1">
            <AdminChip
              active={rewardPeriod === "7d"}
              onClick={() => setRewardPeriod("7d")}
            >
              7д
            </AdminChip>
            <AdminChip
              active={rewardPeriod === "all"}
              onClick={() => setRewardPeriod("all")}
            >
              Всё
            </AdminChip>
          </div>
          <RewardMix rows={rewardRows} />
        </AdminPanel>
      </div>

      <AdminPanel
        title="Клеймы по дням (МСК)"
        description="Последние 14 календарных дней Europe/Moscow"
      >
        <DayChart points={stats?.claims_by_day ?? []} />
      </AdminPanel>
    </AdminPage>
  );
}

function QuestTable({ rows }: { rows: AdminQuestByQuestRow[] }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-[var(--admin-muted,#8b98a8)]">
        Пока нет клеймов за период.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">
          <tr className="border-b border-[var(--admin-border,#1e2a38)]">
            <th className="py-2 pr-3 font-medium">Задание</th>
            <th className="py-2 pr-3 font-medium">Клеймы</th>
            <th className="py-2 pr-3 font-medium">Игроки</th>
            <th className="py-2 pr-3 font-medium">Награда</th>
            <th className="py-2 font-medium">Σ reward</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.quest_id}
              className="border-b border-[var(--admin-border,#1e2a38)]/60"
            >
              <td className="py-2.5 pr-3">
                <div className="font-medium text-[var(--admin-fg,#e8eef6)]">{row.title}</div>
                <div className="text-[11px] text-[var(--admin-muted,#8b98a8)]">
                  {row.active ? "активно" : "выкл"} · #{row.sort_order}
                </div>
              </td>
              <td className="py-2.5 pr-3 tabular-nums">{formatCount(row.task_claims)}</td>
              <td className="py-2.5 pr-3 tabular-nums">{formatCount(row.unique_users)}</td>
              <td className="py-2.5 pr-3">{rewardLabel(row.reward_type)}</td>
              <td className="py-2.5 tabular-nums">{formatTonLabel(row.reward_nanoton_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RewardMix({ rows }: { rows: AdminQuestByRewardRow[] }) {
  const total = rows.reduce((s, r) => s + r.claims, 0);
  if (!rows.length || total === 0) {
    return (
      <p className="text-sm text-[var(--admin-muted,#8b98a8)]">
        Нет клеймов для разбивки.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const share = total > 0 ? (row.claims / total) * 100 : 0;
        return (
          <div key={row.reward_type} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{rewardLabel(row.reward_type)}</span>
              <span className="tabular-nums text-[var(--admin-muted,#8b98a8)]">
                {formatCount(row.claims)} · {share.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border,#1e2a38)]">
              <div
                className="h-full rounded-full bg-[var(--admin-accent,#3390ec)]"
                style={{ width: `${Math.max(2, share)}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--admin-muted,#8b98a8)]">
              {formatCount(row.unique_users)} уник. · {formatTonLabel(row.reward_nanoton_total)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DayChart({ points }: { points: AdminQuestDailyPoint[] }) {
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.task_claims + p.bonus_claims)),
    [points],
  );

  if (!points.length || points.every((p) => p.task_claims + p.bonus_claims === 0)) {
    return (
      <p className="text-sm text-[var(--admin-muted,#8b98a8)]">
        Нет клеймов за последние 14 дней.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-1.5">
        {points.map((point) => {
          const total = point.task_claims + point.bonus_claims;
          const height = total === 0 ? 0 : Math.max(8, (total / max) * 100);
          return (
            <div
              key={point.day_msk}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
              title={[
                point.day_msk,
                `${point.task_claims} заданий`,
                `${point.bonus_claims} бонусов`,
                `${point.unique_claimers} уник.`,
                formatTonLabel(point.reward_nanoton_total),
              ].join(" · ")}
            >
              <span className="mb-1 text-[10px] tabular-nums text-[var(--admin-muted,#8b98a8)] opacity-0 transition group-hover:opacity-100">
                {total}
              </span>
              <div className="flex w-full flex-col justify-end" style={{ height: `${height}%` }}>
                {point.bonus_claims > 0 ? (
                  <div
                    className="w-full rounded-t-md bg-amber-400/70 group-hover:bg-amber-400"
                    style={{
                      height: `${(point.bonus_claims / Math.max(1, total)) * 100}%`,
                      minHeight: point.bonus_claims > 0 ? 2 : 0,
                    }}
                  />
                ) : null}
                <div
                  className={cn(
                    "w-full bg-[var(--admin-accent,#3390ec)]/70 group-hover:bg-[var(--admin-accent,#3390ec)]",
                    point.bonus_claims > 0 ? "" : "rounded-t-md",
                  )}
                  style={{
                    height: `${(point.task_claims / Math.max(1, total)) * 100}%`,
                    minHeight: point.task_claims > 0 ? 4 : 0,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {points.map((point) => (
          <span
            key={point.day_msk}
            className="min-w-0 flex-1 truncate text-center text-[10px] tabular-nums text-[var(--admin-muted,#8b98a8)]"
          >
            {point.day_msk.slice(5)}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-[var(--admin-muted,#8b98a8)]">
        Синий — клеймы заданий, жёлтый — бонус дня.
      </p>
    </div>
  );
}
