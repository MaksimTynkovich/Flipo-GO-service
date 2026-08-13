"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminField,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { useToast } from "@/components/providers/ToastProvider";
import { formatUserError } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import {
  createAdminCampaign,
  formatTON,
  getAdminCampaign,
  getAdminCampaigns,
  patchAdminCampaign,
  type AdminCampaignDailyPoint,
  type AdminCampaignSource,
  type AdminCampaignStats,
} from "@/lib/api";

const CACHE_KEY = "admin:marketing:campaigns:v1";

type PeriodId = "7d" | "30d" | "all";
type SortKey =
  | "name"
  | "clicks"
  | "app_opens"
  | "new_users"
  | "deposits_nanoton"
  | "ggr_nanoton"
  | "reg_to_deposit_pct";

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
];

const SOURCES: Array<{ id: AdminCampaignSource | ""; label: string }> = [
  { id: "", label: "Все каналы" },
  { id: "telegram_ads", label: "Telegram Ads" },
  { id: "channel", label: "Канал" },
  { id: "stories", label: "Stories" },
  { id: "influencer", label: "Блогер" },
  { id: "other", label: "Другое" },
];

const SOURCE_LABEL: Record<string, string> = {
  telegram_ads: "Telegram Ads",
  channel: "Канал",
  stories: "Stories",
  influencer: "Блогер",
  other: "Другое",
};

const LANDING_LABEL: Record<string, string> = {
  cases: "Кейсы",
  games: "Игры",
  crash: "Crash",
};

