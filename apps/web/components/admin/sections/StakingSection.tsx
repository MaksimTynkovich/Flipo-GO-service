"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Gift } from "lucide-react";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { AdminFloatField, AdminTonField } from "@/components/admin/AdminInputs";
import { useToast } from "@/components/providers/ToastProvider";
import { formatTON } from "@/lib/api";
import {
  getAdminStakingEpochs,
  getAdminStakingOverview,
  getAdminStakingPositions,
  getAdminStakingStakers,
  getAdminStakingActivity,
  getAdminYieldSettings,
  updateAdminYieldSettings,
  type AdminStakingEpochRow,
  type AdminStakingOverview,
  type AdminStakingPositionRow,
  type AdminStakingStakerRow,
  type AdminStakingActivityRow,
  type AdminYieldSettings,
} from "@/lib/api";
import { giftImageUrl, telegramGiftUrl } from "@/lib/gifts";
import { formatStakingEpochEnd, formatStakingTierName } from "@/lib/staking-ui";

type Tab = "overview" | "stakers" | "settings" | "epochs" | "positions" | "activity";

function formatActivityEvent(name: string): string {
  switch (name) {
    case "staking_started":
      return "Стейк";
    case "staking_yield_paid":
      return "Выплата";
    case "staking_unstake_requested":
      return "Анстейк";
    case "referral_bonus_paid":
      return "Реф. бонус";
    default:
      return name;
  }
}

function formatActivityTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StakingPositionItem({ row }: { row: AdminStakingPositionRow }) {
  const [imgError, setImgError] = useState(false);
  const userLabel = row.first_name || row.username || `id ${row.telegram_id}`;
  const imageSrc = giftImageUrl(row.gift_slug);
  const nftUrl = telegramGiftUrl(row.gift_slug);

  return (
    <div className="flex items-start gap-3 rounded-md bg-surface-raised/40 px-2 py-2 text-sm">
      <a
        href={nftUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Открыть подарок в Telegram"
        className="shrink-0"
      >
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={row.gift_slug}
            className="h-14 w-14 rounded-lg object-cover transition-opacity hover:opacity-85"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-raised text-muted transition-opacity hover:opacity-85">
            <Gift className="h-5 w-5 opacity-50" />
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {userLabel}
            {row.username ? ` (@${row.username})` : ""}
          </p>
          <span className="text-xs text-[var(--admin-muted)]">
            {row.is_active ? "active" : row.revoked_reason || "closed"}
          </span>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--admin-muted)]">
          <span className="truncate">{row.gift_slug}</span>
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 text-accent hover:underline"
            title="Открыть в Telegram"
          >
            t.me/nft
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
        <p className="text-xs text-[var(--admin-muted)]">
          {formatTON(row.principal_nanoton)} TON · yield {formatTON(row.accrued_yield_nanoton)} ·{" "}
          {row.source} · tg {row.telegram_id}
        </p>
      </div>
    </div>
  );
}

const PAGE_SIZE = 30;

