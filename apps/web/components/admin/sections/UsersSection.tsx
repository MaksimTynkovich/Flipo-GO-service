"use client";

import { useEffect, useMemo, useState } from "react";
import {
  humanizeAnalyticsName,
  humanizeAnalyticsSource,
  humanizeAnalyticsStatus,
  humanizeJourneyPath,
} from "@/components/admin/analytics-labels";
import {
  AdminPage,
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminMetric,
  AdminPanel,
  AdminRankList,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { AdminTonField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getAdminUserAnalytics,
  getAdminUserAudience,
  getAdminUserBets,
  getAdminUserTransfers,
  getAdminRiskUsers,
  getAdminUsers,
  setAdminUserBalance,
  setAdminUserBanned,
  setAdminUserWithdrawalsDisabled,
  type AdminUserAnalytics,
  type AdminUserAudience,
  type AdminUserBetItem,
  type AdminUserBetsResponse,
  type AdminUserPeriod,
  type AdminUserSession,
  type AdminUserSort,
  type AdminUserTransfersResponse,
  type AdminRiskUser,
  type AdminUser,
  type AnalyticsHourPoint,
  type WalletTransfer,
} from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";
import { cn } from "@/lib/utils";

type UsersPayload = [AdminUserAudience, AdminUser[], AdminRiskUser[]];
type DetailTab = "bets" | "transfers" | "activity";

const SORT_OPTIONS: { id: AdminUserSort; label: string }[] = [
  { id: "last_login", label: "Последний вход" },
  { id: "balance", label: "Баланс" },
  { id: "stake", label: "Стейк" },
  { id: "bets", label: "Игры" },
  { id: "created", label: "Новые" },
];

const PERIOD_OPTIONS: { id: AdminUserPeriod; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "all", label: "Всё время" },
];

