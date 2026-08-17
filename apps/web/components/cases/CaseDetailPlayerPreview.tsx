"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Gift, Package } from "lucide-react";
import { TonIcon } from "@/components/icons/TonIcon";
import { CaseOpenReveal } from "@/components/cases/CaseOpenReveal";
import { CaseTonPrizeArt, CASE_TON_TILE_BACKGROUND } from "@/components/cases/CaseTonPrizeArt";
import {
  FeaturedPattern,
  candyTileBackgroundForLoot,
  caseHeroStyle,
  getCaseTheme,
} from "@/components/cases/case-ui";
import { formatTON, type CaseLootPreview, type CaseView } from "@/lib/api";
import { formatCollectionSlug, giftImageUrl } from "@/lib/gifts";
import { useT } from "@/components/providers/I18nProvider";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { cn } from "@/lib/utils";

export type CaseDetailPreviewSource = Pick<
  CaseView,
  "title" | "slug" | "kind" | "accent_color" | "price_nanoton" | "require_channel"
>;

export function caseDetailHeading(title: string, caseWord = "Case"): string {
  if (!title) return "";
  const lower = title.toLowerCase();
  if (lower.includes("кейс") || lower.includes("case")) return title;
  return `${title} ${caseWord}`;
}

function collectionNameFromOriginalUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/original\/([^/?#]+?)(?:\.png)?(?:[?#]|$)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, " ").trim() || null;
  } catch {
    return match[1].replace(/\+/g, " ").trim() || null;
  }
}

/** Collection title for loot card; model name is shown separately. */
function lootCollectionLabel(entry: CaseLootPreview): string {
  const model = entry.model_name?.trim();
  const display = entry.display_name?.trim();
  const fromUrl = collectionNameFromOriginalUrl(entry.image_url);
  if (display && (!model || display !== model)) return display;
  if (fromUrl) return fromUrl;
  return formatCollectionSlug(entry.collection_slug) || entry.collection_slug;
}

function CaseLootCard({ entry }: { entry: CaseLootPreview }) {
  const t = useT();
  const isTon = entry.prize_type === "ton";
  const floor =
    isTon
      ? entry.amount_nanoton || entry.floor_price_nanoton || 0
      : entry.floor_price_nanoton ?? 0;
  const model = entry.model_name?.trim();
  const backdrop = entry.backdrop?.trim();
  const hintParts = isTon
    ? [t("cases.toBalance")]
    : [model || t("cases.random"), backdrop].filter(Boolean);

  return (
    <article className="case-loot-card">
      <div
        className="case-loot-card__frame"
        style={{
          background: isTon ? CASE_TON_TILE_BACKGROUND : candyTileBackgroundForLoot(entry),
        }}
      >
        {floor > 0 ? (
          <span className="case-loot-card__price">
            <TonIcon variant="brand" className="case-loot-card__price-icon" aria-hidden />
            {formatTON(floor)}
          </span>
        ) : null}
        {backdrop ? (
          <span className="case-loot-card__backdrop" title={backdrop}>
            {backdrop}
          </span>
        ) : null}
        {isTon ? (
          <span className="case-loot-card__ton">
            <CaseTonPrizeArt />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={giftImageUrl(entry.collection_slug, entry.image_url)}
            alt={lootCollectionLabel(entry)}
            className="case-loot-card__img"
            draggable={false}
          />
        )}
      </div>
      <div className="case-loot-card__meta">
        <p className="case-loot-card__name">
          {isTon ? entry.display_name || "TON" : lootCollectionLabel(entry)}
        </p>
        <p className="case-loot-card__hint">{hintParts.join(" · ")}</p>
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
  /** Hide the case title heading (player detail page). */
  hideTitle?: boolean;
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
  /** Content rendered above the open CTA (quest checklist, etc.). */
  aboveCta?: ReactNode;
  className?: string;
};

export function CaseDetailPlayerPreview({
  caseItem,
  loot,
  ctaLabel,
  ctaDisabled = false,
  onCtaClick,
  showCatalogLink = false,
  hideTitle = false,
  framed = false,
  revealMode = "idle",
  revealLoot,
  winnerId = null,
  onRevealComplete,
  promoCode = "",
  onPromoCodeChange,
  showPromoCodeInput = false,
  aboveCta,
  className,
}: CaseDetailPlayerPreviewProps) {
  const t = useT();
  const patternUid = useId().replace(/:/g, "");
  const accent = caseItem.accent_color || "#3390ec";
  const theme = getCaseTheme(caseItem);
  const heading = caseDetailHeading(caseItem.title, t("nav.case"));
  const stripLoot =
    revealMode === "spin" && revealLoot && revealLoot.length > 0 ? revealLoot : loot;

  const content = (
    <div className={cn("case-detail space-y-4", className)}>
      {!hideTitle ? <h1 className="case-detail__title">{heading}</h1> : null}

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
          <span className="text-xs font-medium text-white/55">{t("common.promo")}</span>
          <input
            className="input-field w-full uppercase tracking-wide"
            placeholder={t("cases.enterCode")}
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

      {aboveCta}

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
          <h2>{t("cases.prizeList")}</h2>
        </div>
        {loot.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface py-10 text-muted">
            <Gift className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("cases.prizesSoon")}</p>
          </div>
        ) : (
          <div className="case-detail__loot-grid">
            {loot.map((entry) => (
              <CaseLootCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );

  if (!framed) return content;

  return (
    <div
      className="admin-case-preview-frame"
      style={{ ["--accent" as string]: accent }}
      aria-label={t("cases.previewAria")}
    >
      {content}
    </div>
  );
}
