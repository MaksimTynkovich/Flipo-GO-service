"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  formatDurationMs,
  humanizeAnalyticsName,
  humanizeAnalyticsStatus,
  humanizeJourneyPath,
} from "@/components/admin/analytics-labels";
import {
  AdminChip,
  AdminMetric,
  AdminPanel,
  AdminRankList,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { getAdminAnalyticsOverview, type AdminAnalyticsOverview, type AnalyticsTimelineEvent } from "@/lib/api";

const PERIOD_OPTIONS = [
  { value: 1, label: "24ч" },
  { value: 7, label: "7д" },
  { value: 30, label: "30д" },
];

export default function AnalyticsSection() {
  const [days, setDays] = useState(7);
  const [errorCode, setErrorCode] = useState("");
  const [inputId, setInputId] = useState("");
  const [analytics, setAnalytics] = useState<AdminAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const errorOptions = useMemo(() => {
    if (!analytics) return [];
    const names = new Set<string>();
    for (const item of analytics.top_failures ?? []) {
      if (item.name) names.add(item.name);
    }
    return Array.from(names);
  }, [analytics]);

  const inputOptions = useMemo(() => {
    if (!analytics) return [];
    return (analytics.top_input_abandons ?? []).map((item) => item.name).filter(Boolean);
  }, [analytics]);

  async function load(nextDays = days, nextErrorCode = errorCode, nextInputId = inputId) {
    setLoading(true);
    try {
      const cacheKey = `admin:analytics:v2:${nextDays}:${nextErrorCode}:${nextInputId}`;
      const data = await loadCached(cacheKey, () =>
        getAdminAnalyticsOverview(nextDays, {
          errorCode: nextErrorCode || undefined,
          inputId: nextInputId || undefined,
        }),
      );
      setAnalytics(data);
      primeCache(cacheKey, data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cacheKey = `admin:analytics:v2:${days}:${errorCode}:${inputId}`;
      const cached = readCached<AdminAnalyticsOverview>(cacheKey);
      if (cached) setAnalytics(cached);
      load(days, errorCode, inputId).catch(() => {});
    });
  }, [days, errorCode, inputId]);

  return (
    <PageShell
      title="Аналитика"
      description="Где пользователи действуют, ошибаются и уходят. Детали по пользователю — в «Пользователи»."
    >
      <AdminToolbar>
        {PERIOD_OPTIONS.map((option) => (
          <AdminChip key={option.value} active={days === option.value} onClick={() => setDays(option.value)}>
            {option.label}
          </AdminChip>
        ))}
        <select
          value={errorCode}
          onChange={(e) => setErrorCode(e.target.value)}
          className="input-field h-9 min-w-[160px] py-0 text-sm"
        >
          <option value="">Все ошибки</option>
          {errorOptions.map((name) => (
            <option key={name} value={name}>
              {humanizeAnalyticsName(name)}
            </option>
          ))}
        </select>
        <select
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          className="input-field h-9 min-w-[160px] py-0 text-sm"
        >
          <option value="">Все поля ввода</option>
          {inputOptions.map((name) => (
            <option key={name} value={name}>
              {humanizeAnalyticsName(name)}
            </option>
          ))}
        </select>
        {(errorCode || inputId) && (
          <AdminChip
            onClick={() => {
              setErrorCode("");
              setInputId("");
            }}
          >
            Сбросить
          </AdminChip>
        )}
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
            <AdminMetric label="DAU" value={String(analytics.dau)} />
            <AdminMetric label="WAU" value={String(analytics.wau)} />
            <AdminMetric label="Новых" value={String(analytics.new_users)} />
            <AdminMetric
              label="Ушли после ошибки"
              value={String(analytics.sessions_ended_after_error)}
              hint="Сессии, закрытые в течение 30 мин после ошибки"
            />
          </section>

          {(errorCode || inputId) && (
            <AdminPanel
              title="События по фильтру"
              description={`Найдено: ${analytics.filtered_count ?? 0}`}
            >
              <FilteredTimeline events={analytics.filtered_events ?? []} />
            </AdminPanel>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <AdminPanel title="Что делают" description="Успешные действия и популярные экраны.">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Действия</p>
                  <AdminRankList
                    items={analytics.top_actions ?? []}
                    emptyText="Пока нет данных."
                    formatName={humanizeAnalyticsName}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Экраны</p>
                  <AdminRankList
                    items={analytics.top_screens ?? []}
                    emptyText="Пока нет данных."
                    formatName={humanizeAnalyticsName}
                  />
                </div>
              </div>
            </AdminPanel>

            <AdminPanel title="Где ломается" description="Частые ошибки и экраны с ошибками.">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Ошибки</p>
                  <AdminRankList
                    items={analytics.top_failures ?? []}
                    emptyText="Ошибок нет."
                    formatName={humanizeAnalyticsName}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">По экранам</p>
                  <AdminRankList
                    items={analytics.errors_by_screen ?? []}
                    emptyText="Ошибок по экранам нет."
                    formatName={humanizeAnalyticsName}
                  />
                </div>
              </div>
            </AdminPanel>

            <AdminPanel title="Где теряем" description="Отток, брошенный ввод и пути перед уходом.">
              <div className="space-y-4">
                <ExitRatesList items={analytics.screen_exit_rates ?? []} />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Брошенный ввод</p>
                  <AdminRankList
                    items={analytics.top_input_abandons ?? []}
                    emptyText="Нет брошенного ввода."
                    formatName={humanizeAnalyticsName}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Пути перед уходом</p>
                  <AdminRankList
                    items={analytics.exit_paths ?? []}
                    emptyText="Нет данных."
                    formatName={humanizeJourneyPath}
                  />
                </div>
              </div>
            </AdminPanel>

            <AdminPanel title="Воронки" description="Сколько людей доходит до следующего шага.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(analytics.funnels ?? []).map((funnel) => (
                  <div key={funnel.name} className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                    <p className="text-sm font-semibold">{humanizeAnalyticsName(funnel.name)}</p>
                    <div className="mt-2 space-y-1 text-xs">
                      {(funnel.steps ?? []).map((step) => (
                        <div key={step.name} className="flex items-center justify-between gap-2 text-muted">
                          <span className="truncate">{humanizeAnalyticsName(step.name)}</span>
                          <span className="shrink-0 font-semibold text-foreground">
                            {step.count}
                            {step.drop_off_pct != null && step.drop_off_pct > 0 ? (
                              <span className="ml-1 font-normal text-red-400">−{step.drop_off_pct.toFixed(0)}%</span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </AdminPanel>
          </div>
        </>
      ) : null}
    </PageShell>
  );
}

function ExitRatesList({
  items,
}: {
  items: Array<{ name: string; count: number; secondary_count?: number; rate_percent?: number }>;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted">Нет данных об оттоке.</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">Отток с экранов</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised/40 px-2.5 py-2 text-sm"
          >
            <span className="truncate text-muted">{humanizeAnalyticsName(item.name)}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {item.rate_percent != null ? `${item.rate_percent}%` : item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilteredTimeline({ events }: { events: AnalyticsTimelineEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted">Нет событий за выбранный период.</p>;
  }
  return (
    <div className="max-h-72 space-y-1.5 overflow-auto text-xs">
      {events.map((event) => (
        <div key={event.id} className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{humanizeAnalyticsName(event.event_name)}</span>
            <span className="text-muted">{new Date(event.occurred_at).toLocaleString()}</span>
          </div>
          <p className="mt-0.5 text-muted">
            {humanizeAnalyticsName(event.screen || event.path || event.source)}
            {event.status ? ` · ${humanizeAnalyticsStatus(event.status)}` : ""}
            {event.error_code ? ` · ${humanizeAnalyticsName(event.error_code)}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
