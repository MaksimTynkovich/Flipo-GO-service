"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminRiskUsers,
  getAdminUserBets,
  getAdminUsers,
  type AdminRiskUser,
  type AdminUser,
} from "@/lib/api";

export default function UsersSection() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [riskUsers, setRiskUsers] = useState<AdminRiskUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [bets, setBets] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function selectUser(user: AdminUser) {
    setSelected(user);
    const data = await getAdminUserBets(user.id);
    setBets(data);
  }

  return (
    <PageShell title="Пользователи" description="История ставок и фрод-мониторинг.">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field h-10 min-w-[200px] flex-1"
          placeholder="Поиск по username, имени, Telegram ID"
        />
        <button className="quick-amount quick-amount-active h-10 px-4" onClick={() => load(query).catch(() => {})}>
          {loading ? "…" : "Найти"}
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="panel space-y-2">
          <p className="text-base font-semibold">Риск-пользователи</p>
          {riskUsers.length === 0 && loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                <div className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
                <div className="mt-2 h-3 w-40 animate-pulse rounded bg-surface-raised" />
              </div>
            ))
          ) : riskUsers.length === 0 ? (
            <p className="text-sm text-muted">Пока нет пользователей с risk flags.</p>
          ) : (
            riskUsers.map((user) => (
              <div key={user.user_id} className="rounded-xl bg-surface-raised/50 px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{user.first_name || user.username || user.user_id.slice(0, 8)}</span>
                  <span>{formatTON(user.daily_win_nanoton)} TON / день</span>
                </div>
                <p className="mt-1 text-xs text-muted">{user.risk_flags.join(", ") || "—"}</p>
              </div>
            ))
          )}
        </div>

        <div className="panel space-y-2">
          <p className="text-base font-semibold">Все пользователи</p>
          {users.length === 0 && loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-xl bg-surface-raised/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-24 animate-pulse rounded bg-surface-raised" />
                    <div className="h-4 w-16 animate-pulse rounded bg-surface-raised" />
                  </div>
                </div>
              ))
            : users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user).catch(() => {})}
                  className="flex w-full items-center justify-between rounded-xl bg-surface-raised/50 px-3 py-2 text-left text-sm"
                >
                  <span>
                    {user.first_name || user.username || user.id.slice(0, 8)}
                    {user.is_banned ? " · banned" : ""}
                  </span>
                  <span>{formatTON(user.betting_balance)} TON</span>
                </button>
              ))}
        </div>
      </section>

      {selected ? (
        <section className="panel space-y-2">
          <p className="text-base font-semibold">
            Ставки: {selected.first_name || selected.username} ({selected.telegram_id})
          </p>
          {bets.length === 0 ? (
            <p className="text-sm text-muted">Нет ставок.</p>
          ) : (
            <pre className="max-h-64 overflow-auto rounded-xl bg-surface-raised/50 p-3 text-xs">
              {JSON.stringify(bets, null, 2)}
            </pre>
          )}
        </section>
      ) : null}
    </PageShell>
  );
}
