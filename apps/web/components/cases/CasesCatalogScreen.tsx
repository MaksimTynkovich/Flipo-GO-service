"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { TonIcon } from "@/components/icons/TonIcon";
import { candyTileBackgroundForLoot, formatCasePrice, formatCompactTON, getCatalogAccent } from "@/components/cases/case-ui";
import { CaseTonPrizeArt, CaseMiniTonPrice, CASE_TON_TILE_BACKGROUND } from "@/components/cases/CaseTonPrizeArt";
import { resolveAsset, type CaseLootPreview, type CaseView } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useT } from "@/components/providers/I18nProvider";
import type { TFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LOOT_PREVIEW_LIMIT = 4;

function isFreeCase(caseItem: CaseView): boolean {
  return (
    caseItem.free_open_available === true ||
    caseItem.kind === "daily" ||
    caseItem.kind === "promo" ||
    caseItem.price_nanoton <= 0
  );
}

function priceLabel(caseItem: CaseView, t: TFunction): { text: string; free: boolean } {
  if (caseItem.kind === "promo") {
    return { text: t("common.promo"), free: true };
  }
  if (isFreeCase(caseItem)) {
    return { text: t("common.free"), free: true };
  }
  return { text: formatCasePrice(caseItem.price_nanoton), free: false };
}

function lootValueNanoton(entry: CaseLootPreview): number {
  if (entry.prize_type === "ton") {
    return entry.amount_nanoton || entry.floor_price_nanoton || 0;
  }
  return entry.floor_price_nanoton || 0;
}

/** Top N most expensive prizes (gifts + TON) for catalog card preview. */
export function topCaseLootGifts(
  loot: CaseLootPreview[] | undefined,
  limit = LOOT_PREVIEW_LIMIT,
): CaseLootPreview[] {
  if (!loot?.length || limit <= 0) return [];
  return loot
    .slice()
    .sort((a, b) => {
      const byValue = lootValueNanoton(b) - lootValueNanoton(a);
      if (byValue !== 0) return byValue;
      return a.sort_order - b.sort_order;
    })
    .slice(0, limit);
}

function CaseCardLootPreview({ items }: { items: CaseLootPreview[] }) {
  if (items.length === 0) return null;

  return (
    <ul
      className={cn(
        "cases-card__loot",
        items.length < LOOT_PREVIEW_LIMIT && "cases-card__loot--compact",
      )}
      aria-hidden
    >
      {items.map((entry) => {
        const value = lootValueNanoton(entry);
        const isTon = entry.prize_type === "ton";
        return (
          <li
            key={entry.id}
            className="cases-card__loot-tile"
            style={{
              background: isTon ? CASE_TON_TILE_BACKGROUND : candyTileBackgroundForLoot(entry),
            }}
            title={
              value > 0
                ? `${entry.display_name || (isTon ? "TON" : "")} · ${formatCompactTON(value)} TON`
                : entry.display_name || (isTon ? "TON" : "")
            }
          >
            {isTon ? (
              <span className="cases-card__loot-ton">
                <CaseTonPrizeArt />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={giftImageUrl(entry.collection_slug, entry.image_url)}
                alt=""
                className="cases-card__loot-img"
                draggable={false}
              />
            )}
            {value > 0 ? (
              <CaseMiniTonPrice nanoton={value} className="cases-card__loot-price" />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CaseCard({
  caseItem,
  layout = "tile",
  interactive = true,
  selected = false,
  onClick,
}: {
  caseItem: CaseView;
  layout?: "wide" | "tile";
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const t = useT();
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const cover = resolveAsset(caseItem.image_url?.trim()) || "";
  const price = priceLabel(caseItem, t);
  const lootPreview = topCaseLootGifts(caseItem.loot);
  const accent = getCatalogAccent(caseItem);
  const kindTone =
    caseItem.kind === "daily"
      ? "daily"
      : caseItem.kind === "promo"
        ? "promo"
        : caseItem.kind === "featured"
          ? "featured"
          : "default";

  const className = cn(
    "cases-card group app-control",
    layout === "wide" ? "cases-card--wide" : "cases-card--tile",
    `cases-card--${kindTone}`,
    lootPreview.length > 0 && "cases-card--loot",
    selected && "cases-card--selected",
    onClick && "cursor-pointer",
  );

  const cardStyle = {
    "--case-accent": accent.from,
    "--case-glow": accent.glow,
  } as CSSProperties;

  const body = (
    <>
      <div className="cases-card__media" aria-hidden>
        <div className="cases-card__glow" />
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="cases-card__art" draggable={false} />
        ) : (
          <div className="cases-card__art-fallback">
            <Gift className="h-8 w-8 opacity-40" strokeWidth={1.5} />
          </div>
        )}
        <div className="cases-card__shade" />
      </div>

      <div className="cases-card__panel">
        <CaseCardLootPreview items={lootPreview} />
        <span className="cases-card__cta">
          <span className="cases-card__cta-title">{caseItem.title}</span>
          <span className="cases-card__cta-label">
            <span className="cases-card__cta-text">{price.text}</span>
            {!price.free ? (
              <TonIcon
                variant="brand"
                size="sm"
                className="cases-card__cta-ton"
                title="TON"
              />
            ) : null}
          </span>
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={className}
        style={cardStyle}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {body}
      </div>
    );
  }

  if (interactive) {
    return (
      <Link href={href} className={className} style={cardStyle}>
        {body}
      </Link>
    );
  }

  return (
    <div className={className} style={cardStyle}>
      {body}
    </div>
  );
}

export function splitCasesForCatalog(params: {
  cases: CaseView[];
  bannersEnabled: boolean;
}): {
  featuredRow: CaseView[];
  catalog: CaseView[];
} {
  const active = params.cases.filter((c) => (c as CaseView & { active?: boolean }).active !== false);
  const byOrder = (a: CaseView, b: CaseView) =>
    a.sort_order - b.sort_order || a.title.localeCompare(b.title);

  const featured = active.filter((c) => c.kind === "featured").sort(byOrder);
  const daily = active.filter((c) => c.kind === "daily").sort(byOrder);
  const catalogOnly = active
    .filter((c) => c.kind !== "featured" && c.kind !== "daily")
    .sort(byOrder);

  if (params.bannersEnabled) {
    return {
      featuredRow: [...featured, ...daily],
      catalog: catalogOnly,
    };
  }

  return {
    featuredRow: [],
    catalog: [...active].sort(byOrder),
  };
}

const LOBBY_LIVE_SKEL = 8;
const LOBBY_CARD_SKEL = 6;

/** Full lobby stubs — live strip, quest banner, catalog grid. */
export function CasesLobbySkeleton({ className }: { className?: string }) {
  const t = useT();
  return (
    <div
      className={cn("cases-lobby space-y-4 pb-2", className)}
      aria-busy="true"
      aria-label={t("cases.loadingAria")}
    >
      <div className="cases-live cases-live--skeleton" aria-hidden>
        <div className="cases-live__row">
          <div className="cases-live__badge">
            <span className="cases-live__dot" />
            <span className="cases-live__label">LIVE</span>
          </div>
          <div className="cases-live__scroller">
            <div className="cases-live__track">
              {Array.from({ length: LOBBY_LIVE_SKEL }).map((_, i) => (
                <div
                  key={i}
                  className="skel-shimmer cases-live__tile-skel"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="skel-shimmer cases-quest-promo cases-quest-promo--skeleton" aria-hidden />

      <div className="cases-catalog cases-catalog--loading" aria-hidden>
        <div className="cases-catalog__grid">
          {Array.from({ length: LOBBY_CARD_SKEL }).map((_, i) => (
            <div
              key={i}
              className="cases-card cases-card--tile cases-card--loot cases-card--skeleton"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="skel-shimmer cases-card__skel-fill" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CasesCatalogScreen({
  cases,
  bannersEnabled = false,
  /** Force one grid in given order (admin reorder preview). */
  flatOrder = false,
  /** Equal grid for all cases (user lobby). */
  equalGrid = false,
  interactive = true,
  selectedId = null,
  onCaseClick,
  className,
}: {
  cases: CaseView[];
  bannersEnabled?: boolean;
  flatOrder?: boolean;
  equalGrid?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  onCaseClick?: (caseItem: CaseView) => void;
  className?: string;
}) {
  const t = useT();
  const { featuredRow, catalog } = flatOrder
    ? { featuredRow: [] as CaseView[], catalog: cases }
    : equalGrid
      ? {
          featuredRow: [] as CaseView[],
          catalog: splitCasesForCatalog({ cases, bannersEnabled: false }).catalog,
        }
      : splitCasesForCatalog({ cases, bannersEnabled });

  const showBanners = !flatOrder && !equalGrid && bannersEnabled && featuredRow.length > 0;

  return (
    <div className={cn("cases-catalog", className)}>
      {showBanners ? (
        <div className="cases-catalog__featured">
          {featuredRow.map((item) => (
            <CaseCard
              key={item.id}
              caseItem={item}
              layout="wide"
              interactive={interactive && !onCaseClick}
              selected={selectedId === item.id}
              onClick={onCaseClick ? () => onCaseClick(item) : undefined}
            />
          ))}
        </div>
      ) : null}

      <section className="cases-catalog__section">
        {showBanners ? <h2 className="cases-catalog__heading">{t("cases.catalog")}</h2> : null}
        {catalog.length === 0 ? (
          <div className="cases-catalog__empty">
            <Gift className="h-7 w-7 opacity-35" />
            <p>{t("cases.empty")}</p>
          </div>
        ) : (
          <div className="cases-catalog__grid">
            {catalog.map((item) => (
              <CaseCard
                key={item.id}
                caseItem={item}
                layout="tile"
                interactive={interactive && !onCaseClick}
                selected={selectedId === item.id}
                onClick={onCaseClick ? () => onCaseClick(item) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
