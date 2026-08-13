"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { humanizeAnalyticsName } from "@/components/admin/analytics-labels";
import {
  AdminChip,
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  getAdminAnalyticsOverview,
  type AdminAnalyticsOverview,
  type AnalyticsBucket,
  type AnalyticsFunnel,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: 1, label: "24ч" },
  { value: 7, label: "7д" },
  { value: 30, label: "30д" },
];

const CHART_ACCENT = "#2dd4bf";
const CHART_MUTED = "#8b98a8";
const CHART_GRID = "rgba(255,255,255,0.06)";

function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function formatDayLabel(date: string): string {
  const parts = date.split("-");
  if (parts.length < 3) return date;
  return `${parts[2]}.${parts[1]}`;
}

export default function AnalyticsSection() {
  const [days, setDays] = useState(7);
  const [analytics, setAnalytics] = useState<AdminAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextDays = days) {
    setLoading(true);
    try {
      const cacheKey = `admin:analytics:v4:${nextDays}`;
      const data = await loadCached(cacheKey, () => getAdminAnalyticsOverview(nextDays));
      setAnalytics(data);
      primeCache(cacheKey, data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cacheKey = `admin:analytics:v4:${days}`;
      const cached = readCached<AdminAnalyticsOverview>(cacheKey);
      if (cached) {
        setAnalytics(cached);
        setLoading(false);
      }
      load(days).catch(() => {});
    });
  }, [days]);

  const sessionsByDay = useMemo(() => {
    const points = analytics?.sessions_by_day ?? [];
    return points.map((p) => ({
      date: p.date,
      label: formatDayLabel(p.date),
      sessions: p.count,
    }));
  }, [analytics]);

  const visitsByHour = useMemo(() => {
    const points = analytics?.visits_by_hour ?? [];
    return points.map((p) => ({
      hour: `${String(p.hour).padStart(2, "0")}`,
      visits: p.count,
    }));
  }, [analytics]);

  const onboardingFunnel = useMemo(() => {
    const funnels = analytics?.funnels ?? [];
    return (
      funnels.find((f) => f.name === "onboarding") ??
      funnels.find((f) => f.name === "acquisition") ??
      funnels[0] ??
      null
    );
  }, [analytics]);

  return (
    <AdminPage description="Активность игроков за период. Без админских аккаунтов. Детали по человеку — в «Пользователи».">
      <AdminToolbar>
        {PERIOD_OPTIONS.map((option) => (
          <AdminChip
            key={option.value}
            active={days === option.value}
            onClick={() => setDays(option.value)}
          >
            {option.label}
          </AdminChip>
        ))}
      </AdminToolbar>

      {loading && !analytics ? (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-raised/50" />
          ))}
        </div>
      ) : null}

      {analytics ? (
        <>
          <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <AdminMetric label="DAU" value={formatCount(analytics.dau)} hint="Уникальные за период" accent />
            <AdminMetric label="Новых" value={formatCount(analytics.new_users)} hint="Регистрации за период" />
            <AdminMetric
              label="Заходов"
              value={formatCount(analytics.sessions_total ?? 0)}
              hint="Открытия Mini App"
            />
            <AdminMetric
              label="Вернулись"
              value={formatCount(analytics.returning_users ?? 0)}
              hint="Заходили, но созданы раньше"
            />
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <AdminPanel
              title="Заходы по дням"
              description="Сколько раз открывали Mini App."
              className="xl:col-span-3"
            >
              <SessionsDayChart points={sessionsByDay} />
            </AdminPanel>

            <AdminPanel
              title="По часам (MSK)"
              description="Когда чаще заходят."
              className="xl:col-span-2"
            >
              <HourChart points={visitsByHour} />
            </AdminPanel>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <AdminPanel
              title="Воронка"
              description="От бота до первой ставки / депозита."
            >
              <FunnelChart funnel={onboardingFunnel} />
            </AdminPanel>

            <AdminPanel title="Что смотрят и где ломается">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CompactRank
                  title="Откуда пришли"
                  items={analytics.top_sources ?? []}
                  empty="Пока нет входов."
                />
                <CompactRank
                  title="Экраны"
                  items={analytics.top_screens ?? []}
                  empty="Пока нет просмотров."
                />
                <CompactRank
                  title="Ошибки"
                  items={analytics.top_failures ?? []}
                  empty="Ошибок нет."
                  danger
                />
              </div>
            </AdminPanel>
          </div>
        </>
      ) : !loading ? (
        <AdminEmpty>Не удалось загрузить аналитику.</AdminEmpty>
      ) : null}
    </AdminPage>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  valueLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <p className="text-xs text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--admin-fg)]">
        {valueLabel}: {formatCount(Number(value))}
      </p>
    </div>
  );
}

