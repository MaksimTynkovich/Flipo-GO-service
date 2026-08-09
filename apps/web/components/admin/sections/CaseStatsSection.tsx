"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import {
  AdminButton,
  AdminChip,
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPanel,
  AdminToolbar,
} from "@/components/admin/admin-ui";
import { formatCasePrice } from "@/components/cases/case-ui";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import { cn } from "@/lib/utils";
import {
  formatTON,
  getAdminCaseCatalogSettings,
  getAdminCaseOpenStats,
  getAdminCases,
  resolveAsset,
  type AdminCase,
  type AdminCaseOpenCaseRow,
  type AdminCaseOpenDailyPoint,
  type AdminCaseOpenPeriodStats,
  type AdminCaseOpenPrizeHit,
  type AdminCaseOpenPrizeTypeStats,
  type AdminCaseOpenSourceBreakdown,
  type AdminCaseOpenSourceStats,
  type AdminCaseOpenStats,
} from "@/lib/api";

const CACHE_KEY = "admin:case-open-stats:v2";
const CASES_CACHE_KEY = "admin:cases:list:v1";
const SETTINGS_CACHE_KEY = "admin:cases:catalog-settings:v1";

type PeriodId = "today" | "7d" | "30d" | "all";
type SourcePeriod = "today" | "all";
type PrizeTypePeriod = "7d" | "all";

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "today", label: "День" },
  { id: "7d", label: "Неделя" },
  { id: "30d", label: "Месяц" },
  { id: "all", label: "Всё время" },
];

const SOURCE_META: Array<{
  key: keyof AdminCaseOpenSourceBreakdown;
  label: string;
  hint: string;
}> = [
  { key: "paid", label: "Платные", hint: "Открытия за TON с баланса" },
  { key: "daily", label: "Ежедневные", hint: "Бесплатный кейс по суточному лимиту" },
  { key: "free", label: "Бесплатные", hint: "Прочие бесплатные открытия" },
  { key: "promo", label: "Промо", hint: "Открытия по промокодам" },
];

type CatalogCaseCard = {
  id: string;
  title: string;
  slug: string;
  image_url?: string;
  kind: string;
  price_nanoton: number;
  sort_order: number;
  active: boolean;
  opens: number;
  spent_nanoton: number;
  prize_total_nanoton: number;
  house_edge_nanoton: number;
  actual_rtp_bps: number;
};