function displayName(user: AdminUser) {
  return user.first_name || user.username || `id ${user.telegram_id}`;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatShortWhen(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
}

function truncateMiddle(value: string, head = 6, tail = 4) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function betNet(bet: AdminUserBetItem) {
  return bet.payout_nanoton - bet.amount_nanoton;
}

function statusTone(status: string) {
  if (status === "won" || status === "cashed_out" || status === "completed" || status === "approved") {
    return "text-emerald-400";
  }
  if (status === "lost" || status === "failed" || status === "rejected" || status === "expired") {
    return "text-red-300";
  }
  if (status === "pending" || status === "pending_review" || status === "queued") {
    return "text-amber-300";
  }
  return "text-muted";
}

export default function UsersSection() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminUserSort>("last_login");
  const [minReferralsInput, setMinReferralsInput] = useState("");
  const [minReferrals, setMinReferrals] = useState(0);
  const [audience, setAudience] = useState<AdminUserAudience | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [riskUsers, setRiskUsers] = useState<AdminRiskUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [analytics, setAnalytics] = useState<AdminUserAnalytics | null>(null);
  const [bets, setBets] = useState<AdminUserBetsResponse | null>(null);
  const [transfers, setTransfers] = useState<AdminUserTransfersResponse | null>(null);
  const [betsPeriod, setBetsPeriod] = useState<AdminUserPeriod>("7d");
  const [transfersPeriod, setTransfersPeriod] = useState<AdminUserPeriod>("7d");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("bets");
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [withdrawHoldBusy, setWithdrawHoldBusy] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(0);
  const [balanceReason, setBalanceReason] = useState("");
  const [balanceBusy, setBalanceBusy] = useState(false);

  const riskIds = useMemo(() => new Set(riskUsers.map((user) => user.user_id)), [riskUsers]);
  const riskById = useMemo(() => {
    const map = new Map<string, AdminRiskUser>();
    for (const row of riskUsers) map.set(row.user_id, row);
    return map;
  }, [riskUsers]);

  function parseMinReferrals(raw: string) {
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
  }

  async function load(search = query, nextSort = sort, nextMinReferrals = minReferrals) {
    setLoading(true);
    try {
      const cacheKey = `admin:users:v10:${nextSort}:${nextMinReferrals}:${search.trim().toLowerCase() || "default"}`;
      const [audienceData, userData, riskData] = await loadCached(cacheKey, () =>
        Promise.all([
          getAdminUserAudience(),
          getAdminUsers(search, nextSort, nextMinReferrals),
          getAdminRiskUsers(),
        ]),
      );
      setAudience(audienceData);
      setUsers(userData);
      setRiskUsers(riskData);
      primeCache(cacheKey, [audienceData, userData, riskData] satisfies UsersPayload);
    } finally {
      setLoading(false);
    }
  }

  async function searchUsers() {
    const nextMin = parseMinReferrals(minReferralsInput);
    setMinReferrals(nextMin);
    setMinReferralsInput(nextMin > 0 ? String(nextMin) : "");
    await load(query, sort, nextMin);
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<UsersPayload>("admin:users:v10:last_login:0:default");
      if (cached) {
        setAudience(cached[0]);
        setUsers(cached[1]);
        setRiskUsers(cached[2]);
      }
      load().catch(() => {});
    });
  }, []);

  async function loadUserBets(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserBets(userId, period);
    setBets(data);
  }

  async function loadUserTransfers(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserTransfers(userId, period);
    setTransfers(data);
  }

  async function loadUserAnalytics(user: AdminUser, sessionId?: string | null) {
    const analyticsData = await getAdminUserAnalytics(user.id, 80, sessionId || undefined);
    setAnalytics(analyticsData);
    setSelectedSessionId(sessionId ?? null);
  }

  async function selectUser(user: AdminUser) {
    setSelected(user);
    setSelectedSessionId(null);
    setDetailTab("bets");
    setBetsPeriod("7d");
    setTransfersPeriod("7d");
    setBets(null);
    setTransfers(null);
    setAnalytics(null);
    setBanReason("");
    setBalanceDraft(user.betting_balance ?? 0);
    setBalanceReason("");
    setDetailLoading(true);
    try {
      await Promise.all([
        loadUserAnalytics(user, null),
        loadUserBets(user.id, "7d"),
        loadUserTransfers(user.id, "7d"),
      ]);
    } finally {
      setDetailLoading(false);
    }
  }

  async function selectSession(sessionId: string | null) {
    if (!selected) return;
    setDetailLoading(true);
    try {
      await loadUserAnalytics(selected, sessionId);
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeSort(next: AdminUserSort) {
    setSort(next);
    await load(query, next, minReferrals);
  }

  async function clearMinReferralsFilter() {
    setMinReferrals(0);
    setMinReferralsInput("");
    await load(query, sort, 0);
  }

  async function changeBetsPeriod(period: AdminUserPeriod) {
    if (!selected) return;
    setBetsPeriod(period);
    try {
      await loadUserBets(selected.id, period);
    } catch {
      /* ignore */
    }
  }

  async function changeTransfersPeriod(period: AdminUserPeriod) {
    if (!selected) return;
    setTransfersPeriod(period);
    try {
      await loadUserTransfers(selected.id, period);
    } catch {
      /* ignore */
    }
  }

  async function copyText(label: string, value?: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast({ variant: "success", title: `${label} скопирован` });
    } catch {
      showToast({ variant: "error", title: "Не удалось скопировать" });
    }
  }

  async function toggleBan(banned: boolean) {
    if (!selected || banBusy) return;
    setBanBusy(true);
    try {
      await setAdminUserBanned(selected.id, banned, banReason);
      const next = { ...selected, is_banned: banned };
      setSelected(next);
      setUsers((prev) => prev.map((u) => (u.id === next.id ? { ...u, is_banned: banned } : u)));
      setBanReason("");
      showToast({
        variant: "success",
        title: banned ? "Игрок заблокирован" : "Игрок разблокирован",
      });
      await load().catch(() => {});
    } catch (err) {
      showToast({
        variant: "error",
        title: formatUserError(err, "Не удалось изменить блокировку"),
      });
    } finally {
      setBanBusy(false);
    }
  }

  async function toggleWithdrawHold(disabled: boolean) {
    if (!selected || withdrawHoldBusy) return;
    setWithdrawHoldBusy(true);
    try {
      await setAdminUserWithdrawalsDisabled(selected.id, disabled, banReason);
      const next = { ...selected, withdrawals_disabled: disabled };
      setSelected(next);
      setUsers((prev) =>
        prev.map((u) => (u.id === next.id ? { ...u, withdrawals_disabled: disabled } : u)),
      );
      showToast({
        variant: "success",
        title: disabled ? "Выводы игрока отключены (тихо)" : "Выводы игрока включены",
      });
      await load().catch(() => {});
    } catch (err) {
      showToast({
        variant: "error",
        title: formatUserError(err, "Не удалось изменить холд выводов"),
      });
    } finally {
      setWithdrawHoldBusy(false);
    }
  }

  async function applyBalance() {
    if (!selected || balanceBusy) return;
    const nextBalance = Math.max(0, Math.round(balanceDraft));
    const previous = selected.betting_balance ?? 0;
    if (nextBalance === previous) {
      showToast({ variant: "error", title: "Баланс не изменился" });
      return;
    }
    const reason = balanceReason.trim();
    if (!reason) {
      showToast({ variant: "error", title: "Укажите причину изменения баланса" });
      return;
    }
    const name = displayName(selected);
    const delta = nextBalance - previous;
    const deltaLabel = `${delta >= 0 ? "+" : ""}${formatTON(delta)} TON`;
    const firstConfirm = window.confirm(
      `Изменить баланс ${name}?\n\n` +
        `Было: ${formatTON(previous)} TON\n` +
        `Станет: ${formatTON(nextBalance)} TON (${deltaLabel})\n` +
        `Причина: ${reason}`,
    );
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(
      "Второе подтверждение: баланс будет изменён с записью в ledger и audit. Продолжить?",
    );
    if (!secondConfirm) return;

    setBalanceBusy(true);
    try {
      const result = await setAdminUserBalance(selected.id, nextBalance, reason);
      const next = { ...selected, betting_balance: result.betting_balance };
      setSelected(next);
      setUsers((prev) =>
        prev.map((u) => (u.id === next.id ? { ...u, betting_balance: result.betting_balance } : u)),
      );
      setBalanceDraft(result.betting_balance);
      setBalanceReason("");
      showToast({
        variant: "success",
        title: `Баланс обновлён: ${formatTON(result.betting_balance)} TON`,
      });
      await load().catch(() => {});
    } catch (err) {
      showToast({
        variant: "error",
        title: formatUserError(err, "Не удалось изменить баланс"),
      });
    } finally {
      setBalanceBusy(false);
    }
  }

  return (
    <AdminPage title="Пользователи" description="Поиск, сортировка и карточка игрока.">
      <AdminToolbar>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchUsers().catch(() => {});
          }}
          className="input-field h-8 min-w-[180px] flex-1"
          placeholder="Имя, username или Telegram ID"
        />
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={minReferralsInput}
          onChange={(e) => setMinReferralsInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchUsers().catch(() => {});
          }}
          className="input-field h-8 w-[7.5rem]"
          placeholder="От N реф."
          title="Минимум приглашённых рефералов"
        />
        <AdminChip onClick={() => searchUsers().catch(() => {})}>
          {loading ? "…" : "Найти"}
        </AdminChip>
        {minReferrals > 0 ? (
          <AdminChip active onClick={() => clearMinReferralsFilter().catch(() => {})}>
            Реф. ≥ {minReferrals} ×
          </AdminChip>
        ) : null}
      </AdminToolbar>

      <AdminToolbar>
        {SORT_OPTIONS.map((option) => (
          <AdminChip
            key={option.id}
            active={sort === option.id}
            onClick={() => changeSort(option.id).catch(() => {})}
          >
            {option.label}
          </AdminChip>
        ))}
      </AdminToolbar>

      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <AdminMetric label="Всего" value={audience ? String(audience.total_users) : "—"} accent />
        <AdminMetric
          label="Активны 24ч / 7д"
          value={audience ? `${audience.active_users_24h} / ${audience.active_users_7d}` : "—"}
        />
        <AdminMetric
          label="В стейкинге"
          value={audience ? String(audience.with_staking) : "—"}
          hint={audience ? `TVL ${formatTON(audience.staking_tvl_nanoton)} TON` : undefined}
          accent
        />
        <AdminMetric
          label="Риск / бан"
          value={
            audience ? `${riskUsers.length} / ${audience.banned_users}` : String(riskUsers.length)
          }
        />
      </section>

      <button
        type="button"
        className="text-xs text-muted hover:text-foreground"
        onClick={() => setShowMoreStats((v) => !v)}
      >
        {showMoreStats ? "Скрыть метрики" : "Ещё метрики и рефереры"}
      </button>

      {showMoreStats ? (
        <div className="space-y-3">
          <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <AdminMetric
              label="Сегодня"
              value={audience ? String(audience.new_users_today) : "—"}
              hint={audience ? `реф. ${audience.referred_today}` : undefined}
            />
            <AdminMetric
              label="За 7 дней"
              value={audience ? String(audience.new_users_7d) : "—"}
              hint={audience ? `реф. ${audience.referred_7d}` : undefined}
            />
            <AdminMetric
              label="Реф / органика"
              value={audience ? `${audience.referred_users} / ${audience.organic_users}` : "—"}
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
              label="Выплата / день"
              value={audience ? `${formatTON(audience.staking_daily_yield_nanoton)} TON` : "—"}
            />
            <AdminMetric
              label="Выплата / неделю"
              value={audience ? `${formatTON(audience.staking_weekly_yield_nanoton)} TON` : "—"}
            />
            <AdminMetric
              label="Выплачено за эпоху"
              value={audience ? `${formatTON(audience.staking_accrued_yield_nanoton)} TON` : "—"}
            />
            <AdminMetric label="С кошельком" value={audience ? String(audience.with_wallet) : "—"} />
          </section>

          <AdminPanel title="Топ реф.ссылок">
            {(audience?.top_referrers?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">Пока нет приходов по реф.ссылкам.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-auto">
                {audience!.top_referrers.map((ref) => {
                  const name = ref.first_name || ref.username || `TG ${ref.telegram_id}`;
                  return (
                    <div
                      key={ref.user_id}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-raised/40 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {name}
                          {ref.username ? (
                            <span className="ml-1.5 font-normal text-muted">@{ref.username}</span>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {ref.referral_code || "ref_…"} · TG {ref.telegram_id}
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
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <AdminPanel title="Список" description={`${users.length} в выдаче`}>
          {users.length === 0 && loading ? (
            <p className="text-sm text-muted">Загрузка…</p>
          ) : users.length === 0 ? (
            <AdminEmpty>Пользователи не найдены.</AdminEmpty>
          ) : (
            <div className="max-h-[36rem] space-y-1 overflow-auto">
              {users.map((user) => {
                const risky = riskIds.has(user.id);
                const stake = user.staking_principal_nanoton || 0;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user).catch(() => {})}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                      selected?.id === user.id
                        ? "bg-accent/15 ring-1 ring-accent/30"
                        : "bg-surface-raised/40 hover:bg-surface-raised/70",
                    )}
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
                          {formatShortWhen(user.last_login_at)}
                          {(user.referral_count ?? 0) > 0
                            ? ` · ${user.referral_count} реф.`
                            : ""}
                          {user.is_banned ? " · ban" : ""}
                          {user.withdrawals_disabled ? " · no-withdraw" : ""}
                          {risky ? " · risk" : ""}
                          {user.staking_tier === "boost" ? " · boost" : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs tabular-nums">
                        <p className="font-medium">{formatTON(user.betting_balance)} TON</p>
                        <p className={stake > 0 ? "text-accent" : "text-muted"}>
                          stake {formatTON(stake)}
                        </p>
                        <p className="text-muted">{user.bets_count ?? 0} игр</p>
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
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <AdminChip active={(selected.referral_count ?? 0) > 0}>
                  Рефералы: {selected.referral_count ?? 0}
                </AdminChip>
              </div>
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
                      ? `${selected.active_stakes} акт. · ${selected.staking_tier || "base"}`
                      : selected.staking_tier || "base"
                  }
                  accent
                />
                <AdminMetric label="Игр" value={String(selected.bets_count ?? 0)} />
                <AdminMetric
                  label="Приглашено"
                  value={String(selected.referral_count ?? 0)}
                  hint="Рефералы по ссылке"
                  accent={(selected.referral_count ?? 0) > 0}
                />
                <AdminMetric label="Последний вход" value={formatShortWhen(selected.last_login_at)} />
              </div>

              <div className="mt-2.5 flex items-center gap-2 rounded-md bg-surface-raised/40 px-2.5 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted">Кошелёк</p>
                  <p className="truncate font-mono text-xs">
                    {selected.ton_wallet ? truncateMiddle(selected.ton_wallet, 10, 6) : "не привязан"}
                  </p>
                </div>
                {selected.ton_wallet ? (
                  <AdminChip onClick={() => copyText("Кошелёк", selected.ton_wallet).catch(() => {})}>
                    Копировать
                  </AdminChip>
                ) : null}
              </div>

              <div className="mt-2.5 space-y-2 rounded-md border border-border/70 px-2.5 py-2">
                <p className="text-[11px] text-muted">
                  Новый баланс (абсолютное значение). Перед сохранением потребуется два подтверждения.
                </p>
                <AdminTonField
                  label="Баланс, TON"
                  valueNanoton={balanceDraft}
                  onChangeNanoton={setBalanceDraft}
                  hint={`Сейчас: ${formatTON(selected.betting_balance)} TON`}
                />
                <input
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                  className="input-field"
                  placeholder="Причина (обязательно)"
                />
                <AdminToolbar>
                  <AdminButton
                    variant="danger"
                    disabled={
                      balanceBusy || Math.round(balanceDraft) === (selected.betting_balance ?? 0)
                    }
                    onClick={() => {
                      applyBalance().catch(() => {});
                    }}
                  >
                    Изменить баланс
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    disabled={balanceBusy}
                    onClick={() => {
                      setBalanceDraft(selected.betting_balance ?? 0);
                      setBalanceReason("");
                    }}
                  >
                    Сбросить
                  </AdminButton>
                </AdminToolbar>
              </div>

              {(selected.is_banned ||
                selected.withdrawals_disabled ||
                (selected.risk_flags?.length ?? 0) > 0 ||
                riskById.has(selected.id)) && (
                <div className="mt-2 rounded-md bg-danger/10 px-2.5 py-2 text-xs text-danger">
                  {[
                    selected.is_banned ? "ban" : null,
                    selected.withdrawals_disabled ? "withdrawals held" : null,
                    ...(selected.risk_flags || []),
                    riskById.has(selected.id) ? "в мониторинге" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              <div className="mt-2.5 space-y-2 rounded-md border border-border/70 px-2.5 py-2">
                <p className="text-[11px] text-muted">
                  {selected.is_banned
                    ? "Игрок заблокирован — вход и действия в приложении недоступны."
                    : "Блокировка отключает вход и все действия в приложении."}
                </p>
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="input-field"
                  placeholder="Причина (для аудита)"
                />
                <AdminToolbar>
                  {selected.is_banned ? (
                    <AdminButton
                      variant="secondary"
                      disabled={banBusy}
                      onClick={() => {
                        toggleBan(false).catch(() => {});
                      }}
                    >
                      Разблокировать
                    </AdminButton>
                  ) : (
                    <AdminButton
                      variant="danger"
                      disabled={banBusy}
                      onClick={() => {
                        toggleBan(true).catch(() => {});
                      }}
                    >
                      Заблокировать
                    </AdminButton>
                  )}
                </AdminToolbar>
              </div>

              <div className="mt-2.5 space-y-2 rounded-md border border-border/70 px-2.5 py-2">
                <p className="text-[11px] text-muted">
                  Тихий холд: выводы TON и подарков уходят «в ожидание», игрок не видит блокировку.
                </p>
                <AdminToolbar>
                  {selected.withdrawals_disabled ? (
                    <AdminButton
                      variant="secondary"
                      disabled={withdrawHoldBusy}
                      onClick={() => {
                        toggleWithdrawHold(false).catch(() => {});
                      }}
                    >
                      Включить выводы
                    </AdminButton>
                  ) : (
                    <AdminButton
                      variant="danger"
                      disabled={withdrawHoldBusy}
                      onClick={() => {
                        toggleWithdrawHold(true).catch(() => {});
                      }}
                    >
                      Отключить выводы
                    </AdminButton>
                  )}
                </AdminToolbar>
              </div>

              <AdminToolbar className="mt-3">
                {(
                  [
                    { id: "bets" as const, label: "Ставки" },
                    { id: "transfers" as const, label: "Переводы" },
                    { id: "activity" as const, label: "Активность" },
                  ] as const
                ).map((tab) => (
                  <AdminChip
                    key={tab.id}
                    active={detailTab === tab.id}
                    onClick={() => setDetailTab(tab.id)}
                  >
                    {tab.label}
                  </AdminChip>
                ))}
              </AdminToolbar>

              {detailTab === "bets" ? (
                <BetsPanel
                  bets={bets}
                  period={betsPeriod}
                  loading={detailLoading && !bets}
                  onPeriod={changeBetsPeriod}
                />
              ) : null}

              {detailTab === "transfers" ? (
                <TransfersPanel
                  transfers={transfers}
                  period={transfersPeriod}
                  loading={detailLoading && !transfers}
                  onPeriod={changeTransfersPeriod}
                  onCopyTx={(hash) => copyText("Tx hash", hash)}
                />
              ) : null}

              {detailTab === "activity" ? (
                <ActivityPanel
                  analytics={analytics}
                  selected={selected}
                  selectedSessionId={selectedSessionId}
                  detailLoading={detailLoading}
                  onSelectSession={(id) => selectSession(id).catch(() => {})}
                />
              ) : null}
            </AdminPanel>
          </div>
        ) : (
          <AdminPanel title="Карточка игрока">
            <p className="text-sm text-muted">Выберите пользователя слева.</p>
          </AdminPanel>
        )}
      </div>
    </AdminPage>
  );
}

function PeriodChips({
  period,
  onPeriod,
}: {
  period: AdminUserPeriod;
  onPeriod: (period: AdminUserPeriod) => void;
}) {
  return (
    <AdminToolbar>
      {PERIOD_OPTIONS.map((option) => (
        <AdminChip
          key={option.id}
          active={period === option.id}
          onClick={() => onPeriod(option.id)}
        >
          {option.label}
        </AdminChip>
      ))}
    </AdminToolbar>
  );
}

function BetsPanel({
  bets,
  period,
  loading,
  onPeriod,
}: {
  bets: AdminUserBetsResponse | null;
  period: AdminUserPeriod;
  loading: boolean;
  onPeriod: (period: AdminUserPeriod) => void;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      <PeriodChips period={period} onPeriod={(p) => onPeriod(p)} />
      {loading ? (
        <p className="text-sm text-muted">Загружаем ставки…</p>
      ) : !bets ? (
        <p className="text-sm text-muted">Нет данных.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AdminMetric label="Ставок" value={String(bets.summary.bets)} />
            <AdminMetric
              label="W / L"
              value={`${bets.summary.won} / ${bets.summary.lost}`}
            />
            <AdminMetric label="Оборот" value={`${formatTON(bets.summary.volume_nanoton)} TON`} />
            <AdminMetric
              label="Net"
              value={`${bets.summary.net_nanoton >= 0 ? "+" : ""}${formatTON(bets.summary.net_nanoton)} TON`}
              accent={bets.summary.net_nanoton >= 0}
            />
          </div>
          {bets.items.length === 0 ? (
            <AdminEmpty>Нет ставок за период.</AdminEmpty>
          ) : (
            <div className="max-h-[28rem] space-y-1 overflow-auto">
              {bets.items.map((bet) => {
                const net = betNet(bet);
                return (
                  <div
                    key={bet.id}
                    className="rounded-md bg-surface-raised/40 px-2.5 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span className="uppercase">{bet.game_type}</span>
                          <span className="text-muted"> · {bet.selection_label}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {formatShortWhen(bet.created_at)} · {formatTON(bet.amount_nanoton)} →{" "}
                          {formatTON(bet.payout_nanoton)}
                          {bet.funding_type && bet.funding_type !== "balance"
                            ? ` · ${bet.funding_type}`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs tabular-nums">
                        <p className={cn("font-semibold", net >= 0 ? "text-emerald-400" : "text-red-300")}>
                          {net >= 0 ? "+" : ""}
                          {formatTON(net)} TON
                        </p>
                        <p className={statusTone(bet.status)}>{bet.status}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TransfersPanel({
  transfers,
  period,
  loading,
  onPeriod,
  onCopyTx,
}: {
  transfers: AdminUserTransfersResponse | null;
  period: AdminUserPeriod;
  loading: boolean;
  onPeriod: (period: AdminUserPeriod) => void;
  onCopyTx: (hash: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      <PeriodChips period={period} onPeriod={(p) => onPeriod(p)} />
      {loading ? (
        <p className="text-sm text-muted">Загружаем переводы…</p>
      ) : !transfers ? (
        <p className="text-sm text-muted">Нет данных.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AdminMetric
              label="Депозиты"
              value={`${transfers.summary.deposits} · ${formatTON(transfers.summary.deposit_volume_nanoton)}`}
            />
            <AdminMetric
              label="Выводы"
              value={`${transfers.summary.withdrawals} · ${formatTON(transfers.summary.withdrawal_volume_nanoton)}`}
            />
            <AdminMetric label="Ошибки" value={String(transfers.summary.failed)} />
          </div>
          {transfers.items.length === 0 ? (
            <AdminEmpty>Нет переводов за период.</AdminEmpty>
          ) : (
            <div className="max-h-[28rem] space-y-1 overflow-auto">
              {transfers.items.map((tx) => (
                <TransferRow key={tx.id} tx={tx} onCopyTx={onCopyTx} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TransferRow({
  tx,
  onCopyTx,
}: {
  tx: WalletTransfer;
  onCopyTx: (hash: string) => void;
}) {
  const isDeposit = tx.direction === "deposit";
  const amount = isDeposit ? tx.amount_nanoton : -tx.net_nanoton;
  const isError =
    tx.status === "failed" || tx.status === "rejected" || tx.status === "expired";
  return (
    <div
      className={cn(
        "rounded-md px-2.5 py-2 text-sm",
        isError ? "bg-danger/10" : "bg-surface-raised/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {tx.direction}
            <span className={cn("ml-1.5 text-xs", statusTone(tx.status))}>{tx.status}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{formatShortWhen(tx.created_at)}</p>
          {tx.error_message ? (
            <p className="mt-1 text-[11px] text-red-300">error: {tx.error_message}</p>
          ) : null}
          {tx.review_reason ? (
            <p className="mt-1 text-[11px] text-amber-300">review: {tx.review_reason}</p>
          ) : null}
          {(tx.risk_flags?.length ?? 0) > 0 ? (
            <p className="mt-1 text-[11px] text-muted">risk: {tx.risk_flags!.join(", ")}</p>
          ) : null}
          {tx.tx_hash ? (
            <button
              type="button"
              className="mt-1 font-mono text-[11px] text-accent"
              onClick={() => onCopyTx(tx.tx_hash!)}
            >
              tx {truncateMiddle(tx.tx_hash, 8, 6)}
            </button>
          ) : null}
        </div>
        <p
          className={cn(
            "shrink-0 text-xs font-semibold tabular-nums",
            amount >= 0 ? "text-emerald-400" : "text-red-300",
          )}
        >
          {amount >= 0 ? "+" : ""}
          {formatTON(amount)} TON
        </p>
      </div>
    </div>
  );
}

function ActivityPanel({
  analytics,
  selected,
  selectedSessionId,
  detailLoading,
  onSelectSession,
}: {
  analytics: AdminUserAnalytics | null;
  selected: AdminUser;
  selectedSessionId: string | null;
  detailLoading: boolean;
  onSelectSession: (sessionId: string | null) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-surface-raised/40 px-2.5 py-2">
          <p className="text-[11px] text-muted">Откуда пришёл</p>
          {selected.came_via_referral ? (
            <>
              <p className="mt-0.5 font-medium">Реф.ссылка</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {selected.referrer_first_name || selected.referrer_username || "реферер"}
                {selected.referrer_code ? ` · ${selected.referrer_code}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-0.5 font-medium">Органика</p>
          )}
        </div>
        <div className="rounded-md bg-surface-raised/40 px-2.5 py-2">
          <p className="text-[11px] text-muted">Регистрация</p>
          <p className="mt-0.5 font-medium">{formatWhen(selected.created_at)}</p>
        </div>
      </div>

      {detailLoading && !analytics ? (
        <p className="text-sm text-muted">Загружаем аналитику…</p>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AdminMetric label="Сегодня" value={String(analytics.sessions_today ?? 0)} accent />
            <AdminMetric label="7 дней" value={String(analytics.sessions_7d ?? 0)} />
            <AdminMetric label="Всего" value={String(analytics.sessions_total ?? 0)} />
            <AdminMetric label="Акт. дни" value={String(analytics.active_days_7d ?? 0)} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-surface-raised/40 px-2.5 py-2">
              <p className="text-[11px] text-muted">Источник</p>
              <p className="mt-0.5 font-medium">
                {humanizeAnalyticsSource(
                  analytics.acquisition_source || analytics.acquisition_label,
                )}
              </p>
            </div>
            <div className="rounded-md bg-surface-raised/40 px-2.5 py-2">
              <p className="text-[11px] text-muted">Последняя активность</p>
              <p className="mt-0.5 font-medium">{formatWhen(analytics.last_seen_at)}</p>
            </div>
          </div>
          {(analytics.visits_by_hour?.some((p) => p.count > 0) ?? false) ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Часы заходов (MSK)</p>
              <UserHourBars points={analytics.visits_by_hour ?? []} />
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Действия</p>
            <AdminRankList
              items={analytics.top_actions}
              emptyText="Нет данных."
              formatName={humanizeAnalyticsName}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Режимы</p>
            <AdminRankList
              items={analytics.favorite_modes}
              emptyText="Пока нет."
              formatName={humanizeAnalyticsName}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Ошибки (текст)</p>
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
            onSelect={onSelectSession}
          />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">Лента</p>
              {selectedSessionId ? (
                <button
                  type="button"
                  className="text-xs text-accent"
                  onClick={() => onSelectSession(null)}
                >
                  Все сессии
                </button>
              ) : null}
            </div>
            {analytics.timeline?.length ? (
              <div className="max-h-56 space-y-1 overflow-auto text-xs">
                {analytics.timeline.map((event) => (
                  <div key={event.id} className="rounded-md bg-surface-raised/40 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{humanizeAnalyticsName(event.event_name)}</span>
                      <span className="text-muted">{formatShortWhen(event.occurred_at)}</span>
                    </div>
                    <p className="mt-0.5 text-muted">
                      {humanizeAnalyticsName(event.screen || event.path || event.source)}
                      {event.status ? ` · ${humanizeAnalyticsStatus(event.status)}` : ""}
                      {event.error_code ? ` · ${humanizeAnalyticsName(event.error_code)}` : ""}
                    </p>
                    {event.error_message ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-red-300/90">
                        {event.error_message}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Лента пуста.</p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Аналитики пока нет.</p>
      )}
    </div>
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
        <div className="max-h-52 space-y-1 overflow-auto">
          {sessions.map((session) => {
            const active = activeSessionId === session.session_id;
            return (
              <button
                key={session.session_id}
                type="button"
                onClick={() => onSelect(session.session_id)}
                className={cn(
                  "w-full rounded-md px-2.5 py-2 text-left text-xs",
                  active ? "bg-accent/15 ring-1 ring-accent/30" : "bg-surface-raised/40",
                )}
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
