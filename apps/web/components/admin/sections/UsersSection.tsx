"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  humanizeAnalyticsName,
  humanizeAnalyticsSource,
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
import {
  formatTON,
  getAdminUserAnalytics,
  getAdminUserAudience,
  getAdminRiskUsers,
  getAdminSharedIPClusters,
  getAdminUsers,
  type AdminIPCluster,
  type AdminUserAnalytics,
  type AdminUserAudience,
  type AdminUserSession,
  type AdminRiskUser,
  type AdminUser,
  type AnalyticsHourPoint,
} from "@/lib/api";

type UsersPayload = [AdminUserAudience, AdminUser[], AdminRiskUser[], AdminIPCluster[]];

function displayName(user: AdminUser) {
  return user.first_name || user.username || `id ${user.telegram_id}`;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function UsersSection() {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<AdminUserAudience | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [riskUsers, setRiskUsers] = useState<AdminRiskUser[]>([]);
  const [ipClusters, setIpClusters] = useState<AdminIPCluster[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [analytics, setAnalytics] = useState<AdminUserAnalytics | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const riskIds = useMemo(() => new Set(riskUsers.map((user) => user.user_id)), [riskUsers]);
  const riskById = useMemo(() => {
    const map = new Map<string, AdminRiskUser>();
    for (const row of riskUsers) map.set(row.user_id, row);
    return map;
  }, [riskUsers]);
  const referralAbuseCount = useMemo(
    () => ipClusters.filter((cluster) => cluster.referral_linked).length,
    [ipClusters],
  );

  async function load(search = query) {
    setLoading(true);
    try {
      const cacheKey = search.trim()
        ? `admin:users:v6:${search.trim().toLowerCase()}`
        : "admin:users:v6:default";
      const [audienceData, userData, riskData, clusterData] = await loadCached(cacheKey, () =>
        Promise.all([
          getAdminUserAudience(),
          getAdminUsers(search),
          getAdminRiskUsers(),
          getAdminSharedIPClusters(30, 2),
        ]),
      );
      setAudience(audienceData);
      setUsers(userData);
      setRiskUsers(riskData);
      setIpClusters(clusterData);
      primeCache(cacheKey, [audienceData, userData, riskData, clusterData] satisfies UsersPayload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<UsersPayload>("admin:users:v6:default");
      if (cached) {
        setAudience(cached[0]);
        setUsers(cached[1]);
        setRiskUsers(cached[2]);
        setIpClusters(cached[3] ?? []);
      }
      load().catch(() => {});
    });
  }, []);

  async function loadUserAnalytics(user: AdminUser, sessionId?: string | null) {
    setDetailLoading(true);
    try {
      const analyticsData = await getAdminUserAnalytics(user.id, 80, sessionId || undefined);
      setAnalytics(analyticsData);
      setSelectedSessionId(sessionId ?? null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function selectUser(user: AdminUser) {
    setSelected(user);
    setSelectedSessionId(null);
    await loadUserAnalytics(user, null);
  }

  async function selectSession(sessionId: string | null) {
    if (!selected) return;
    await loadUserAnalytics(selected, sessionId);
  }

  return (
    <PageShell
      title="Пользователи"
      description="Аудитория бота, стейкинг и активность по каждому игроку."
    >
      <AdminToolbar>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load(query).catch(() => {});
          }}
          className="input-field h-9 min-w-[200px] flex-1"
          placeholder="Имя, username или Telegram ID"
        />
        <AdminChip active onClick={() => load(query).catch(() => {})}>
          {loading ? "…" : "Найти"}
        </AdminChip>
        {riskUsers.length > 0 ? (
          <span className="text-xs text-muted">Риск: {riskUsers.length}</span>
        ) : null}
      </AdminToolbar>

      <AdminPanel
        title="Пользователи в проекте"
        description="Регистрации: сегодня (MSK), 7 дней и за всё время. Источник — реф.ссылка или органика."
      >
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <AdminMetric
            label="Всего"
            value={audience ? String(audience.total_users) : "—"}
            hint="За всё время"
            accent
          />
          <AdminMetric
            label="Сегодня"
            value={audience ? String(audience.new_users_today) : "—"}
            hint={
              audience
                ? `из них по реф. ${audience.referred_today}`
                : "Календарный день MSK"
            }
            accent
          />
          <AdminMetric
            label="За 7 дней"
            value={audience ? String(audience.new_users_7d) : "—"}
            hint={audience ? `из них по реф. ${audience.referred_7d}` : undefined}
          />
          <AdminMetric
            label="По реф. / органика"
            value={
              audience
                ? `${audience.referred_users} / ${audience.organic_users}`
                : "—"
            }
            hint="Все время · есть referrer_id"
          />
        </div>
      </AdminPanel>

      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <AdminMetric
          label="Активны 24ч / 7д"
          value={
            audience
              ? `${audience.active_users_24h} / ${audience.active_users_7d}`
              : "—"
          }
          hint="По last login"
        />
        <AdminMetric
          label="В стейкинге"
          value={audience ? String(audience.with_staking) : "—"}
          hint={
            audience
              ? `TVL ${formatTON(audience.staking_tvl_nanoton)} TON · boost ${audience.boost_tier_users}`
              : undefined
          }
          accent
        />
        <AdminMetric
          label="Выплата всем / день"
          value={audience ? `${formatTON(audience.staking_daily_yield_nanoton)} TON` : "—"}
          hint="По текущим позициям и tier"
          accent
        />
        <AdminMetric
          label="Выплата всем / неделю"
          value={audience ? `${formatTON(audience.staking_weekly_yield_nanoton)} TON` : "—"}
          hint="×7 дневных начислений"
          accent
        />
        <AdminMetric
          label="Уже выплачено за эпоху"
          value={audience ? `${formatTON(audience.staking_accrued_yield_nanoton)} TON` : "—"}
          hint="Сумма daily accrual в текущей неделе"
        />
        <AdminMetric
          label="С балансом"
          value={audience ? String(audience.with_balance) : "—"}
          hint={
            audience
              ? `${formatTON(audience.balances_nanoton)} + ${formatTON(audience.promo_balances_nanoton)} promo`
              : undefined
          }
        />
        <AdminMetric
          label="С кошельком"
          value={audience ? String(audience.with_wallet) : "—"}
        />
        <AdminMetric
          label="Забанены / риск"
          value={
            audience
              ? `${audience.banned_users} / ${riskUsers.length}`
              : String(riskUsers.length)
          }
        />
      </section>

      <AdminPanel
        title="Топ реф.ссылок"
        description="Кто привёл больше всего игроков (всего / сегодня / 7д)."
      >
        {(audience?.top_referrers?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">Пока нет приходов по реф.ссылкам.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-auto">
            {audience!.top_referrers.map((ref) => {
              const name = ref.first_name || ref.username || `TG ${ref.telegram_id}`;
              return (
                <div
                  key={ref.user_id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised/40 px-2.5 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {name}
                      {ref.username ? (
                        <span className="ml-1.5 font-normal text-muted">@{ref.username}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {ref.referral_code || `ref_…`} · TG {ref.telegram_id}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    <p className="font-semibold">{ref.referral_count}</p>
                    <p className="text-muted">
                      +{ref.referral_count_today}д · +{ref.referral_count_7d}н
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Мультиаккаунты по IP"
        description="Одинаковый IP у нескольких аккаунтов за 30 дней. «Реф.связка» — реферер и приглашённый на одном IP (вероятный абуз рефки)."
      >
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted">
          <span>Кластеров: {ipClusters.length}</span>
          {referralAbuseCount > 0 ? (
            <span className="text-danger">с реф.связкой: {referralAbuseCount}</span>
          ) : null}
        </div>
        {ipClusters.length === 0 ? (
          <p className="text-sm text-muted">
            Пока нет общих IP. После деплоя IP пишется из auth/analytics (CF-Connecting-IP).
          </p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-auto">
            {ipClusters.map((cluster) => (
              <div
                key={cluster.ip}
                className={`rounded-xl px-3 py-2.5 ${
                  cluster.referral_linked
                    ? "bg-danger/10 ring-1 ring-danger/25"
                    : "bg-surface-raised/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tabular-nums">{cluster.ip}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {cluster.user_count} аккаунтов · {cluster.event_count} событий ·{" "}
                      {formatWhen(cluster.last_seen_at)}
                      {cluster.referral_linked ? " · реф.связка" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {cluster.users.map((u) => {
                    const name = u.first_name || u.username || `TG ${u.telegram_id}`;
                    return (
                      <button
                        key={u.user_id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-background/40 px-2 py-1.5 text-left text-xs hover:bg-background/70"
                        onClick={() => {
                          const match = users.find((row) => row.id === u.user_id);
                          if (match) {
                            selectUser(match).catch(() => {});
                          }
                        }}
                      >
                        <span className="min-w-0 truncate">
                          {name}
                          {u.username ? (
                            <span className="text-muted"> @{u.username}</span>
                          ) : null}
                          {u.referrer_id ? (
                            <span className="text-muted">
                              {" "}
                              ← реф.{" "}
                              {u.referrer_username
                                ? `@${u.referrer_username}`
                                : u.referrer_telegram_id || "…"}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">{u.events_from_ip}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <AdminPanel
          title="Список"
          description={`${users.length} в выдаче · нажмите, чтобы открыть карточку`}
        >
          {users.length === 0 && loading ? (
            <p className="text-sm text-muted">Загрузка…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted">Пользователи не найдены.</p>
          ) : (
            <div className="max-h-[32rem] space-y-1.5 overflow-auto">
              {users.map((user) => {
                const risky = riskIds.has(user.id);
                const stake = user.staking_principal_nanoton || 0;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user).catch(() => {})}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                      selected?.id === user.id
                        ? "bg-accent/15 ring-1 ring-accent/30"
                        : "bg-surface-raised/40 hover:bg-surface-raised/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {displayName(user)}
                          {user.username ? (
                            <span className="ml-1.5 font-normal text-muted">@{user.username}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          TG {user.telegram_id}
                          {user.came_via_referral
                            ? ` · реф. ${user.referrer_code || user.referrer_username || user.referrer_telegram_id || "да"}`
                            : " · органика"}
                          {user.staking_tier === "boost" ? " · boost" : ""}
                          {user.is_banned ? " · ban" : ""}
                          {risky ? " · risk" : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs tabular-nums">
                        <p className="font-medium">{formatTON(user.betting_balance)} TON</p>
                        <p className={stake > 0 ? "text-accent" : "text-muted"}>
                          stake {formatTON(stake)}
                        </p>
                        {(user.staking_daily_yield_nanoton || 0) > 0 ? (
                          <p className="text-muted">
                            +{formatTON(user.staking_daily_yield_nanoton)}/д · +
                            {formatTON(user.staking_weekly_yield_nanoton)}/нед
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </AdminPanel>

        {selected ? (
          <div className="space-y-3">
            <AdminPanel
              title={displayName(selected)}
              description={
                selected.username
                  ? `@${selected.username} · TG ${selected.telegram_id}`
                  : `TG ${selected.telegram_id}`
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <AdminMetric
                  label="Баланс"
                  value={`${formatTON(selected.betting_balance)} TON`}
                  accent
                />
                <AdminMetric
                  label="В стейкинге"
                  value={`${formatTON(selected.staking_principal_nanoton || 0)} TON`}
                  hint={
                    selected.active_stakes
                      ? `${selected.active_stakes} активн. · ${selected.staking_tier || "base"}`
                      : selected.staking_tier || "base"
                  }
                  accent
                />
                <AdminMetric
                  label="Выплата / день"
                  value={`${formatTON(selected.staking_daily_yield_nanoton || 0)} TON`}
                  hint="Следующее daily accrual"
                  accent
                />
                <AdminMetric
                  label="Выплата / неделю"
                  value={`${formatTON(selected.staking_weekly_yield_nanoton || 0)} TON`}
                  hint="7 × дневное при текущем stake"
                />
                <AdminMetric
                  label="Уже выплачено (эпоха)"
                  value={`${formatTON(selected.staking_accrued_yield_nanoton || 0)} TON`}
                  hint="Сумма начисленных дней этой недели"
                />
                <AdminMetric
                  label="Промо"
                  value={`${formatTON(selected.promo_balance || 0)} TON`}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted">Откуда пришёл</p>
                  {selected.came_via_referral ? (
                    <>
                      <p className="mt-0.5 font-medium">Реф.ссылка</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {selected.referrer_first_name || selected.referrer_username || "реферер"}
                        {selected.referrer_username ? ` @${selected.referrer_username}` : ""}
                        {selected.referrer_telegram_id
                          ? ` · TG ${selected.referrer_telegram_id}`
                          : ""}
                      </p>
                      {selected.referrer_code ? (
                        <p className="mt-0.5 font-mono text-[11px] text-accent">
                          {selected.referrer_code}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-0.5 font-medium">Органика / прямой вход</p>
                  )}
                </div>
                <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted">Последний вход</p>
                  <p className="mt-0.5 font-medium">{formatWhen(selected.last_login_at)}</p>
                </div>
                <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted">Кошелёк</p>
                  <p className="mt-0.5 truncate font-medium">
                    {selected.ton_wallet ? selected.ton_wallet : "не привязан"}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted">Последний IP</p>
                  <p className="mt-0.5 font-mono text-xs font-medium">
                    {selected.last_ip || "—"}
                  </p>
                  {selected.last_ip_at ? (
                    <p className="mt-0.5 text-[11px] text-muted">{formatWhen(selected.last_ip_at)}</p>
                  ) : null}
                </div>
                <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted">Регистрация</p>
                  <p className="mt-0.5 font-medium">{formatWhen(selected.created_at)}</p>
                </div>
              </div>

              {(selected.is_banned ||
                (selected.risk_flags?.length ?? 0) > 0 ||
                riskById.has(selected.id)) && (
                <div className="mt-3 rounded-lg bg-danger/10 px-2.5 py-2 text-xs text-danger">
                  {[
                    selected.is_banned ? "ban" : null,
                    ...(selected.risk_flags || []),
                    riskById.has(selected.id) ? "в мониторинге" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              {detailLoading && !analytics ? (
                <p className="mt-3 text-sm text-muted">Загружаем аналитику…</p>
              ) : analytics ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                      <p className="text-[11px] text-muted">Откуда пришёл</p>
                      <p className="mt-0.5 font-medium">
                        {humanizeAnalyticsSource(
                          analytics.acquisition_source || analytics.acquisition_label,
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                      <p className="text-[11px] text-muted">Последняя активность</p>
                      <p className="mt-0.5 font-medium">{formatWhen(analytics.last_seen_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AdminMetric
                      label="Заходов сегодня"
                      value={String(analytics.sessions_today ?? 0)}
                      accent
                    />
                    <AdminMetric
                      label="За 7 дней"
                      value={String(analytics.sessions_7d ?? 0)}
                      hint={
                        analytics.active_days_7d
                          ? `${analytics.active_days_7d} дн. · ~${(analytics.avg_sessions_per_active_day || 0).toFixed(1)}/день`
                          : undefined
                      }
                    />
                    <AdminMetric
                      label="Всего заходов"
                      value={String(analytics.sessions_total ?? 0)}
                    />
                    <AdminMetric
                      label="Активных дней"
                      value={String(analytics.active_days_7d ?? 0)}
                      hint="За 7 дней"
                    />
                  </div>
                  {(analytics.visits_by_hour?.some((p) => p.count > 0) ?? false) ? (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">Часы заходов (MSK)</p>
                      <UserHourBars points={analytics.visits_by_hour ?? []} />
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">Частые действия</p>
                    <AdminRankList
                      items={analytics.top_actions}
                      emptyText="Нет данных."
                      formatName={humanizeAnalyticsName}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">Любимые режимы</p>
                    <AdminRankList
                      items={analytics.favorite_modes}
                      emptyText="Пока нет."
                      formatName={humanizeAnalyticsName}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">Ошибки</p>
                    <AdminRankList
                      items={analytics.top_failures}
                      emptyText="Ошибок нет."
                      formatName={humanizeAnalyticsName}
                    />
                  </div>
                  <SessionsPanel
                    sessions={analytics.sessions ?? []}
                    activeSessionId={selectedSessionId || analytics.active_session_id}
                    loading={detailLoading}
                    onSelect={(sessionId) => selectSession(sessionId).catch(() => {})}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">Аналитики пока нет.</p>
              )}
            </AdminPanel>

            <AdminPanel
              title="Лента событий"
              description={
                selectedSessionId
                  ? `Фильтр: сессия ${selectedSessionId.slice(0, 8)}…`
                  : "Все события пользователя за последнее время."
              }
            >
              {selectedSessionId ? (
                <button
                  type="button"
                  className="mb-2 text-xs text-accent"
                  onClick={() => selectSession(null).catch(() => {})}
                >
                  Показать все сессии
                </button>
              ) : null}
              {analytics?.timeline?.length ? (
                <div className="max-h-[22rem] space-y-1.5 overflow-auto text-xs">
                  {analytics.timeline.map((event) => (
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
              ) : (
                <p className="text-sm text-muted">Лента пуста.</p>
              )}
            </AdminPanel>
          </div>
        ) : (
          <AdminPanel title="Карточка игрока" description="Выберите пользователя слева.">
            <p className="text-sm text-muted">
              Здесь появятся баланс, сумма в стейкинге, источник трафика, сессии и лента событий.
            </p>
          </AdminPanel>
        )}
      </div>
    </PageShell>
  );
}

function UserHourBars({ points }: { points: AnalyticsHourPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex h-16 items-end gap-0.5">
      {points.map((point) => (
        <div key={point.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-sm bg-accent/70"
            style={{ height: `${Math.max(3, (point.count / max) * 100)}%` }}
            title={`${point.hour}:00 — ${point.count}`}
          />
        </div>
      ))}
    </div>
  );
}

function SessionsPanel({
  sessions,
  activeSessionId,
  loading,
  onSelect,
}: {
  sessions: AdminUserSession[];
  activeSessionId?: string | null;
  loading: boolean;
  onSelect: (sessionId: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">Сессии</p>
        {activeSessionId ? (
          <button type="button" className="text-xs text-accent" onClick={() => onSelect(null)}>
            Сбросить
          </button>
        ) : null}
      </div>
      {loading && sessions.length === 0 ? (
        <p className="text-sm text-muted">Загружаем…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted">Сессий пока нет.</p>
      ) : (
        <div className="max-h-52 space-y-1.5 overflow-auto">
          {sessions.map((session) => {
            const active = activeSessionId === session.session_id;
            return (
              <button
                key={session.session_id}
                type="button"
                onClick={() => onSelect(session.session_id)}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-xs ${
                  active ? "bg-accent/15 ring-1 ring-accent/30" : "bg-surface-raised/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{session.session_id.slice(0, 8)}…</span>
                  <span className="text-muted">{session.event_count} событий</span>
                </div>
                {session.journey_path || session.screens?.length ? (
                  <p className="mt-1 truncate text-muted">
                    {session.journey_path
                      ? humanizeJourneyPath(session.journey_path)
                      : session.screens.map((screen) => humanizeAnalyticsName(screen)).join(" → ")}
                  </p>
                ) : null}
                {(session.last_error_code || session.ended_after_error) && (
                  <p className="mt-1 text-danger">
                    {session.last_error_code ? humanizeAnalyticsName(session.last_error_code) : ""}
                    {session.ended_after_error ? " · ушёл после ошибки" : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