export default function StakingSection() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminStakingOverview | null>(null);
  const [settings, setSettings] = useState<AdminYieldSettings | null>(null);
  const [epochs, setEpochs] = useState<AdminStakingEpochRow[]>([]);
  const [positions, setPositions] = useState<AdminStakingPositionRow[]>([]);
  const [positionsTotal, setPositionsTotal] = useState(0);
  const [positionsOffset, setPositionsOffset] = useState(0);
  const [stakers, setStakers] = useState<AdminStakingStakerRow[]>([]);
  const [stakersTotal, setStakersTotal] = useState(0);
  const [stakersTotalProjectedPayoutNanoton, setStakersTotalProjectedPayoutNanoton] =
    useState(0);
  const [stakersOffset, setStakersOffset] = useState(0);
  const [stakersQuery, setStakersQuery] = useState("");
  const [activity, setActivity] = useState<AdminStakingActivityRow[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityStatus, setActivityStatus] = useState<"" | "success" | "error">("");
  const [activityQuery, setActivityQuery] = useState("");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadOverview() {
    const data = await getAdminStakingOverview();
    setOverview(data);
  }

  async function loadSettings() {
    const data = await getAdminYieldSettings();
    setSettings(data);
  }

  async function loadEpochs() {
    const data = await getAdminStakingEpochs({ limit: 30, offset: 0 });
    setEpochs(data.items);
  }

  async function loadPositions(opts?: { offset?: number; q?: string; active?: boolean }) {
    const offset = opts?.offset ?? positionsOffset;
    const q = opts?.q ?? query;
    const active = opts?.active ?? activeOnly;
    const data = await getAdminStakingPositions({
      q,
      active,
      limit: PAGE_SIZE,
      offset,
    });
    setPositions(data.items);
    setPositionsTotal(data.total);
    setPositionsOffset(offset);
  }

  async function loadStakers(opts?: { offset?: number; q?: string }) {
    const offset = opts?.offset ?? stakersOffset;
    const q = opts?.q ?? stakersQuery;
    const data = await getAdminStakingStakers({
      q,
      limit: PAGE_SIZE,
      offset,
    });
    setStakers(data.items);
    setStakersTotal(data.total);
    setStakersTotalProjectedPayoutNanoton(data.total_projected_payout_nanoton ?? 0);
    setStakersOffset(offset);
  }

  async function loadActivity(opts?: {
    offset?: number;
    q?: string;
    status?: "" | "success" | "error";
  }) {
    const offset = opts?.offset ?? activityOffset;
    const q = opts?.q ?? activityQuery;
    const status = opts?.status ?? activityStatus;
    const data = await getAdminStakingActivity({
      q,
      status,
      limit: PAGE_SIZE,
      offset,
    });
    setActivity(data.items);
    setActivityTotal(data.total);
    setActivityOffset(offset);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([
        loadOverview(),
        loadSettings(),
        loadEpochs(),
        loadStakers({ offset: 0 }),
        loadPositions({ offset: 0 }),
        loadActivity({ offset: 0 }),
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      await updateAdminYieldSettings(settings);
      showToast({ variant: "success", title: "Настройки стейкинга сохранены" });
      await loadOverview();
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось сохранить",
      });
    } finally {
      setSaving(false);
    }
  }

  const epochEnd = overview?.epoch_ends_at ? formatStakingEpochEnd(overview.epoch_ends_at) : null;
  const fillPct =
    overview && overview.tvl_cap_nanoton > 0
      ? Math.min(100, Math.round((overview.tvl_nanoton / overview.tvl_cap_nanoton) * 100))
      : 0;

  return (
    <AdminPage
      title="Стейкинг"
      description="Суточная эпоха МСК: выплата и разблокировка в 00:05. Управление пулом, лимитами и разбор позиций."
    >
      <AdminToolbar>
        {(
          [
            ["overview", "Обзор"],
            ["stakers", "Игроки"],
            ["settings", "Настройки"],
            ["epochs", "Эпохи"],
            ["positions", "Позиции"],
            ["activity", "Логи"],
          ] as const
        ).map(([id, label]) => (
          <AdminChip key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </AdminChip>
        ))}
        <AdminButton
          variant="secondary"
          className="!h-8 text-xs"
          onClick={() => loadAll().catch(() => {})}
        >
          {loading ? "…" : "Обновить"}
        </AdminButton>
      </AdminToolbar>

      {tab === "overview" ? (
        <div className="space-y-3">
          <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <AdminMetric
              label="TVL"
              value={overview ? `${formatTON(overview.tvl_nanoton)} TON` : "—"}
              hint={overview ? `${fillPct}% / cap ${formatTON(overview.tvl_cap_nanoton)}` : undefined}
              accent
            />
            <AdminMetric
              label="Стейкеры / позиции"
              value={
                overview ? `${overview.active_stakers} / ${overview.active_positions}` : "—"
              }
            />
            <AdminMetric
              label="Выплата в 00:05"
              value={overview ? `${formatTON(overview.projected_payout_nanoton)} TON` : "—"}
              hint="Прогноз по активным"
            />
            <AdminMetric
              label="Выплачено 24ч"
              value={overview ? `${formatTON(overview.paid_last_24h_nanoton)} TON` : "—"}
            />
          </section>

          <AdminPanel title="Текущая эпоха">
            {overview?.epoch_id ? (
              <div className="space-y-1 text-sm">
                <p>
                  Статус: <strong>{overview.epoch_status}</strong>
                </p>
                {epochEnd ? (
                  <p className="text-[var(--admin-muted)]">
                    До полуночи {epochEnd.dateLine} · {epochEnd.timeLine} · выплата в 00:05 МСК
                  </p>
                ) : null}
                <p className="text-xs text-[var(--admin-muted)]">
                  Base {overview.base_monthly_percent}% / Boost {overview.boost_monthly_percent}% ·
                  личный лимит {formatTON(overview.personal_limit_nanoton)} TON
                </p>
              </div>
            ) : (
              <AdminEmpty>{loading ? "Загрузка…" : "Активной эпохи нет"}</AdminEmpty>
            )}
          </AdminPanel>
        </div>
      ) : null}

      {tab === "stakers" ? (
        <div className="space-y-3">
          <AdminToolbar>
            <input
              value={stakersQuery}
              onChange={(e) => setStakersQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadStakers({ offset: 0, q: stakersQuery }).catch(() => {});
                }
              }}
              className="input-field h-8 min-w-[180px] flex-1"
              placeholder="username, имя, Telegram ID"
            />
            <AdminChip onClick={() => loadStakers({ offset: 0 }).catch(() => {})}>Найти</AdminChip>
          </AdminToolbar>

          <AdminPanel
            title={`Стейкеры (${stakersTotal})`}
            description="Активные игроки: сумма в стейке и прогноз выплаты в 00:05 МСК."
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-2">
              <p className="text-xs text-[var(--admin-muted)]">Нужно выплатить сегодня</p>
              <p className="text-sm font-semibold">
                {formatTON(stakersTotalProjectedPayoutNanoton)} TON
              </p>
            </div>
            {stakers.length === 0 ? (
              <AdminEmpty>{loading ? "Загрузка…" : "Активных стейкеров нет"}</AdminEmpty>
            ) : (
              <div className="space-y-1">
                <div className="hidden grid-cols-[minmax(0,1.4fr)_0.7fr_0.9fr_0.9fr] gap-2 px-2 text-[11px] uppercase tracking-wide text-[var(--admin-muted)] sm:grid">
                  <span>Игрок</span>
                  <span>Позиции</span>
                  <span>В стейке</span>
                  <span>Выплата сегодня</span>
                </div>
                {stakers.map((row) => {
                  const userLabel = row.first_name || row.username || `id ${row.telegram_id}`;
                  return (
                    <div
                      key={row.user_id}
                      className="grid gap-1 rounded-md bg-surface-raised/40 px-2 py-2 text-sm sm:grid-cols-[minmax(0,1.4fr)_0.7fr_0.9fr_0.9fr] sm:items-center sm:gap-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {userLabel}
                          {row.username ? ` (@${row.username})` : ""}
                        </p>
                        <p className="text-xs text-[var(--admin-muted)]">
                          tg {row.telegram_id} · {formatStakingTierName(row.staking_tier)}
                          {row.streak_bonus_active ? " · бонус ×2" : ""}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--admin-muted)] sm:text-sm sm:text-inherit">
                        <span className="sm:hidden">Позиции: </span>
                        {row.positions}
                      </p>
                      <p className="font-medium">
                        <span className="text-xs font-normal text-[var(--admin-muted)] sm:hidden">
                          В стейке:{" "}
                        </span>
                        {formatTON(row.principal_nanoton)} TON
                      </p>
                      <p className="font-medium text-accent">
                        <span className="text-xs font-normal text-[var(--admin-muted)] sm:hidden">
                          Выплата:{" "}
                        </span>
                        {formatTON(row.projected_payout_nanoton)} TON
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {stakersTotal > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-[var(--admin-muted)]">
                  Стр. {Math.floor(stakersOffset / PAGE_SIZE) + 1} /{" "}
                  {Math.max(1, Math.ceil(stakersTotal / PAGE_SIZE))}
                </p>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={stakersOffset <= 0}
                    onClick={() =>
                      loadStakers({ offset: Math.max(0, stakersOffset - PAGE_SIZE) }).catch(
                        () => {},
                      )
                    }
                  >
                    Назад
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={stakersOffset + PAGE_SIZE >= stakersTotal}
                    onClick={() =>
                      loadStakers({ offset: stakersOffset + PAGE_SIZE }).catch(() => {})
                    }
                  >
                    Далее
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </div>
      ) : null}

      {tab === "settings" ? (
        settings ? (
        <AdminPanel
          title="Параметры стейкинга"
          description="Реферальные % остаются в разделе Маркетинг."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminFloatField
              label="Base % / мес"
              value={settings.staking_base_monthly_percent}
              onChange={(v) =>
                setSettings((prev) =>
                  prev ? { ...prev, staking_base_monthly_percent: v } : prev,
                )
              }
            />
            <AdminFloatField
              label="Boost % / мес"
              value={settings.staking_boost_monthly_percent}
              onChange={(v) =>
                setSettings((prev) =>
                  prev ? { ...prev, staking_boost_monthly_percent: v } : prev,
                )
              }
            />
            <AdminTonField
              label="TVL cap (TON)"
              valueNanoton={settings.staking_tvl_cap_nanoton ?? 0}
              onChangeNanoton={(v) =>
                setSettings((prev) => (prev ? { ...prev, staking_tvl_cap_nanoton: v } : prev))
              }
            />
            <AdminTonField
              label="Личный лимит база (TON)"
              valueNanoton={settings.staking_personal_limit_nanoton ?? 0}
              onChangeNanoton={(v) =>
                setSettings((prev) =>
                  prev ? { ...prev, staking_personal_limit_nanoton: v } : prev,
                )
              }
            />
          </div>
          <div className="pt-3">
            <AdminButton disabled={saving} onClick={() => saveSettings().catch(() => {})}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </AdminButton>
          </div>
        </AdminPanel>
        ) : (
          <AdminEmpty>Загрузка настроек…</AdminEmpty>
        )
      ) : null}

      {tab === "epochs" ? (
        <AdminPanel title="История эпох">
          {epochs.length === 0 ? (
            <AdminEmpty>{loading ? "Загрузка…" : "Эпох пока нет"}</AdminEmpty>
          ) : (
            <div className="space-y-1">
              {epochs.map((row) => {
                const end = formatStakingEpochEnd(row.ends_at);
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-raised/40 px-2 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {end.dateLine} · {row.status}
                      </p>
                      <p className="text-xs text-[var(--admin-muted)]">
                        {row.positions} поз. · {formatTON(row.principal_nanoton)} TON · yield{" "}
                        {formatTON(row.accrued_yield_nanoton)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminPanel>
      ) : null}

      {tab === "positions" ? (
        <div className="space-y-3">
          <AdminToolbar>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadPositions({ offset: 0, q: query }).catch(() => {});
                }
              }}
              className="input-field h-8 min-w-[180px] flex-1"
              placeholder="username, Telegram ID, gift slug"
            />
            <AdminChip
              active={activeOnly}
              onClick={() => {
                const next = !activeOnly;
                setActiveOnly(next);
                loadPositions({ offset: 0, active: next }).catch(() => {});
              }}
            >
              Только активные
            </AdminChip>
            <AdminChip onClick={() => loadPositions({ offset: 0 }).catch(() => {})}>
              Найти
            </AdminChip>
          </AdminToolbar>

          <AdminPanel title={`Позиции (${positionsTotal})`}>
            {positions.length === 0 ? (
              <AdminEmpty>{loading ? "Загрузка…" : "Ничего не найдено"}</AdminEmpty>
            ) : (
              <div className="space-y-1">
                {positions.map((row) => (
                  <StakingPositionItem key={row.id} row={row} />
                ))}
              </div>
            )}

            {positionsTotal > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-[var(--admin-muted)]">
                  Стр. {Math.floor(positionsOffset / PAGE_SIZE) + 1} /{" "}
                  {Math.max(1, Math.ceil(positionsTotal / PAGE_SIZE))}
                </p>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={positionsOffset <= 0}
                    onClick={() =>
                      loadPositions({ offset: Math.max(0, positionsOffset - PAGE_SIZE) }).catch(
                        () => {},
                      )
                    }
                  >
                    Назад
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={positionsOffset + PAGE_SIZE >= positionsTotal}
                    onClick={() =>
                      loadPositions({ offset: positionsOffset + PAGE_SIZE }).catch(() => {})
                    }
                  >
                    Далее
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-3">
          <AdminToolbar>
            <input
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadActivity({ offset: 0, q: activityQuery }).catch(() => {});
                }
              }}
              className="input-field h-8 min-w-[180px] flex-1"
              placeholder="username, Telegram ID, slug, error"
            />
            <AdminChip
              active={activityStatus === ""}
              onClick={() => {
                setActivityStatus("");
                loadActivity({ offset: 0, status: "" }).catch(() => {});
              }}
            >
              Все
            </AdminChip>
            <AdminChip
              active={activityStatus === "success"}
              onClick={() => {
                setActivityStatus("success");
                loadActivity({ offset: 0, status: "success" }).catch(() => {});
              }}
            >
              Успех
            </AdminChip>
            <AdminChip
              active={activityStatus === "error"}
              onClick={() => {
                setActivityStatus("error");
                loadActivity({ offset: 0, status: "error" }).catch(() => {});
              }}
            >
              Ошибки
            </AdminChip>
            <AdminChip onClick={() => loadActivity({ offset: 0 }).catch(() => {})}>Найти</AdminChip>
          </AdminToolbar>

          <AdminPanel title={`Логи стейкинга (${activityTotal})`}>
            {activity.length === 0 ? (
              <AdminEmpty>{loading ? "Загрузка…" : "Событий пока нет"}</AdminEmpty>
            ) : (
              <div className="space-y-1">
                {activity.map((row) => {
                  const userLabel = row.first_name || row.username || (row.telegram_id ? `tg ${row.telegram_id}` : "—");
                  const isError = row.status === "error";
                  return (
                    <div
                      key={row.id}
                      className="rounded-md bg-surface-raised/40 px-2 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {formatActivityEvent(row.event_name)}
                          {row.gift_slug ? ` · ${row.gift_slug}` : ""}
                        </p>
                        <span
                          className={
                            isError
                              ? "text-xs font-medium text-danger"
                              : "text-xs font-medium text-success"
                          }
                        >
                          {isError ? "error" : "success"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--admin-muted)]">
                        {formatActivityTime(row.occurred_at)} · {userLabel}
                        {row.username ? ` (@${row.username})` : ""}
                        {row.telegram_id ? ` · tg ${row.telegram_id}` : ""}
                        {row.source ? ` · ${row.source}` : ""}
                      </p>
                      {isError ? (
                        <p className="mt-1 text-xs text-danger">
                          {row.error_code ? `[${row.error_code}] ` : ""}
                          {row.error_message || "Ошибка без текста"}
                        </p>
                      ) : null}
                      {row.request_id ? (
                        <p className="mt-0.5 text-[10px] text-[var(--admin-muted)]">
                          req {row.request_id}
                          {row.item_id ? ` · item ${row.item_id}` : ""}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {activityTotal > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-[var(--admin-muted)]">
                  Стр. {Math.floor(activityOffset / PAGE_SIZE) + 1} /{" "}
                  {Math.max(1, Math.ceil(activityTotal / PAGE_SIZE))}
                </p>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={activityOffset <= 0}
                    onClick={() =>
                      loadActivity({ offset: Math.max(0, activityOffset - PAGE_SIZE) }).catch(
                        () => {},
                      )
                    }
                  >
                    Назад
                  </AdminButton>
                  <AdminButton
                    variant="secondary"
                    className="!h-8 text-xs"
                    disabled={activityOffset + PAGE_SIZE >= activityTotal}
                    onClick={() =>
                      loadActivity({ offset: activityOffset + PAGE_SIZE }).catch(() => {})
                    }
                  >
                    Далее
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </AdminPanel>
        </div>
      ) : null}
    </AdminPage>
  );
}
