"use client";

import Link from "next/link";
import { useId } from "react";
import { Gift, Package } from "lucide-react";
import { TonIcon } from "@/components/icons/TonIcon";
import { CaseOpenReveal } from "@/components/cases/CaseOpenReveal";
import {
  FeaturedPattern,
  candyTileBackgroundForLoot,
  caseHeroStyle,
  getCaseTheme,
} from "@/components/cases/case-ui";
import { formatTON, type CaseLootPreview, type CaseView } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { cn } from "@/lib/utils";

export type CaseDetailPreviewSource = Pick<
  CaseView,
  "title" | "slug" | "kind" | "accent_color" | "price_nanoton" | "require_channel"
>;

export function caseDetailHeading(title: string): string {
  if (!title) return "";
  return title.toLowerCase().includes("кейс") ? title : `${title} Кейс`;
}

function CaseLootCard({ entry }: { entry: CaseLootPreview }) {
  const floor = entry.floor_price_nanoton ?? 0;

  return (
    <article className="case-loot-card">
      <div
        className="case-loot-card__frame"
        style={{ background: candyTileBackgroundForLoot(entry) }}
      >
        {floor > 0 ? (
          <span className="case-loot-card__price">
            {formatTON(floor)}
            <TonIcon variant="brand" className="case-loot-card__price-icon" aria-hidden />
          </span>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={giftImageUrl(entry.collection_slug, entry.image_url)}
          alt={entry.display_name}
          className="case-loot-card__img"
          draggable={false}
        />
      </div>
      <div className="case-loot-card__meta">
        <p className="case-loot-card__name">{entry.display_name}</p>
        <p className="case-loot-card__hint">Случайная модель</p>
      </div>
    </article>
  );
}

export type CaseDetailPlayerPreviewProps = {
  caseItem: CaseDetailPreviewSource;
  loot: CaseLootPreview[];
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCtaClick?: () => void;
  showCatalogLink?: boolean;
  /** Wrap in phone-like frame (admin). */
  framed?: boolean;
  revealMode?: "idle" | "spin";
  revealLoot?: CaseLootPreview[];
  winnerId?: string | null;
  onRevealComplete?: () => void;
  /** Promo-case unlock input (player). */
  promoCode?: string;
  onPromoCodeChange?: (value: string) => void;
  showPromoCodeInput?: boolean;
  className?: string;
};

export function CaseDetailPlayerPreview({
  caseItem,
  loot,
  ctaLabel,
  ctaDisabled = false,
  onCtaClick,
  showCatalogLink = false,
  framed = false,
  revealMode = "idle",
  revealLoot,
  winnerId = null,
  onRevealComplete,
  promoCode = "",
  onPromoCodeChange,
  showPromoCodeInput = false,
  className,
}: CaseDetailPlayerPreviewProps) {
  const patternUid = useId().replace(/:/g, "");
  const accent = caseItem.accent_color || "#3390ec";
  const theme = getCaseTheme(caseItem);
  const heading = caseDetailHeading(caseItem.title);
  const stripLoot =
    revealMode === "spin" && revealLoot && revealLoot.length > 0 ? revealLoot : loot;

  const content = (
    <div className={cn("case-detail space-y-4", className)}>
      <h1 className="case-detail__title">{heading}</h1>

      <section className="case-detail-hero" style={caseHeroStyle(theme)}>
        <FeaturedPattern
          variant={theme.patternVariant}
          patternId={`detail-pat-${patternUid}`}
          slug={theme.catalogSlug}
          color={theme.patternColor}
        />

        <CaseOpenReveal
          embedded
          loot={stripLoot}
          winnerId={revealMode === "spin" ? winnerId : null}
          mode={revealMode}
          accent={accent}
          onComplete={onRevealComplete}
        />
      </section>

      {showPromoCodeInput ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/55">Промокод</span>
          <input
            className="input-field w-full uppercase tracking-wide"
            placeholder="Введите код"
            value={promoCode}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={revealMode !== "idle"}
            onChange={(e) => onPromoCodeChange?.(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !ctaDisabled) onCtaClick?.();
            }}
          />
        </label>
      ) : null}

      <button
        type="button"
        className="case-detail-cta app-control"
        disabled={ctaDisabled}
        onClick={onCtaClick}
      >
        {ctaLabel}
      </button>

      <section className="case-detail__collections">
        <div className="case-detail__collections-head">
          <Package className="h-4 w-4 text-accent" strokeWidth={2.2} aria-hidden />
          <h2>Список призов</h2>
        </div>
        {loot.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface py-10 text-muted">
            <Gift className="h-7 w-7 opacity-40" />
            <p className="text-sm">Призы скоро появятся</p>
          </div>
        ) : (
          <div className="case-detail__loot-grid">
            {loot.map((entry) => (
              <CaseLootCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      {showCatalogLink ? (
        <Link
          href={APP_ROUTES.cases}
          className="block pb-1 text-center text-xs text-white/40 transition-colors hover:text-white/70"
        >
          К каталогу
        </Link>
      ) : null}
    </div>
  );

  if (!framed) return content;

  return (
    <div
      className="admin-case-preview-frame"
      style={{ ["--accent" as string]: accent }}
      aria-label="Предпросмотр экрана кейса"
    >
      {content}
    </div>
  );
}
