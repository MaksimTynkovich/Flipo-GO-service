"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  humanizeAnalyticsName,
  humanizeAnalyticsSource,
  humanizeAnalyticsStatus,
  humanizeJourneyPath,
} from "@/components/admin/analytics-labels";
import { AdminChip, AdminPanel, AdminRankList, AdminToolbar } from "@/components/admin/admin-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminUserAnalytics,
  getAdminRiskUsers,
  getAdminUsers,
  type AdminUserAnalytics,
  type AdminUserSession,
  type AdminRiskUser,
  type AdminUser,
} from "@/lib/api";

export default function UsersSection() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [riskUsers, setRiskUsers] = useState<AdminRiskUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [analytics, setAnalytics] = useState<AdminUserAnalytics | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const riskIds = new Set(riskUsers.map((user) => user.user_id));

  async function load(search = query) {
    setLoading(true);
    try {
      const cacheKey = search.trim() ? `admin:users:${search.trim().toLowerCase()}` : "admin:users:default";
      const [userData, riskData] = await loadCached(cacheKey, () =>
        Promise.all([getAdminUsers(search), getAdminRiskUsers()]),
      );
      setUsers(userData);
      setRiskUsers(riskData);
      primeCache(cacheKey, [userData, riskData]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<[AdminUser[], AdminRiskUser[]]>("admin:users:default");
      if (cached) {
        setUsers(cached[0]);
        setRiskUsers(cached[1]);
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
      description="Поиск игрока, его сессии и лента событий. Риск-флаги отмечены в списке."
    >
      <AdminToolbar>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      <AdminPanel title="Список" description="Нажмите на пользователя, чтобы открыть карточку.">
        {users.length === 0 && loading ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted">Пользователи не найдены.</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-auto">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user).catch(() => {})}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${
                  selected?.id === user.id ? "bg-accent/15 ring-1 ring-accent/30" : "bg-surface-raised/40"
                }`}
              >
                <span>
                  {user.first_name || user.username || user.id.slice(0, 8)}
                  {user.is_banned ? " · ban" : ""}
                  {riskIds.has(user.id) ? " · risk" : ""}
                </span>
                <span className="tabular-nums text-muted">{formatTON(user.betting_balance)} TON</span>
              </button>
            ))}
          </div>
        )}
      </AdminPanel>

      {selected ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <AdminPanel
            title={`${selected.first_name || selected.username}`}
            description={`TG ${selected.telegram_id} · баланс ${formatTON(selected.betting_balance)} TON`}
          >
            {detailLoading && !analytics ? (
              <p className="text-sm text-muted">Загружаем…</p>
            ) : analytics ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                    <p className="text-[11px] text-muted">Откуда пришёл</p>
                    <p className="mt-0.5 font-medium">
                      {humanizeAnalyticsSource(analytics.acquisition_source || analytics.acquisition_label)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-raised/40 px-2.5 py-2">
                    <p className="text-[11px] text-muted">Последняя активность</p>
                    <p className="mt-0.5 font-medium">
                      {analytics.last_seen_at ? new Date(analytics.last_seen_at).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Частые действия</p>
                  <AdminRankList
                    items={analytics.top_actions}
                    emptyText="Нет данных."
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
              <p className="text-sm text-muted">Аналитики пока нет.</p>
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
              <div className="max-h-[28rem] space-y-1.5 overflow-auto text-xs">
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
      ) : null}
    </PageShell>
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
                {(session.journey_path || session.screens?.length) ? (
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