function formatRtp(bps: number): string {
  if (!bps) return "—";
  return `${(bps / 100).toFixed(1)}%`;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function formatTonLabel(nanoton: number): string {
  return `${formatTON(nanoton)} TON`;
}

function prizeTypeLabel(t: string): string {
  switch (t) {
    case "gift":
      return "Подарки";
    case "ton":
      return "TON";
    default:
      return t || "—";
  }
}

function periodStats(stats: AdminCaseOpenStats, id: PeriodId): AdminCaseOpenPeriodStats {
  if (id === "today") return stats.today;
  if (id === "7d") return stats.last_7_days;
  if (id === "30d") return stats.last_30_days ?? stats.last_7_days;
  return stats.all_time;
}

function byCaseRows(stats: AdminCaseOpenStats, id: PeriodId): AdminCaseOpenCaseRow[] {
  if (id === "today") return stats.by_case_today ?? [];
  if (id === "7d") return stats.by_case_7d ?? [];
  if (id === "30d") return stats.by_case_30d ?? stats.by_case_7d ?? [];
  return stats.by_case_all_time ?? [];
}

function edgeTone(edge: number): "good" | "bad" | "neutral" {
  if (edge > 0) return "good";
  if (edge < 0) return "bad";
  return "neutral";
}

function emptySource(): AdminCaseOpenSourceStats {
  return { opens: 0, unique_users: 0, spent_nanoton: 0, prize_total_nanoton: 0 };
}

export default function CaseStatsSection() {
  const [stats, setStats] = useState<AdminCaseOpenStats | null>(null);
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [bannersEnabled, setBannersEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [sourcePeriod, setSourcePeriod] = useState<SourcePeriod>("today");
  const [prizeTypePeriod, setPrizeTypePeriod] = useState<PrizeTypePeriod>("7d");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [nextStats, nextCases, settings] = await Promise.all([
        loadCached(CACHE_KEY, getAdminCaseOpenStats),
        loadCached(CASES_CACHE_KEY, getAdminCases),
        loadCached(SETTINGS_CACHE_KEY, getAdminCaseCatalogSettings).catch(() => null),
      ]);
      setStats(nextStats);
      setCases(nextCases);
      setBannersEnabled(Boolean(settings?.banners_enabled));
      primeCache(CACHE_KEY, nextStats);
      primeCache(CASES_CACHE_KEY, nextCases);
      if (settings) primeCache(SETTINGS_CACHE_KEY, settings);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cachedStats = readCached<AdminCaseOpenStats>(CACHE_KEY);
    const cachedCases = readCached<AdminCase[]>(CASES_CACHE_KEY);
    const cachedSettings = readCached<{ banners_enabled?: boolean }>(SETTINGS_CACHE_KEY);
    if (cachedStats) setStats(cachedStats);
    if (cachedCases) setCases(cachedCases);
    if (cachedSettings) setBannersEnabled(Boolean(cachedSettings.banners_enabled));
    if (cachedStats && cachedCases) setLoading(false);
    return runAfterFirstPaint(() => {
      load().catch(() => {});
    });
  }, []);

  const active = stats ? periodStats(stats, period) : null;
  const catalogCards = useMemo(() => {
    if (!stats) return [] as CatalogCaseCard[];
    const rows = byCaseRows(stats, period);
    const byId = new Map(rows.map((row) => [row.case_id, row]));

    const base: CatalogCaseCard[] =
      cases.length > 0
        ? cases
            .filter((c) => c.active)
            .map((c) => {
              const row = byId.get(c.id);
              return {
                id: c.id,
                title: c.title,
                slug: c.slug,
                image_url: c.image_url,
                kind: c.kind,
                price_nanoton: c.price_nanoton,
                sort_order: c.sort_order,
                active: c.active,
                opens: row?.opens ?? 0,
                spent_nanoton: row?.spent_nanoton ?? 0,
                prize_total_nanoton: row?.prize_total_nanoton ?? 0,
                house_edge_nanoton: row?.house_edge_nanoton ?? 0,
                actual_rtp_bps: row?.actual_rtp_bps ?? 0,
              };
            })
        : rows.map((row) => ({
            id: row.case_id,
            title: row.title,
            slug: row.slug,
            image_url: row.image_url,
            kind: row.kind || "catalog",
            price_nanoton: row.price_nanoton ?? 0,
            sort_order: row.sort_order ?? 0,
            active: row.active ?? true,
            opens: row.opens,
            spent_nanoton: row.spent_nanoton,
            prize_total_nanoton: row.prize_total_nanoton,
            house_edge_nanoton: row.house_edge_nanoton,
            actual_rtp_bps: row.actual_rtp_bps,
          }));

    return [...base].sort(
      (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "ru"),
    );
  }, [stats, cases, period]);

  const sources = stats
    ? sourcePeriod === "today"
      ? stats.sources_today
      : stats.sources_all_time
    : null;
  const prizeTypes = stats
    ? prizeTypePeriod === "7d"
      ? stats.prize_types_7d
      : stats.prize_types_all_time
    : [];

  return (
    <AdminPage description="Каталог кейсов с открытиями за период. Наведите или нажмите на карточку — подробная экономика. Периоды в UTC.">
      <AdminToolbar>
        {PERIODS.map((item) => (
          <AdminChip key={item.id} active={period === item.id} onClick={() => setPeriod(item.id)}>
            {item.label}
          </AdminChip>
        ))}
        <AdminButton variant="secondary" disabled={loading} onClick={() => load().catch(() => {})}>
          {loading ? "…" : "Обновить"}
        </AdminButton>
      </AdminToolbar>

      {stats && active ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <AdminMetric label="Открытий" value={formatCount(active.opens)} accent />
            <AdminMetric label="Игроков" value={formatCount(active.unique_users)} />
            <AdminMetric label="Заплатили" value={formatTonLabel(active.spent_nanoton)} />
            <AdminMetric label="Выдано призов" value={formatTonLabel(active.prize_total_nanoton)} />
            <MetricHighlight
              label="Прибыль дома"
              value={formatTonLabel(active.house_edge_nanoton)}
              tone={edgeTone(active.house_edge_nanoton)}
              hint="Заплатили − оценка призов"
            />
            <AdminMetric
              label="RTP (paid)"
              value={formatRtp(active.actual_rtp_bps)}
              hint="Только платные открытия"
            />
          </section>

          <AdminPanel
            title="Каталог кейсов"
            description="Как на главном экране кейсов: на карточке — число открытий, при наведении — экономика."
          >
            <CasesStatsCatalog
              cards={catalogCards}
              bannersEnabled={bannersEnabled}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            />
          </AdminPanel>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <AdminPanel title="Источники" description="Откуда пришли открытия.">
              <div className="mb-3 flex flex-wrap gap-2">
                <AdminChip active={sourcePeriod === "today"} onClick={() => setSourcePeriod("today")}>
                  Сегодня
                </AdminChip>
                <AdminChip active={sourcePeriod === "all"} onClick={() => setSourcePeriod("all")}>
                  Всё время
                </AdminChip>
              </div>
              {sources ? <SourceCards sources={sources} /> : null}
            </AdminPanel>

            <AdminPanel title="Тип приза" description="Подарки vs TON.">
              <div className="mb-3 flex flex-wrap gap-2">
                <AdminChip
                  active={prizeTypePeriod === "7d"}
                  onClick={() => setPrizeTypePeriod("7d")}
                >
                  7 дней
                </AdminChip>
                <AdminChip
                  active={prizeTypePeriod === "all"}
                  onClick={() => setPrizeTypePeriod("all")}
                >
                  Всё время
                </AdminChip>
              </div>
              <PrizeTypeBars rows={prizeTypes ?? []} />
            </AdminPanel>
          </div>

          <AdminPanel
            title="Открытия за 14 дней"
            description="Высота — число открытий. Цвет: плюс/минус для дома."
          >
            <DayChart points={stats.opens_by_day ?? []} />
          </AdminPanel>

          <AdminPanel
            title="Топ призов за 7 дней"
            description="Какие позиции лута выпадали чаще всего."
          >
            <PrizeHitsList rows={stats.top_prizes_7d ?? []} />
          </AdminPanel>
        </>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-[1.4rem] bg-surface-raised/50" />
          ))}
        </div>
      ) : (
        <AdminEmpty>Не удалось загрузить статистику кейсов.</AdminEmpty>
      )}
    </AdminPage>
  );
}

