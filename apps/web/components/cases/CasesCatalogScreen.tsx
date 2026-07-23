"use client";

import Link from "next/link";
import { Gift } from "lucide-react";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCasePrice } from "@/components/cases/case-ui";
import { resolveAsset, type CaseView } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { cn } from "@/lib/utils";

function priceLabel(caseItem: CaseView): { text: string; free: boolean; muted?: boolean } {
  const isDaily = caseItem.kind === "daily";
  const isFree = isDaily || caseItem.price_nanoton <= 0;
  if (isDaily && caseItem.daily_available === false) {
    return { text: "Завтра", free: true, muted: true };
  }
  if (isFree) {
    return {
      text: caseItem.require_channel ? "Free · подписка" : "Бесплатно",
      free: true,
    };
  }
  return { text: `${formatCasePrice(caseItem.price_nanoton)} TON`, free: false };
}

export function CaseCard({
  caseItem,
  layout,
  interactive = true,
  selected = false,
  onClick,
}: {
  caseItem: CaseView;
  layout: "wide" | "tile";
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const cover = resolveAsset(caseItem.image_url?.trim()) || "";
  const accent = caseItem.accent_color?.trim() || "#3b82f6";
  const price = priceLabel(caseItem);

  const className = cn(
    "group relative block overflow-hidden rounded-2xl border bg-[#101820]",
    layout === "wide" ? "aspect-[5/4]" : "aspect-[4/5]",
    selected ? "border-accent/60 ring-1 ring-accent/35" : "border-white/[0.07]",
    onClick && "cursor-pointer",
  );

  const body = (
    <>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-active:scale-[1.02]"
          draggable={false}
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 55% at 50% 38%, ${accent}55 0%, transparent 68%),
              linear-gradient(180deg, #152033 0%, #0d121a 100%)
            `,
          }}
          aria-hidden
        />
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,18,0.12) 0%, rgba(8,12,18,0.04) 40%, rgba(8,12,18,0.82) 100%)",
        }}
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 z-[1] flex items-end justify-between gap-1.5 p-2.5">
        <h3
          className={cn(
            "min-w-0 flex-1 line-clamp-2 font-semibold leading-tight tracking-tight text-white",
            layout === "wide" ? "text-[14px]" : "text-[12px]",
          )}
        >
          {caseItem.title}
        </h3>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 max-w-[55%] items-center gap-1 truncate rounded-full px-2 text-[10px] font-semibold tabular-nums backdrop-blur-md",
            price.muted
              ? "bg-white/10 text-white/45"
              : price.free
                ? "bg-white/12 text-emerald-200"
                : "bg-black/55 text-white",
          )}
        >
          {!price.free && !price.muted ? (
            <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
          ) : null}
          <span className="truncate">{price.text}</span>
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
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
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

  // Flat grid in sort_order — matches admin reorder list.
  return {
    featuredRow: [],
    catalog: [...active].sort(byOrder),
  };
}

export function CasesCatalogScreen({
  cases,
  bannersEnabled = false,
  /** Force one grid in given order (admin reorder preview). */
  flatOrder = false,
  interactive = true,
  selectedId = null,
  onCaseClick,
  className,
}: {
  cases: CaseView[];
  bannersEnabled?: boolean;
  flatOrder?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  onCaseClick?: (caseItem: CaseView) => void;
  className?: string;
}) {
  const { featuredRow, catalog } = flatOrder
    ? { featuredRow: [] as CaseView[], catalog: cases }
    : splitCasesForCatalog({ cases, bannersEnabled });

  const showBanners = !flatOrder && bannersEnabled && featuredRow.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {showBanners ? (
        <div className="grid grid-cols-2 gap-2">
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

      <section>
        {showBanners ? (
          <h2 className="mb-2 text-[13px] font-medium tracking-tight text-white/55">
            Каталог
          </h2>
        ) : null}
        {catalog.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface/60 py-12 text-muted">
            <Gift className="h-7 w-7 opacity-35" />
            <p className="text-sm">Пока нет кейсов</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
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