function SessionsDayChart({
  points,
}: {
  points: Array<{ date: string; label: string; sessions: number }>;
}) {
  if (!points.length || points.every((p) => p.sessions === 0)) {
    return <p className="py-10 text-center text-sm text-[var(--admin-muted)]">Нет заходов за период.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="analyticsSessionsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: CHART_MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip valueLabel="Заходы" />}
            cursor={{ stroke: CHART_ACCENT, strokeOpacity: 0.35 }}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke={CHART_ACCENT}
            strokeWidth={2}
            fill="url(#analyticsSessionsFill)"
            activeDot={{ r: 4, fill: CHART_ACCENT }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HourChart({ points }: { points: Array<{ hour: string; visits: number }> }) {
  if (!points.length || points.every((p) => p.visits === 0)) {
    return <p className="py-10 text-center text-sm text-[var(--admin-muted)]">Нет заходов за период.</p>;
  }

  const peak = Math.max(...points.map((p) => p.visits));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fill: CHART_MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fill: CHART_MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip valueLabel="Заходы" />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="visits" radius={[3, 3, 0, 0]} maxBarSize={14}>
            {points.map((point) => (
              <Cell
                key={point.hour}
                fill={point.visits === peak && peak > 0 ? CHART_ACCENT : "rgba(45,212,191,0.45)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: AnalyticsFunnel | null }) {
  const steps = funnel?.steps ?? [];
  if (!steps.length) {
    return <p className="py-8 text-center text-sm text-[var(--admin-muted)]">Нет данных по воронке.</p>;
  }

  const max = Math.max(1, ...steps.map((s) => s.count));

  return (
    <div className="space-y-2.5">
      {steps.map((step, index) => {
        const width = Math.max(8, (step.count / max) * 100);
        const drop = step.drop_off_pct ?? 0;
        return (
          <div key={`${step.name}-${index}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-[var(--admin-muted)]">
                {humanizeAnalyticsName(step.name)}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--admin-fg)]">
                {formatCount(step.count)}
                {index > 0 && drop > 0 ? (
                  <span className="ml-1.5 text-rose-400">−{drop.toFixed(0)}%</span>
                ) : null}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-[var(--admin-accent)]/80 transition-[width]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactRank({
  title,
  items,
  empty,
  danger = false,
}: {
  title: string;
  items: AnalyticsBucket[];
  empty: string;
  danger?: boolean;
}) {
  const rows = items.slice(0, 6);
  const max = Math.max(1, ...rows.map((item) => item.count));

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--admin-muted)]">
        {title}
      </p>
      {!rows.length ? (
        <p className="text-sm text-[var(--admin-muted)]">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((item) => (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-[var(--admin-muted)]">
                  {humanizeAnalyticsName(item.name)}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--admin-fg)]">
                  {formatCount(item.count)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-black/25">
                <div
                  className={cn(
                    "h-full rounded-full",
                    danger ? "bg-rose-400/70" : "bg-[var(--admin-accent)]/70",
                  )}
                  style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