function CasesStatsCatalog({
  cards,
  bannersEnabled,
  selectedId,
  onSelect,
}: {
  cards: CatalogCaseCard[];
  bannersEnabled: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!cards.length) {
    return <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Пока нет кейсов.</p>;
  }

  const featured = bannersEnabled
    ? cards.filter((c) => c.kind === "featured" || c.kind === "daily")
    : [];
  const catalog = bannersEnabled
    ? cards.filter((c) => c.kind !== "featured" && c.kind !== "daily")
    : cards;

  return (
    <div className="cases-catalog admin-case-stats-catalog">
      {featured.length > 0 ? (
        <div className="cases-catalog__featured">
          {featured.map((card) => (
            <StatsCaseCard
              key={card.id}
              card={card}
              layout="wide"
              selected={selectedId === card.id}
              onSelect={() => onSelect(card.id)}
            />
          ))}
        </div>
      ) : null}

      <section className="cases-catalog__section">
        {featured.length > 0 ? <h2 className="cases-catalog__heading">Каталог</h2> : null}
        {catalog.length === 0 ? (
          <div className="cases-catalog__empty">
            <Gift className="h-7 w-7 opacity-35" />
            <p>Нет кейсов в каталоге</p>
          </div>
        ) : (
          <div className="cases-catalog__grid">
            {catalog.map((card) => (
              <StatsCaseCard
                key={card.id}
                card={card}
                layout="tile"
                selected={selectedId === card.id}
                onSelect={() => onSelect(card.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatsCaseCard({
  card,
  layout,
  selected,
  onSelect,
}: {
  card: CatalogCaseCard;
  layout: "wide" | "tile";
  selected: boolean;
  onSelect: () => void;
}) {
  const cover = resolveAsset(card.image_url?.trim() || "") || "";
  const free =
    card.kind === "daily" || card.kind === "promo" || card.price_nanoton <= 0;
  const priceText =
    card.kind === "promo"
      ? "Промокод"
      : free
        ? "Бесплатно"
        : formatCasePrice(card.price_nanoton);
  const kindTone =
    card.kind === "daily"
      ? "daily"
      : card.kind === "promo"
        ? "promo"
        : card.kind === "featured"
          ? "featured"
          : "default";
  const tone = edgeTone(card.house_edge_nanoton);

  return (
    <button
      type="button"
      className={cn(
        "cases-card group admin-case-stats-card text-left",
        layout === "wide" ? "cases-card--wide" : "cases-card--tile",
        `cases-card--${kindTone}`,
        selected && "cases-card--selected",
      )}
      onClick={onSelect}
    >
      <div className="cases-card__cover" aria-hidden>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="cases-card__art" draggable={false} />
        ) : (
          <div className="cases-card__art-fallback">
            <Gift className="h-8 w-8 opacity-40" strokeWidth={1.5} />
          </div>
        )}
        <div className="cases-card__cover-fade" />
        <span className="admin-case-stats-card__opens">
          <span className="admin-case-stats-card__opens-value">{formatCount(card.opens)}</span>
          <span className="admin-case-stats-card__opens-label">откр.</span>
        </span>
      </div>

      <div className="cases-card__footer">
        <div className="cases-card__copy">
          <h3 className="cases-card__title">{card.title}</h3>
          <span className={cn("cases-card__price", free && "cases-card__price--free")}>
            <span className="cases-card__price-text">{priceText}</span>
          </span>
        </div>
        <span
          className={cn(
            "cases-card__cta admin-case-stats-card__cta",
            tone === "good" && "admin-case-stats-card__cta--good",
            tone === "bad" && "admin-case-stats-card__cta--bad",
          )}
        >
          <span className="cases-card__cta-label">{formatTonLabel(card.house_edge_nanoton)}</span>
        </span>
      </div>

      <div
        className={cn(
          "admin-case-stats-card__details",
          selected && "admin-case-stats-card__details--open",
        )}
      >
        <p className="admin-case-stats-card__details-title">{card.title}</p>
        <dl className="admin-case-stats-card__details-grid">
          <DetailRow label="Открытий" value={formatCount(card.opens)} />
          <DetailRow label="Заплатили" value={formatTonLabel(card.spent_nanoton)} />
          <DetailRow label="Выдано призов" value={formatTonLabel(card.prize_total_nanoton)} />
          <DetailRow
            label="Прибыль дома"
            value={formatTonLabel(card.house_edge_nanoton)}
            tone={tone}
          />
          <DetailRow label="RTP (paid)" value={formatRtp(card.actual_rtp_bps)} />
          <DetailRow
            label="Ср. билет"
            value={
              card.opens > 0
                ? formatTonLabel(Math.round(card.spent_nanoton / card.opens))
                : "—"
            }
          />
        </dl>
      </div>
    </button>
  );
}

function DetailRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd
        className={cn(
          "tabular-nums font-medium",
          tone === "good" && "text-emerald-300",
          tone === "bad" && "text-rose-300",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SourceCards({ sources }: { sources: AdminCaseOpenSourceBreakdown }) {
  const totalOpens = SOURCE_META.reduce((sum, item) => sum + (sources[item.key]?.opens ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SOURCE_META.map((item) => {
        const s = sources[item.key] ?? emptySource();
        const share = totalOpens > 0 ? (s.opens / totalOpens) * 100 : 0;
        return (
          <div
            key={item.key}
            className="rounded-xl bg-[var(--admin-raised,#1c222d)] px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--admin-fg,#e8eef4)]">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--admin-muted,#8b98a8)]">
                  {item.hint}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-[var(--admin-muted,#8b98a8)]">
                {share.toFixed(0)}%
              </span>
            </div>
            <p className="mt-3 text-xl font-semibold tabular-nums text-[var(--admin-fg,#e8eef4)]">
              {formatCount(s.opens)}
              <span className="ml-1 text-xs font-normal text-[var(--admin-muted,#8b98a8)]">
                откр.
              </span>
            </p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <StatRow label="Уникальных" value={formatCount(s.unique_users)} />
              <StatRow label="Заплатили" value={formatTonLabel(s.spent_nanoton)} />
              <StatRow label="Выдано" value={formatTonLabel(s.prize_total_nanoton)} />
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function PrizeTypeBars({ rows }: { rows: AdminCaseOpenPrizeTypeStats[] }) {
  const totalOpens = rows.reduce((sum, row) => sum + row.opens, 0);
  const totalPrize = rows.reduce((sum, row) => sum + row.prize_total_nanoton, 0);

  if (!rows.length || totalOpens === 0) {
    return <p className="text-sm text-[var(--admin-muted,#8b98a8)]">Нет открытий за период.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const share = totalOpens > 0 ? (row.opens / totalOpens) * 100 : 0;
        const prizeShare = totalPrize > 0 ? (row.prize_total_nanoton / totalPrize) * 100 : 0;
        return (
          <div key={row.prize_type} className="rounded-xl bg-[var(--admin-raised,#1c222d)] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{prizeTypeLabel(row.prize_type)}</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatCount(row.opens)}
                <span className="ml-1 text-xs font-normal text-[var(--admin-muted,#8b98a8)]">
                  ({share.toFixed(1)}%)
                </span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-[var(--admin-accent,#2dd4bf)]/80"
                style={{ width: `${Math.max(4, share)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--admin-muted,#8b98a8)]">
              Выдано {formatTonLabel(row.prize_total_nanoton)}
              {totalPrize > 0 ? ` · ${prizeShare.toFixed(1)}%` : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DayChart({ points }: { points: AdminCaseOpenDailyPoint[] }) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.opens)), [points]);

  if (!points.length || points.every((p) => p.opens === 0)) {
    return (
      <p className="text-sm text-[var(--admin-muted,#8b98a8)]">
        Нет открытий за последние 14 дней.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-1.5">
        {points.map((point) => {
          const height = point.opens === 0 ? 0 : Math.max(8, (point.opens / max) * 100);
          const edge = point.spent_nanoton - point.prize_total_nanoton;
          return (
            <div
              key={point.date}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
              title={[
                point.date,
                `${point.opens} откр.`,
                `${point.unique_users} уник.`,
                `заплатили ${formatTonLabel(point.spent_nanoton)}`,
                `призы ${formatTonLabel(point.prize_total_nanoton)}`,
                `edge ${formatTonLabel(edge)}`,
              ].join(" · ")}
            >
              <span className="mb-1 text-[10px] tabular-nums text-[var(--admin-muted,#8b98a8)] opacity-0 transition group-hover:opacity-100">
                {point.opens}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-md transition-colors",
                  edge >= 0
                    ? "bg-emerald-400/70 group-hover:bg-emerald-400"
                    : "bg-rose-400/70 group-hover:bg-rose-400",
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {points.map((point) => (
          <span
            key={point.date}
            className="min-w-0 flex-1 truncate text-center text-[10px] tabular-nums text-[var(--admin-muted,#8b98a8)]"
          >
            {point.date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PrizeHitsList({ rows }: { rows: AdminCaseOpenPrizeHit[] }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-[var(--admin-muted,#8b98a8)]">
        Пока нет открытий для разбивки.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.loot_entry_id}
          className="rounded-xl bg-[var(--admin-raised,#1c222d)] px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.label}</p>
              <p className="mt-0.5 text-xs text-[var(--admin-muted,#8b98a8)]">
                {prizeTypeLabel(row.prize_type)} · {row.share_percent.toFixed(1)}%
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">{formatCount(row.hits)}</p>
              <p className="text-[11px] text-[var(--admin-muted,#8b98a8)]">выпадений</p>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
            <div
              className="h-full rounded-full bg-[var(--admin-accent,#2dd4bf)]/80"
              style={{ width: `${Math.max(4, Math.min(100, row.share_percent))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--admin-muted,#8b98a8)]">
            Выдано {formatTonLabel(row.prize_total_nanoton)}
          </p>
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--admin-muted,#8b98a8)]">{label}</dt>
      <dd className="tabular-nums text-[var(--admin-fg,#e8eef4)]">{value}</dd>
    </div>
  );
}

function MetricHighlight({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <div
      className={cn(
        "admin-metric",
        tone === "good" && "admin-metric--accent",
        tone === "bad" && "ring-1 ring-rose-400/30",
      )}
    >
      <p className="text-xs text-[var(--admin-muted,#8b98a8)]">{label}</p>
      <p
        className={cn(
          "admin-metric__value",
          tone === "good" && "text-emerald-400",
          tone === "bad" && "text-rose-400",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--admin-muted,#8b98a8)]">{hint}</p>
      ) : null}
    </div>
  );
}
