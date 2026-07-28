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
  getAdminYieldSettings,
  updateAdminYieldSettings,
  type AdminStakingEpochRow,
  type AdminStakingOverview,
  type AdminStakingPositionRow,
  type AdminYieldSettings,
} from "@/lib/api";
import { giftImageUrl, telegramGiftUrl } from "@/lib/gifts";
import { formatStakingEpochEnd } from "@/lib/staking-ui";

type Tab = "overview" | "settings" | "epochs" | "positions";

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

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadOverview(), loadSettings(), loadEpochs(), loadPositions({ offset: 0 })]);
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
            ["settings", "Настройки"],
            ["epochs", "Эпохи"],
            ["positions", "Позиции"],
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
    </AdminPage>
  );
}