function periodRange(id: PeriodId): { from?: string; to?: string } {
  const to = new Date();
  if (id === "all") {
    return { from: "2020-01-01", to: to.toISOString() };
  }
  const days = id === "7d" ? 7 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatPct(value: number): string {
  if (!value) return "—";
  return `${value.toFixed(1)}%`;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function metricValue(row: AdminCampaignStats, key: SortKey): number | string {
  if (key === "name") return row.name.toLowerCase();
  return row[key] ?? 0;
}

export default function MarketingSection() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminCampaignStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [source, setSource] = useState<AdminCampaignSource | "">("");
  const [hideArchived, setHideArchived] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("new_users");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [daily, setDaily] = useState<AdminCampaignDailyPoint[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createSource, setCreateSource] = useState<AdminCampaignSource>("telegram_ads");
  const [content, setContent] = useState("");
  const [landing, setLanding] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const range = periodRange(period);
      const data = await loadCached(`${CACHE_KEY}:${period}:${source}`, () =>
        getAdminCampaigns({ ...range, source: source || undefined }),
      );
      setItems(data);
      primeCache(`${CACHE_KEY}:${period}:${source}`, data);
    } catch (error) {
      showToast({ title: formatUserError(error), variant: "error" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<AdminCampaignStats[]>(`${CACHE_KEY}:${period}:${source}`);
      if (cached) setItems(cached);
      load().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, source]);

  async function loadDaily(id: string) {
    setDailyLoading(true);
    try {
      const detail = await getAdminCampaign(id, periodRange(period));
      setDaily(detail.daily ?? []);
    } catch {
      setDaily([]);
    } finally {
      setDailyLoading(false);
    }
  }

  async function onCreate() {
    if (!name.trim()) {
      showToast({ title: "Укажите название кампании", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const created = await createAdminCampaign({
        name: name.trim(),
        code: code.trim() || undefined,
        source: createSource,
        content: content.trim() || undefined,
        landing: landing || undefined,
      });
      setName("");
      setCode("");
      setContent("");
      setLanding("");
      setItems((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
      showToast({ title: "Кампания создана", variant: "success" });
      await load();
    } catch (error) {
      showToast({ title: formatUserError(error, "Не удалось создать кампанию"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row: AdminCampaignStats) {
    const next = row.status === "archived" ? "active" : "archived";
    try {
      const updated = await patchAdminCampaign(row.id, { status: next });
      setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item)));
      showToast({
        title: next === "archived" ? "Кампания в архиве" : "Кампания снова активна",
        variant: "success",
      });
    } catch (error) {
      showToast({ title: formatUserError(error), variant: "error" });
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ title: `${label} скопирована`, variant: "success" });
    } catch {
      showToast({ title: "Не удалось скопировать", variant: "error" });
    }
  }

  const visible = useMemo(() => {
    const rows = hideArchived ? items.filter((row) => row.status !== "archived") : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = metricValue(a, sortKey);
      const bv = metricValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv, "ru") * dir;
      }
      return (Number(av) - Number(bv)) * dir;
    });
  }, [items, hideArchived, sortKey, sortDir]);

  const totals = useMemo(() => {
    return visible.reduce(
      (acc, row) => {
        acc.clicks += row.clicks;
        acc.newUsers += row.new_users;
        acc.depositors += row.depositors;
        acc.deposits += row.deposits_nanoton;
        acc.ggr += row.ggr_nanoton;
        return acc;
      },
      { clicks: 0, newUsers: 0, depositors: 0, deposits: 0, ggr: 0 },
    );
  }, [visible]);

  const bySource = useMemo(() => {
    const map = new Map<string, { source: string; clicks: number; newUsers: number; deposits: number; ggr: number }>();
    for (const row of visible) {
      const key = row.source || "other";
      const cur = map.get(key) ?? { source: key, clicks: 0, newUsers: 0, deposits: 0, ggr: 0 };
      cur.clicks += row.clicks;
      cur.newUsers += row.new_users;
      cur.deposits += row.deposits_nanoton;
      cur.ggr += row.ggr_nanoton;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.newUsers - a.newUsers || b.clicks - a.clicks);
  }, [visible]);

  const best = useMemo(() => {
    const pick = (key: SortKey) =>
      visible.reduce<AdminCampaignStats | null>((winner, row) => {
        if (!winner) return row;
        return Number(metricValue(row, key)) > Number(metricValue(winner, key)) ? row : winner;
      }, null);
    return {
      clicks: pick("clicks")?.id,
      newUsers: pick("new_users")?.id,
      deposits: pick("deposits_nanoton")?.id,
      ggr: pick("ggr_nanoton")?.id,
      conv: pick("reg_to_deposit_pct")?.id,
    };
  }, [visible]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  return (
    <AdminPage
      title="Маркетинг"
      description="Ссылки с кодом c_… и сравнение, какая реклама приводит людей, депозиты и GGR."
    >
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Клики" value={formatCount(totals.clicks)} hint="Уникальные /start с кодом кампании." />
        <Stat label="Новые" value={formatCount(totals.newUsers)} hint="Регистрации first-touch по видимым кампаниям." />
        <Stat
          label="Депозиты"
          value={`${formatTON(totals.deposits)} TON`}
          hint={`${formatCount(totals.depositors)} платящих в когорте.`}
        />
        <Stat label="GGR" value={`${formatTON(totals.ggr)} TON`} hint="Ставки минус выплаты когорты." />
      </section>

      {bySource.length > 1 ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {bySource.map((row) => (
            <button
              key={row.source}
              type="button"
              onClick={() => setSource(source === row.source ? "" : (row.source as AdminCampaignSource))}
              className={cn(
                "panel p-3 text-left transition-colors",
                source === row.source && "ring-1 ring-[var(--admin-accent)]",
              )}
            >
              <p className="text-xs text-muted">{SOURCE_LABEL[row.source] || row.source}</p>
              <p className="mt-1 text-sm font-semibold">
                {formatCount(row.newUsers)} новых
                <span className="ml-2 font-normal text-muted">{formatCount(row.clicks)} кликов</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {formatTON(row.deposits)} TON деп. · GGR {formatTON(row.ggr)}
              </p>
            </button>
          ))}
        </section>
      ) : null}

      <AdminPanel
        title="Новая кампания"
        description="Код попадёт в ссылку как c_код. Telegram принимает до 64 символов [A-Za-z0-9_-]."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AdminField label="Название">
            <input
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="TG Ads — креатив A"
            />
          </AdminField>
          <AdminField label="Канал">
            <select
              className="admin-input"
              value={createSource}
              onChange={(e) => setCreateSource(e.target.value as AdminCampaignSource)}
            >
              {SOURCES.filter((item) => item.id).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Вариант / креатив" hint="Для A/B: A, B, видео-1…">
            <input
              className="admin-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="A"
            />
          </AdminField>
          <AdminField label="Свой код" hint="Необязательно. 2–24 символа a-z, 0-9, _">
            <input
              className="admin-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="tgads_a"
            />
          </AdminField>
          <AdminField label="Landing после открытия">
            <select className="admin-input" value={landing} onChange={(e) => setLanding(e.target.value)}>
              <option value="">По умолчанию</option>
              <option value="cases">Кейсы</option>
              <option value="games">Игры</option>
              <option value="crash">Crash</option>
            </select>
          </AdminField>
        </div>
        <AdminToolbar>
          <AdminButton onClick={() => void onCreate()} disabled={saving}>
            {saving ? "Создаём…" : "Создать ссылки"}
          </AdminButton>
        </AdminToolbar>
      </AdminPanel>

      <AdminPanel
        title="Сравнение"
        description="Клик по заголовку сортирует. Зелёным подсвечен лидер столбца. Раскройте строку — ссылки и дни."
      >
        <AdminToolbar>
          {PERIODS.map((item) => (
            <AdminChip key={item.id} active={period === item.id} onClick={() => setPeriod(item.id)}>
              {item.label}
            </AdminChip>
          ))}
          <select
            className="admin-input max-w-[180px]"
            value={source}
            onChange={(e) => setSource(e.target.value as AdminCampaignSource | "")}
          >
            {SOURCES.map((item) => (
              <option key={item.id || "all"} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <AdminChip active={hideArchived} onClick={() => setHideArchived((v) => !v)}>
            {hideArchived ? "Без архива" : "С архивом"}
          </AdminChip>
        </AdminToolbar>

        {loading && items.length === 0 ? (
          <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Загружаем кампании…</p>
        ) : visible.length === 0 ? (
          <AdminEmpty>
            {items.length === 0
              ? "Кампаний пока нет — создайте первую ссылку выше."
              : "Все кампании в архиве. Включите «С архивом»."}
          </AdminEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">
                <tr className="border-b border-[var(--admin-border,#1e2a38)]">
                  <SortTh active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")}>
                    Кампания
                  </SortTh>
                  <SortTh active={sortKey === "clicks"} dir={sortDir} onClick={() => toggleSort("clicks")}>
                    Клики
                  </SortTh>
                  <SortTh active={sortKey === "new_users"} dir={sortDir} onClick={() => toggleSort("new_users")}>
                    Новые
                  </SortTh>
                  <SortTh
                    active={sortKey === "deposits_nanoton"}
                    dir={sortDir}
                    onClick={() => toggleSort("deposits_nanoton")}
                  >
                    Депозиты
                  </SortTh>
                  <SortTh active={sortKey === "ggr_nanoton"} dir={sortDir} onClick={() => toggleSort("ggr_nanoton")}>
                    GGR
                  </SortTh>
                  <SortTh
                    active={sortKey === "reg_to_deposit_pct"}
                    dir={sortDir}
                    onClick={() => toggleSort("reg_to_deposit_pct")}
                  >
                    Воронка
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <CampaignRows
                      key={row.id}
                      row={row}
                      open={open}
                      best={best}
                      daily={open ? daily : []}
                      dailyLoading={open && dailyLoading}
                      onToggle={() => {
                        const next = open ? null : row.id;
                        setExpandedId(next);
                        setDaily([]);
                        if (next) void loadDaily(next);
                      }}
                      onCopy={copy}
                      onArchive={() => void onArchive(row)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}

function SortTh({
  children,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="py-2 pr-3 font-medium">
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--admin-fg)]">
        {children}
        <span className={cn("text-[10px]", active ? "opacity-100" : "opacity-30")}>
          {active && dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function CampaignRows({
  row,
  open,
  best,
  daily,
  dailyLoading,
  onToggle,
  onCopy,
  onArchive,
}: {
  row: AdminCampaignStats;
  open: boolean;
  best: { clicks?: string; newUsers?: string; deposits?: string; ggr?: string; conv?: string };
  daily: AdminCampaignDailyPoint[];
  dailyLoading: boolean;
  onToggle: () => void;
  onCopy: (value: string, label: string) => void;
  onArchive: () => void;
}) {
  const leader = row.id === best.newUsers || row.id === best.ggr;
  return (
    <>
      <tr className="border-b border-[var(--admin-border,#1e2a38)]/60">
        <td className="py-2.5 pr-3">
          <button type="button" className="text-left" onClick={onToggle}>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--admin-fg,#e8eef6)]">{row.name}</span>
              {leader ? (
                <span className="rounded-md bg-[var(--admin-accent-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--admin-fg)]">
                  лидер
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-[var(--admin-muted,#8b98a8)]">
              {SOURCE_LABEL[row.source] || row.source}
              {row.content ? ` · ${row.content}` : ""}
              {row.landing ? ` · ${LANDING_LABEL[row.landing] || row.landing}` : ""}
              {row.status === "archived" ? " · архив" : ""}
              {` · ${row.start_param}`}
            </div>
          </button>
        </td>
        <MetricTd best={row.id === best.clicks}>{formatCount(row.clicks)}</MetricTd>
        <MetricTd best={row.id === best.newUsers}>
          {formatCount(row.new_users)}
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--admin-muted)]">
            {formatCount(row.app_opens)} откр.
          </span>
        </MetricTd>
        <MetricTd best={row.id === best.deposits}>
          {formatTON(row.deposits_nanoton)}
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--admin-muted)]">
            {formatCount(row.depositors)} платящих
          </span>
        </MetricTd>
        <MetricTd best={row.id === best.ggr}>
          {formatTON(row.ggr_nanoton)}
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--admin-muted)]">
            {formatCount(row.bettors)} с ставкой
          </span>
        </MetricTd>
        <td className="py-2.5">
          <FunnelCell
            clickToReg={row.click_to_reg_pct}
            regToDep={row.reg_to_deposit_pct}
            regToBet={row.reg_to_bet_pct}
            best={row.id === best.conv}
          />
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-[var(--admin-border,#1e2a38)]/60">
          <td colSpan={6} className="pb-4 pt-1">
            <div className="space-y-3 rounded-xl bg-[var(--admin-raised,#1c222d)] p-3">
              <div className="flex flex-wrap gap-2">
                <AdminButton
                  variant="secondary"
                  onClick={() => onCopy(row.mini_app_url, "Mini App ссылка")}
                  disabled={!row.mini_app_url}
                >
                  Копировать Mini App
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  onClick={() => onCopy(row.bot_start_url, "Bot /start ссылка")}
                  disabled={!row.bot_start_url}
                >
                  Копировать /start
                </AdminButton>
                <AdminButton variant="secondary" onClick={onArchive}>
                  {row.status === "archived" ? "Вернуть из архива" : "В архив"}
                </AdminButton>
              </div>
              <p className="break-all text-xs text-[var(--admin-muted,#8b98a8)]">
                Mini App: {row.mini_app_url || "не задан BOT_USERNAME"}
                <br />
                Bot: {row.bot_start_url || "не задан BOT_USERNAME"}
              </p>
              {dailyLoading ? (
                <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Загружаем дни…</p>
              ) : daily.length === 0 ? (
                <p className="text-sm text-[var(--admin-muted,#8b98a8)]">За период нет дневных точек.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted,#8b98a8)]">
                      <tr>
                        <th className="py-1 pr-2 font-medium">День</th>
                        <th className="py-1 pr-2 font-medium">Клики</th>
                        <th className="py-1 pr-2 font-medium">Открытия</th>
                        <th className="py-1 pr-2 font-medium">Новые</th>
                        <th className="py-1 font-medium">Депозиты</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((point) => (
                        <tr key={point.date}>
                          <td className="py-1 pr-2">{point.date}</td>
                          <td className="py-1 pr-2 tabular-nums">{formatCount(point.clicks)}</td>
                          <td className="py-1 pr-2 tabular-nums">{formatCount(point.app_opens)}</td>
                          <td className="py-1 pr-2 tabular-nums">{formatCount(point.new_users)}</td>
                          <td className="py-1 tabular-nums">{formatTON(point.deposits_nanoton)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MetricTd({ best, children }: { best: boolean; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        "py-2.5 pr-3 align-top tabular-nums",
        best && "font-semibold text-[var(--admin-accent,#2dd4bf)]",
      )}
    >
      {children}
    </td>
  );
}

function FunnelCell({
  clickToReg,
  regToDep,
  regToBet,
  best,
}: {
  clickToReg: number;
  regToDep: number;
  regToBet: number;
  best: boolean;
}) {
  const max = Math.max(clickToReg, regToDep, regToBet, 1);
  return (
    <div className={cn("min-w-[140px] space-y-1", best && "font-medium")}>
      <p className="text-[11px] tabular-nums text-[var(--admin-muted)]">
        {formatPct(clickToReg)} → {formatPct(regToDep)} → {formatPct(regToBet)}
      </p>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-black/25">
        <div className="h-full bg-[var(--admin-accent)]/85" style={{ width: `${(clickToReg / max) * 34}%` }} />
        <div className="h-full bg-[var(--admin-accent)]/55" style={{ width: `${(regToDep / max) * 33}%` }} />
        <div className="h-full bg-[var(--admin-accent)]/30" style={{ width: `${(regToBet / max) * 33}%` }} />
      </div>
      <p className="text-[10px] text-[var(--admin-muted)]">клик→рег → рег→деп → рег→бет</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted">{label}</p>
        {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
