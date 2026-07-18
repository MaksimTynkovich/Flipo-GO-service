"use client";

import { useEffect, useState } from "react";
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
  formatTON,
  getAdminStakingDropoff,
  type AdminStakingDropoff,
  type AdminStakingDropoffUser,
} from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: 1, label: "24ч" },
  { value: 7, label: "7д" },
  { value: 30, label: "30д" },
];

function displayName(user: AdminStakingDropoffUser) {
  return user.first_name || user.username || `id ${user.telegram_id}`;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StakingDropoffSection() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AdminStakingDropoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(nextDays = days) {
    setLoading(true);
    try {
      const cacheKey = `admin:staking-dropoff:v1:${nextDays}`;
      const next = await loadCached(cacheKey, () => getAdminStakingDropoff(nextDays, 80));
      setData(next);
      primeCache(cacheKey, next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cacheKey = `admin:staking-dropoff:v1:${days}`;
      const cached = readCached<AdminStakingDropoff>(cacheKey);
      if (cached) setData(cached);
      load(days).catch(() => {});
    });
  }, [days]);

  const users = data?.users ?? [];

  return (
    <AdminPage
      title="Отток стейкинга"
      description="Зашли на стейкинг с подарками в профиле, увидели оценку бота и ушли без стейка. Помогает проверить, не отталкивает ли заниженная оценка."
    >
      <AdminToolbar>
        {PERIOD_OPTIONS.map((option) => (
          <AdminChip key={option.value} active={days === option.value} onClick={() => setDays(option.value)}>
            {option.label}
          </AdminChip>
        ))}
      </AdminToolbar>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminMetric
          label="С подарками на стейкинге"
          value={String(data?.viewers_with_profile_gifts ?? 0)}
          hint="Оценка профиля загружена"
        />
        <AdminMetric
          label="Ушли без стейка"
          value={String(data?.dropoff_count ?? 0)}
          accent
          hint={
            data
              ? `${Math.round(data.dropoff_rate_pct)}% от тех, у кого были подарки`
              : undefined
          }
        />
        <AdminMetric
          label="Оценка вне стейка"
          value={formatTON(data?.total_unstaked_valuation_nanoton ?? 0)}
          hint="Сумма оценок бота, TON"
        />
        <AdminMetric
          label="В списке"
          value={loading && !data ? "…" : String(users.length)}
          hint="Последняя оценка, без стейка"
        />
      </div>

      <AdminPanel
        title="Пользователи"
        description="Клик по строке — список подарков и оценка на момент визита."
      >
        {users.length === 0 ? (
          <AdminEmpty>
            {loading
              ? "Загрузка…"
              : "Пока нет данных. Список появится после визитов на стейкинг с подарками в профиле (событие staking_gifts_valued)."}
          </AdminEmpty>
        ) : (
          <div className="space-y-1.5">
            {users.map((user) => {
              const open = expanded === user.user_id;
              return (
                <div
                  key={user.user_id}
                  className="overflow-hidden rounded-md bg-surface-raised/40"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : user.user_id)}
                    className="flex w-full items-start justify-between gap-3 px-2.5 py-2 text-left"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium text-foreground">
                        {displayName(user)}
                        {user.username ? (
                          <span className="ml-1.5 font-normal text-muted">@{user.username}</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted">
                        Вход {formatWhen(user.entered_at)}
                        {" · "}
                        Оценка {formatWhen(user.valued_at)}
                        {user.first_staking_at
                          ? ` · Стейкинг с ${formatWhen(user.first_staking_at)}`
                          : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        <TonAmount
                          amount={formatTON(user.unstaked_profile_valuation_nanoton)}
                          variant="brand"
                          iconClassName="h-3.5 w-3.5"
                        />
                      </p>
                      <p className="text-[11px] tabular-nums text-muted">
                        {user.unstaked_profile_count}/{user.profile_gift_count} подарков
                      </p>
                    </div>
                  </button>

                  {open ? (
                    <div className="hairline-top space-y-1 px-2.5 py-2">
                      {(user.gifts ?? []).length === 0 ? (
                        <p className="text-[11px] text-muted">Снимок подарков не сохранён</p>
                      ) : (
                        (user.gifts ?? []).map((gift) => (
                          <div
                            key={gift.slug}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                              gift.is_staked ? "opacity-50" : "bg-surface/60",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{gift.name || gift.slug}</p>
                              <p className="truncate text-[11px] text-muted">
                                {gift.collection_slug || gift.slug}
                                {gift.is_staked ? " · уже в стейке" : ""}
                              </p>
                            </div>
                            <p className="shrink-0 tabular-nums font-semibold">
                              <TonAmount
                                amount={formatTON(gift.price_nanoton)}
                                variant="brand"
                                iconClassName="h-3.5 w-3.5"
                              />
                            </p>
                          </div>
                        ))
                      )}
                      <p className="pt-1 text-[10px] text-muted">
                        tg id {user.telegram_id}
                        {" · "}
                        user {user.user_id.slice(0, 8)}…
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
