"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  getAdminUserLedger,
  getAdminUserInventory,
  getAdminUserCaseOpens,
  getAdminRiskUsers,
  getAdminUsers,
  setAdminUserBalance,
  setAdminUserBanned,
  setAdminUserWithdrawalsDisabled,
  resetAdminDailyQuestClaims,
  type AdminUserAnalytics,
  type AdminUserAudience,
  type AdminUserBetItem,
  type AdminUserBetsResponse,
  type AdminUserPeriod,
  type AdminUserSession,
  type AdminUserSort,
  type AdminUserTransfersResponse,
  type AdminUserLedgerResponse,
  type AdminUserInventoryResponse,
  type AdminUserCaseOpensResponse,
  type AdminUserCaseOpenItem,
  type AdminRiskUser,
  type AdminUser,
  type AnalyticsHourPoint,
  type WalletTransfer,
} from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";
import { cn } from "@/lib/utils";

type UsersPayload = [AdminUserAudience, AdminUser[], AdminRiskUser[]];
type DetailTab = "bets" | "transfers" | "ledger" | "gifts" | "cases" | "activity";

const USERS_CACHE_PREFIX = "admin:users:v11";
const SEARCH_DEBOUNCE_MS = 280;

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

function userInitials(user: AdminUser) {
  const name = displayName(user).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function StatusBadge({
  tone = "muted",
  children,
}: {
  tone?: "danger" | "warn" | "ok" | "accent" | "muted" | "info";
  children: ReactNode;
}) {
  return <span className={cn("admin-user-badge", `admin-user-badge--${tone}`)}>{children}</span>;
}

function UserStatusBadges({
  user,
  risky,
  compact,
}: {
  user: AdminUser;
  risky?: boolean;
  compact?: boolean;
}) {
  const badges: { tone: "danger" | "warn" | "ok" | "accent" | "muted" | "info"; label: string }[] =
    [];
  if (user.is_banned) badges.push({ tone: "danger", label: "Бан" });
  if (user.withdrawals_disabled) badges.push({ tone: "warn", label: "Холд выводов" });
  if (risky) badges.push({ tone: "warn", label: "Риск" });
  if (user.staking_tier === "boost") badges.push({ tone: "accent", label: "Boost" });
  if ((user.referral_count ?? 0) > 0 && !compact) {
    badges.push({ tone: "info", label: `${user.referral_count} реф.` });
  }
  if (badges.length === 0) return null;
  return (
    <span className="admin-user-badges">
      {badges.map((b) => (
        <StatusBadge key={b.label} tone={b.tone}>
          {b.label}
        </StatusBadge>
      ))}
    </span>
  );
}

function CopyChip({
  label,
  value,
  onCopy,
}: {
  label: string;
  value?: string | null;
  onCopy: (label: string, value?: string | null) => void;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      className="admin-user-copy"
      title={`Скопировать ${label}`}
      onClick={() => onCopy(label, value)}
    >
      {label}
    </button>
  );
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
  const [ledger, setLedger] = useState<AdminUserLedgerResponse | null>(null);
  const [inventory, setInventory] = useState<AdminUserInventoryResponse | null>(null);
  const [caseOpens, setCaseOpens] = useState<AdminUserCaseOpensResponse | null>(null);
  const [betsPeriod, setBetsPeriod] = useState<AdminUserPeriod>("7d");
  const [transfersPeriod, setTransfersPeriod] = useState<AdminUserPeriod>("7d");
  const [ledgerPeriod, setLedgerPeriod] = useState<AdminUserPeriod>("7d");
  const [casesPeriod, setCasesPeriod] = useState<AdminUserPeriod>("all");
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
  const [questResetBusy, setQuestResetBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(true);
  const searchGenRef = useRef(0);
  const searchBootstrappedRef = useRef(false);

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
    const gen = ++searchGenRef.current;
    setLoading(true);
    try {
      const trimmed = search.trim();
      const cacheKey = `${USERS_CACHE_PREFIX}:${nextSort}:${nextMinReferrals}:${trimmed.toLowerCase() || "default"}`;
      const fetcher = () =>
        Promise.all([
          getAdminUserAudience(),
          getAdminUsers(trimmed, nextSort, nextMinReferrals),
          getAdminRiskUsers(),
        ]);
      // Live search must be fresh; only cache the default browse list.
      const [audienceData, userData, riskData] = trimmed
        ? await fetcher()
        : await loadCached(cacheKey, fetcher);
      if (gen !== searchGenRef.current) return;
      setAudience(audienceData);
      setUsers(userData);
      setRiskUsers(riskData);
      if (!trimmed) {
        primeCache(cacheKey, [audienceData, userData, riskData] satisfies UsersPayload);
      }
    } finally {
      if (gen === searchGenRef.current) setLoading(false);
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
      const cached = readCached<UsersPayload>(`${USERS_CACHE_PREFIX}:last_login:0:default`);
      if (cached) {
        setAudience(cached[0]);
        setUsers(cached[1]);
        setRiskUsers(cached[2]);
      }
      load()
        .catch(() => {})
        .finally(() => {
          searchBootstrappedRef.current = true;
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap only
  }, []);

  useEffect(() => {
    if (!searchBootstrappedRef.current) return;
    const trimmed = query.trim();
    const timer = window.setTimeout(() => {
      void load(query, sort, minReferrals);
    }, trimmed ? SEARCH_DEBOUNCE_MS : 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce query typing only
  }, [query]);

  async function loadUserBets(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserBets(userId, period);
    setBets(data);
  }

  async function loadUserTransfers(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserTransfers(userId, period);
    setTransfers(data);
  }

  async function loadUserLedger(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserLedger(userId, period);
    setLedger(data);
  }

  async function loadUserInventory(userId: string) {
    const data = await getAdminUserInventory(userId);
    setInventory(data);
  }

  async function loadUserCaseOpens(userId: string, period: AdminUserPeriod) {
    const data = await getAdminUserCaseOpens(userId, period);
    setCaseOpens(data);
  }

  async function loadUserAnalytics(user: AdminUser, sessionId?: string | null) {
    const analyticsData = await getAdminUserAnalytics(user.id, 80, sessionId || undefined);
    setAnalytics(analyticsData);
    setSelectedSessionId(sessionId ?? null);
  }

  async function selectUser(user: AdminUser) {
    setSelected(user);
    setSelectedSessionId(null);
    setDetailTab("ledger");
    setBetsPeriod("7d");
    setTransfersPeriod("7d");
    setLedgerPeriod("7d");
    setCasesPeriod("all");
    setBets(null);
    setTransfers(null);
    setLedger(null);
    setInventory(null);
    setCaseOpens(null);
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
        loadUserLedger(user.id, "7d"),
        loadUserInventory(user.id),
        loadUserCaseOpens(user.id, "all"),
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

  async function changeLedgerPeriod(period: AdminUserPeriod) {
    if (!selected) return;
    setLedgerPeriod(period);
    try {
      await loadUserLedger(selected.id, period);
    } catch {
      /* ignore */
    }
  }

  async function changeCasesPeriod(period: AdminUserPeriod) {
    if (!selected) return;
    setCasesPeriod(period);
    try {
      await loadUserCaseOpens(selected.id, period);
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

  async function resetDailyQuests() {
    if (!selected || questResetBusy) return;
    const name = displayName(selected);
    if (
      !window.confirm(
        `Сбросить клеймы ежедневных заданий за сегодня (МСК) у ${name}? Уже выданные TON и подарки не забираются.`,
      )
    ) {
      return;
    }
    setQuestResetBusy(true);
    try {
      const result = await resetAdminDailyQuestClaims({ user_id: selected.id });
      showToast({
        variant: "success",
        title:
          result.deleted_claims > 0
            ? `Сброшены прогресс и клеймы (${result.deleted_claims})`
            : "Прогресс сброшен (клеймов за сегодня не было)",
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: formatUserError(err, "Не удалось сбросить задания"),
      });
    } finally {
      setQuestResetBusy(false);
    }
  }

  return (
    <AdminPage title="Пользователи" description="Поиск, сортировка и карточка игрока.">
      <AdminToolbar>
        <div className="relative min-w-[220px] flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchUsers().catch(() => {});
              if (e.key === "Escape" && query) setQuery("");
            }}
            className="input-field h-9 w-full pr-16"
            placeholder="Имя, @username, Telegram ID или UUID"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
            {query ? (
              <button
                type="button"
                className="rounded px-1.5 text-[11px] text-muted hover:text-foreground"
                onClick={() => setQuery("")}
              >
                Очистить
              </button>
            ) : null}
          </div>
        </div>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={minReferralsInput}
          onChange={(e) => setMinReferralsInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchUsers().catch(() => {});
          }}
          className="input-field h-9 w-[7.5rem]"
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
                  ? formatTON(audience.balances_nanoton)
                  : undefined
              }
            />
            <AdminMetric
              label="Выплата / сутки"
              value={audience ? `${formatTON(audience.staking_daily_yield_nanoton)} TON` : "—"}
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

      <div className={cn("admin-users-layout", selected && "admin-users-layout--split")}>
        <section className="admin-users-list">
          <div className="admin-users-list__head">
            <div>
              <h2 className="admin-users-list__title">Список</h2>
              <p className="admin-users-list__meta">
                {query.trim()
                  ? `${users.length} найдено · «${query.trim()}»`
                  : `${users.length} в выдаче`}
                {!selected ? " · выберите игрока" : ""}
              </p>
            </div>
            {loading ? <span className="admin-users-list__loading">Обновление…</span> : null}
          </div>

          {users.length === 0 && loading ? (
            <p className="px-1 py-6 text-sm text-muted">Загрузка…</p>
          ) : users.length === 0 ? (
            <AdminEmpty>
              {query.trim()
                ? "Никого не найдено. Попробуйте Telegram ID, @username или имя."
                : "Пользователи не найдены."}
            </AdminEmpty>
          ) : (
            <div className="admin-users-feed">
              {users.map((user) => {
                const risky = riskIds.has(user.id);
                const stake = user.staking_principal_nanoton || 0;
                const active = selected?.id === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user).catch(() => {})}
                    className={cn(
                      "admin-users-row",
                      active && "admin-users-row--active",
                      user.is_banned && "admin-users-row--banned",
                      risky && !user.is_banned && "admin-users-row--risk",
                    )}
                  >
                    <span className="admin-users-avatar" aria-hidden>
                      {userInitials(user)}
                    </span>
                    <div className="admin-users-row__main">
                      <div className="admin-users-row__top">
                        <span className="admin-users-row__name">{displayName(user)}</span>
                        {user.username ? (
                          <span className="admin-users-row__handle">@{user.username}</span>
                        ) : null}
                        <UserStatusBadges user={user} risky={risky} compact />
                      </div>
                      <p className="admin-users-row__sub">
                        TG {user.telegram_id}
                        <span className="admin-users-dot">·</span>
                        {formatShortWhen(user.last_login_at)}
                        {(user.referral_count ?? 0) > 0 ? (
                          <>
                            <span className="admin-users-dot">·</span>
                            {user.referral_count} реф.
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="admin-users-row__metrics">
                      <span className="admin-users-row__balance">
                        {formatTON(user.betting_balance)} TON
                      </span>
                      <span className={cn("admin-users-row__stake", stake > 0 && "is-active")}>
                        stake {formatTON(stake)}
                      </span>
                      <span className="admin-users-row__games">{user.bets_count ?? 0} игр</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected ? (
          <aside className="admin-users-detail-rail">
            <div className="admin-users-detail">
              <header className="admin-users-detail__head">
                <div className="admin-users-detail__identity">
                  <span
                    className={cn(
                      "admin-users-avatar admin-users-avatar--lg",
                      selected.is_banned && "admin-users-avatar--banned",
                    )}
                    aria-hidden
                  >
                    {userInitials(selected)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="admin-users-detail__name">{displayName(selected)}</h2>
                      <UserStatusBadges
                        user={selected}
                        risky={riskById.has(selected.id)}
                      />
                    </div>
                    <p className="admin-users-detail__sub">
                      {selected.username ? `@${selected.username}` : "без username"}
                      <span className="admin-users-dot">·</span>
                      TG {selected.telegram_id}
                    </p>
                    <div className="admin-users-detail__copies">
                      <CopyChip
                        label="TG ID"
                        value={String(selected.telegram_id)}
                        onCopy={(l, v) => copyText(l, v).catch(() => {})}
                      />
                      <CopyChip
                        label="UUID"
                        value={selected.id}
                        onCopy={(l, v) => copyText(l, v).catch(() => {})}
                      />
                      {selected.username ? (
                        <CopyChip
                          label="@username"
                          value={selected.username}
                          onCopy={(l, v) => copyText(l, v).catch(() => {})}
                        />
                      ) : null}
                      {selected.ton_wallet ? (
                        <CopyChip
                          label="Кошелёк"
                          value={selected.ton_wallet}
                          onCopy={(l, v) => copyText(l, v).catch(() => {})}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                {(selected.is_banned ||
                  selected.withdrawals_disabled ||
                  (selected.risk_flags?.length ?? 0) > 0 ||
                  riskById.has(selected.id)) && (
                  <div className="admin-users-alert">
                    {[
                      selected.is_banned ? "Заблокирован" : null,
                      selected.withdrawals_disabled ? "Выводы на холде" : null,
                      ...(selected.risk_flags || []),
                      riskById.has(selected.id) ? "В мониторинге риска" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </header>

              <div className="admin-users-stats">
                <div className="admin-users-stat admin-users-stat--accent">
                  <p className="admin-users-stat__label">Баланс</p>
                  <p className="admin-users-stat__value">
                    {formatTON(selected.betting_balance)}{" "}
                    <span className="admin-users-stat__unit">TON</span>
                  </p>
                </div>
                <div className="admin-users-stat">
                  <p className="admin-users-stat__label">Стейкинг</p>
                  <p className="admin-users-stat__value">
                    {formatTON(selected.staking_principal_nanoton || 0)}{" "}
                    <span className="admin-users-stat__unit">TON</span>
                  </p>
                  <p className="admin-users-stat__hint">
                    {selected.active_stakes
                      ? `${selected.active_stakes} акт. · ${selected.staking_tier || "base"}`
                      : selected.staking_tier || "base"}
                  </p>
                </div>
                <div className="admin-users-stat">
                  <p className="admin-users-stat__label">Игры</p>
                  <p className="admin-users-stat__value">{selected.bets_count ?? 0}</p>
                </div>
                <div className="admin-users-stat">
                  <p className="admin-users-stat__label">Рефералы</p>
                  <p className="admin-users-stat__value">{selected.referral_count ?? 0}</p>
                </div>
              </div>

              <div className="admin-users-meta-grid">
                <div className="admin-users-meta-card">
                  <p className="admin-users-stat__label">Последний вход</p>
                  <p className="admin-users-meta-card__value">
                    {formatShortWhen(selected.last_login_at)}
                  </p>
                  <p className="admin-users-stat__hint">{formatWhen(selected.last_login_at)}</p>
                </div>
                <div className="admin-users-meta-card">
                  <p className="admin-users-stat__label">Кошелёк</p>
                  {selected.ton_wallet ? (
                    <>
                      <p className="admin-users-meta-card__value font-mono text-xs">
                        {truncateMiddle(selected.ton_wallet, 10, 6)}
                      </p>
                      <p className="admin-users-stat__hint">Привязан</p>
                    </>
                  ) : (
                    <>
                      <p className="admin-users-meta-card__value text-muted">Не привязан</p>
                      <p className="admin-users-stat__hint">Нет TON-адреса</p>
                    </>
                  )}
                </div>
              </div>

              <section className="admin-users-actions">
                <button
                  type="button"
                  className="admin-users-actions__toggle"
                  onClick={() => setActionsOpen((v) => !v)}
                >
                  <span>Управление</span>
                  <span className="text-muted">{actionsOpen ? "Свернуть" : "Развернуть"}</span>
                </button>

                {actionsOpen ? (
                  <div className="admin-users-actions__body">
                    <div className="admin-users-action-card">
                      <div className="admin-users-action-card__head">
                        <p className="admin-users-action-card__title">Баланс</p>
                        <p className="admin-users-action-card__desc">
                          Абсолютное значение · два подтверждения
                        </p>
                      </div>
                      <AdminTonField
                        label="Новый баланс, TON"
                        valueNanoton={balanceDraft}
                        onChangeNanoton={setBalanceDraft}
                        hint={`Сейчас: ${formatTON(selected.betting_balance)} TON${
                          Math.round(balanceDraft) !== (selected.betting_balance ?? 0)
                            ? ` · Δ ${
                                Math.round(balanceDraft) - (selected.betting_balance ?? 0) >= 0
                                  ? "+"
                                  : ""
                              }${formatTON(
                                Math.round(balanceDraft) - (selected.betting_balance ?? 0),
                              )}`
                            : ""
                        }`}
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
                            balanceBusy ||
                            Math.round(balanceDraft) === (selected.betting_balance ?? 0)
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

                    <div className="admin-users-action-card">
                      <div className="admin-users-action-card__head">
                        <p className="admin-users-action-card__title">Задания дня</p>
                        <p className="admin-users-action-card__desc">
                          Сброс клеймов за сегодня (МСК). Баланс и инвентарь не трогаются.
                        </p>
                      </div>
                      <AdminButton
                        variant="secondary"
                        disabled={questResetBusy}
                        onClick={() => {
                          resetDailyQuests().catch(() => {});
                        }}
                      >
                        {questResetBusy ? "Сброс…" : "Сбросить задания дня"}
                      </AdminButton>
                    </div>

                    <div className="admin-users-action-card admin-users-action-card--moderation">
                      <div className="admin-users-action-card__head">
                        <p className="admin-users-action-card__title">Модерация</p>
                        <p className="admin-users-action-card__desc">
                          Бан отключает вход. Холд выводов — тихий: игрок видит «ожидание».
                        </p>
                      </div>
                      <input
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        className="input-field"
                        placeholder="Причина (для аудита)"
                      />
                      <div className="admin-users-moderation-row">
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
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="admin-users-tabs">
                {(
                  [
                    { id: "ledger" as const, label: "Движения" },
                    { id: "gifts" as const, label: "Подарки" },
                    {
                      id: "cases" as const,
                      label:
                        caseOpens && caseOpens.items.length > 0
                          ? `Кейсы (${caseOpens.items.length})`
                          : "Кейсы",
                    },
                    { id: "transfers" as const, label: "Переводы" },
                    { id: "bets" as const, label: "Ставки" },
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
              </div>

              <div className="admin-users-tab-body">
                {detailTab === "ledger" ? (
                  <LedgerPanel
                    ledger={ledger}
                    period={ledgerPeriod}
                    loading={detailLoading && !ledger}
                    onPeriod={changeLedgerPeriod}
                  />
                ) : null}

                {detailTab === "gifts" ? (
                  <GiftsPanel inventory={inventory} loading={detailLoading && !inventory} />
                ) : null}

                {detailTab === "cases" ? (
                  <CasesPanel
                    caseOpens={caseOpens}
                    period={casesPeriod}
                    loading={detailLoading && !caseOpens}
                    onPeriod={changeCasesPeriod}
                  />
                ) : null}

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
              </div>
            </div>
          </aside>
        ) : null}
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
            <div className="admin-users-scroll-list">
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

function LedgerPanel({
  ledger,
  period,
  loading,
  onPeriod,
}: {
  ledger: AdminUserLedgerResponse | null;
  period: AdminUserPeriod;
  loading: boolean;
  onPeriod: (period: AdminUserPeriod) => void;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      <PeriodChips period={period} onPeriod={onPeriod} />
      {loading ? (
        <p className="text-sm text-muted">Загружаем движения…</p>
      ) : !ledger ? (
        <p className="text-sm text-muted">Нет данных.</p>
      ) : ledger.items.length === 0 ? (
        <AdminEmpty>Нет движений по балансу за период.</AdminEmpty>
      ) : (
        <div className="admin-users-scroll-list">
          {ledger.items.map((row) => {
            const positive = row.amount_nanoton >= 0;
            return (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface-raised/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.type_label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.source_label}
                    {row.reference_type ? ` · ${row.reference_type}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{formatWhen(row.created_at)}</p>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  <p className={cn("font-semibold", positive ? "text-emerald-400" : "text-red-300")}>
                    {positive ? "+" : ""}
                    {formatTON(row.amount_nanoton)} TON
                  </p>
                  <p className="text-muted">→ {formatTON(row.balance_after)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GiftsPanel({
  inventory,
  loading,
}: {
  inventory: AdminUserInventoryResponse | null;
  loading: boolean;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      {loading ? (
        <p className="text-sm text-muted">Загружаем подарки…</p>
      ) : !inventory ? (
        <p className="text-sm text-muted">Нет данных.</p>
      ) : inventory.items.length === 0 ? (
        <AdminEmpty>У пользователя нет подарков в инвентаре.</AdminEmpty>
      ) : (
        <div className="admin-users-scroll-list">
          {inventory.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface-raised/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name || item.collection_slug || "Подарок"}
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.origin_label}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {item.status}
                  {item.case_slug ? ` · ${item.case_slug}` : ""}
                  {item.fulfillment ? ` · ${item.fulfillment}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{formatWhen(item.deposited_at)}</p>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums">
                <p className="font-semibold">{formatTON(item.floor_price_nanoton)} TON</p>
                {item.market_price_nanoton ? (
                  <p className="text-muted">маркет {formatTON(item.market_price_nanoton)}</p>
                ) : null}
                {item.cashout_nanoton ? (
                  <p className="text-muted">cashout {formatTON(item.cashout_nanoton)}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function caseOpenSourceLabel(source: string) {
  switch (source) {
    case "paid":
      return "платный";
    case "daily":
      return "ежедневный";
    case "free":
      return "бесплатный";
    case "promo":
      return "промо";
    default:
      return source || "—";
  }
}

function casePrizeTypeLabel(prizeType: string) {
  switch (prizeType) {
    case "ton":
      return "TON";
    case "gift":
      return "подарок";
    default:
      return prizeType || "приз";
  }
}

type CaseOpenSummaryRow = {
  key: string;
  title: string;
  slug: string;
  opens: number;
  paidOpens: number;
  paidNanoton: number;
  prizeNanoton: number;
};

function summarizeCaseOpens(items: AdminUserCaseOpenItem[]): CaseOpenSummaryRow[] {
  const map = new Map<string, CaseOpenSummaryRow>();
  for (const op of items) {
    const key = op.case_id || op.case_slug || op.case_title || "unknown";
    const cur = map.get(key) ?? {
      key,
      title: op.case_title || op.case_slug || "Кейс",
      slug: op.case_slug || "",
      opens: 0,
      paidOpens: 0,
      paidNanoton: 0,
      prizeNanoton: 0,
    };
    cur.opens += 1;
    if (op.source === "paid" || op.price_paid_nanoton > 0) {
      cur.paidOpens += 1;
      cur.paidNanoton += op.price_paid_nanoton;
    }
    cur.prizeNanoton += op.prize_nanoton;
    if (!cur.title && op.case_title) cur.title = op.case_title;
    if (!cur.slug && op.case_slug) cur.slug = op.case_slug;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.opens - a.opens || a.title.localeCompare(b.title));
}

function CasesPanel({
  caseOpens,
  period,
  loading,
  onPeriod,
}: {
  caseOpens: AdminUserCaseOpensResponse | null;
  period: AdminUserPeriod;
  loading: boolean;
  onPeriod: (period: AdminUserPeriod) => void;
}) {
  const summary = useMemo(
    () => (caseOpens?.items?.length ? summarizeCaseOpens(caseOpens.items) : []),
    [caseOpens],
  );
  const totals = useMemo(() => {
    if (!caseOpens?.items?.length) {
      return { opens: 0, paidNanoton: 0, prizeNanoton: 0 };
    }
    return caseOpens.items.reduce(
      (acc, op) => {
        acc.opens += 1;
        acc.paidNanoton += op.price_paid_nanoton;
        acc.prizeNanoton += op.prize_nanoton;
        return acc;
      },
      { opens: 0, paidNanoton: 0, prizeNanoton: 0 },
    );
  }, [caseOpens]);

  return (
    <div className="mt-3 space-y-2.5">
      <PeriodChips period={period} onPeriod={onPeriod} />
      {loading ? (
        <p className="text-sm text-muted">Загружаем открытия…</p>
      ) : !caseOpens ? (
        <p className="text-sm text-muted">Нет данных.</p>
      ) : caseOpens.items.length === 0 ? (
        <AdminEmpty>Нет открытий кейсов за период.</AdminEmpty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AdminMetric label="Открытий" value={String(totals.opens)} />
            <AdminMetric label="Потрачено" value={`${formatTON(totals.paidNanoton)} TON`} />
            <AdminMetric label="Призы" value={`${formatTON(totals.prizeNanoton)} TON`} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">Какие кейсы открывал</p>
            <div className="admin-users-scroll-list">
              {summary.map((row) => {
                const net = row.prizeNanoton - row.paidNanoton;
                return (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface-raised/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {row.opens} откр.
                        {row.paidOpens > 0 ? ` · ${row.paidOpens} платных` : ""}
                        {row.slug ? ` · ${row.slug}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="text-muted">−{formatTON(row.paidNanoton)}</p>
                      <p className="font-semibold">+{formatTON(row.prizeNanoton)}</p>
                      <p className={cn(net >= 0 ? "text-emerald-400" : "text-red-300")}>
                        {net >= 0 ? "+" : ""}
                        {formatTON(net)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">История открытий</p>
            <div className="admin-users-scroll-list">
              {caseOpens.items.map((op) => {
                const net = op.prize_nanoton - op.price_paid_nanoton;
                return (
                  <div
                    key={op.open_id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface-raised/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {op.case_title || op.case_slug || "Кейс"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted" title={op.prize_name}>
                        {op.prize_name} · {casePrizeTypeLabel(op.prize_type)} ·{" "}
                        {caseOpenSourceLabel(op.source)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">{formatWhen(op.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="font-semibold">{formatTON(op.prize_nanoton)} TON</p>
                      <p className="text-muted">цена {formatTON(op.price_paid_nanoton)}</p>
                      <p className={cn(net >= 0 ? "text-emerald-400" : "text-red-300")}>
                        {net >= 0 ? "+" : ""}
                        {formatTON(net)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
            <div className="admin-users-scroll-list">
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
              <div className="admin-users-scroll-list text-xs">
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
        <div className="admin-users-scroll-list">
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
