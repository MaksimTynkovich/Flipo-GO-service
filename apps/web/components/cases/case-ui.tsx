"use client";

import type { CSSProperties, ReactNode } from "react";
import type { CaseLootPreview, CaseView } from "@/lib/api";

/** Loot rarity grades — same set as admin CasesSection. */
export const LOOT_RARITY_OPTIONS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type LootRarity = (typeof LOOT_RARITY_OPTIONS)[number];

/** Soft Candy tile gradients keyed by rarity (admin `rarity_label`). */
export const RARITY_CANDY_BACKGROUND: Record<LootRarity, string> = {
  common: "linear-gradient(150deg, hsl(210 68% 62%) 0%, hsl(210 62% 40%) 100%)",
  uncommon: "linear-gradient(150deg, hsl(155 66% 58%) 0%, hsl(155 60% 36%) 100%)",
  rare: "linear-gradient(150deg, hsl(270 68% 62%) 0%, hsl(270 62% 40%) 100%)",
  epic: "linear-gradient(150deg, hsl(320 68% 62%) 0%, hsl(320 62% 40%) 100%)",
  legendary: "linear-gradient(150deg, hsl(35 72% 58%) 0%, hsl(25 68% 38%) 100%)",
};

export function parseLootRarity(label?: string): LootRarity {
  const normalized = label?.trim().toLowerCase() ?? "";
  if ((LOOT_RARITY_OPTIONS as readonly string[]).includes(normalized)) {
    return normalized as LootRarity;
  }
  return "common";
}

export function candyTileBackgroundForLoot(
  entry: Pick<CaseLootPreview, "rarity_label">,
): string {
  return RARITY_CANDY_BACKGROUND[parseLootRarity(entry.rarity_label)];
}

export type CatalogAccent = {
  from: string;
  to: string;
  glow: string;
  border: string;
};

export type FeaturedTheme = {
  from: string;
  mid: string;
  to: string;
  border: string;
  glow: string;
};

export type CaseHeroTheme = FeaturedTheme & {
  patternVariant: "premium" | "daily" | "catalog";
  catalogSlug?: string;
  patternColor?: string;
};

export const FEATURED = {
  premium: {
    from: "#0b1119",
    mid: "#040910",
    to: "#060d16",
    border: "rgba(74,137,220,0.35)",
    glow: "rgba(59,130,246,0.1)",
  },
  daily: {
    from: "#184a32",
    mid: "#123528",
    to: "#0c1c14",
    border: "rgba(93,190,101,0.45)",
    glow: "rgba(34,197,94,0.18)",
  },
} as const satisfies Record<string, FeaturedTheme>;

export const CATALOG: Record<string, CatalogAccent> = {
  starter: { from: "#1f9a4a", to: "#0b3d20", glow: "#4ade80", border: "rgba(52,211,153,0.35)" },
  "pepe-love": { from: "#3f3428", to: "#17120e", glow: "#fb923c", border: "rgba(251,146,60,0.28)" },
  birthday: { from: "#7c3aed", to: "#2e1065", glow: "#c084fc", border: "rgba(192,132,252,0.35)" },
  "classic-cap": { from: "#3f4652", to: "#14181e", glow: "#94a3b8", border: "rgba(148,163,184,0.28)" },
  gold: { from: "#ca8a04", to: "#422006", glow: "#fbbf24", border: "rgba(251,191,36,0.35)" },
  diamond: { from: "#2563eb", to: "#0c1e4a", glow: "#60a5fa", border: "rgba(96,165,250,0.4)" },
  royal: { from: "#dc2626", to: "#450a0a", glow: "#f87171", border: "rgba(248,113,113,0.35)" },
  legendary: { from: "#6d28d9", to: "#1e0b3d", glow: "#a78bfa", border: "rgba(167,139,250,0.35)" },
};

export function formatCasePrice(nanoton: number): string {
  const ton = nanoton / 1e9;
  if (Number.isInteger(ton)) return String(ton);
  return ton.toFixed(1).replace(/\.0$/, "");
}

export function getCatalogAccent(caseItem: Pick<CaseView, "slug" | "accent_color">): CatalogAccent {
  return (
    CATALOG[caseItem.slug] || {
      from: caseItem.accent_color || "#334155",
      to: "#0a0e14",
      glow: caseItem.accent_color || "#64748b",
      border: "rgba(58,69,86,0.9)",
    }
  );
}

export function getCaseTheme(caseItem: Pick<CaseView, "kind" | "slug" | "accent_color">): CaseHeroTheme {
  if (caseItem.kind === "daily") {
    return { ...FEATURED.daily, patternVariant: "daily" };
  }
  if (caseItem.kind === "featured") {
    return { ...FEATURED.premium, patternVariant: "premium" };
  }
  const accent = getCatalogAccent(caseItem);
  return {
    from: accent.from,
    mid: accent.from,
    to: accent.to,
    border: accent.border,
    glow: `${accent.glow}33`,
    patternVariant: "catalog",
    catalogSlug: caseItem.slug,
    patternColor: accent.glow,
  };
}

export function caseHeroStyle(theme: CaseHeroTheme): CSSProperties {
  return {
    boxShadow: `0 0 0 1px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
    background: `
      radial-gradient(70% 60% at 82% 38%, ${theme.glow} 0%, transparent 62%),
      linear-gradient(${theme.from} 0%, ${theme.mid} 48%, ${theme.to} 100%)
    `,
  };
}

export function FeaturedPattern({
  variant,
  patternId,
  color,
  slug,
}: {
  variant: "premium" | "daily" | "catalog";
  patternId: string;
  color?: string;
  slug?: string;
}) {
  if (variant === "catalog" && slug) {
    return <CatalogPattern slug={slug} color={color || "#94a3b8"} patternId={patternId} />;
  }
  if (variant === "daily") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" aria-hidden>
        <defs>
          <pattern id={patternId} width="30" height="30" patternUnits="userSpaceOnUse">
            <rect x="10" y="12" width="10" height="9" rx="1.5" fill="none" stroke="#86efac" strokeWidth="1.15" />
            <path d="M10 15.5h10M15 12v9" stroke="#86efac" strokeWidth="1.15" />
            <path d="M12 12c0-2.2 1.4-3.2 3-3.2s3 1 3 3.2" fill="none" stroke="#86efac" strokeWidth="1.15" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    );
  }
  // Telegram paper-plane outline (send icon), scattered watermark.
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" aria-hidden>
      <defs>
        <pattern id={patternId} width="132" height="132" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#8eb8ef" strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round">
            {[
              "translate(6 28) rotate(35) scale(1.08)",
              "translate(68 4) rotate(-35) scale(0.95)",
              "translate(96 58) rotate(12) scale(0.82)",
              "translate(38 78) rotate(-12) scale(1.12)",
              "translate(18 108) rotate(42) scale(0.78)",
            ].map((t) => (
              <g key={t} transform={t}>
                {/* Lucide Send — recognisable Telegram paper-plane */}
                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.04a2 2 0 0 1 1.112 1.11z" />
                <path d="M21.854 2.147 10.75 13.25" />
              </g>
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function GiftPlaceholder({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "warm" | "cool" | "gold";
}) {
  const tones = {
    default: "from-slate-200/40 to-slate-500/15",
    warm: "from-orange-300/55 to-rose-500/20",
    cool: "from-sky-300/50 to-blue-600/20",
    gold: "from-yellow-200/60 to-amber-500/25",
  };
  return (
    <div
      className={`rounded-[18px] bg-gradient-to-br ${tones[tone]} shadow-[0_8px_22px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/30 ${className ?? ""}`}
      aria-hidden
    />
  );
}

export function FeaturedGiftCluster({ className }: { className?: string }) {
  return (
    <div className={className ?? "pointer-events-none absolute inset-y-0 right-0 w-[54%]"} aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_65%)]" />
      <GiftPlaceholder className="absolute left-[8%] top-[38%] h-[42%] w-[38%] -rotate-[18deg]" tone="gold" />
      <GiftPlaceholder className="absolute left-[28%] top-[18%] h-[48%] w-[44%] rotate-[6deg]" tone="warm" />
      <GiftPlaceholder className="absolute right-[6%] top-[28%] h-[44%] w-[40%] rotate-[14deg]" tone="cool" />
      <GiftPlaceholder className="absolute bottom-[14%] left-[22%] h-[36%] w-[34%] -rotate-[6deg]" tone="default" />
    </div>
  );
}

export function CatalogPattern({ slug, color, patternId }: { slug: string; color: string; patternId: string }) {
  const stroke = color;
  let motif: ReactNode;
  switch (slug) {
    case "starter":
      motif = (
        <>
          <path d="M10 8l8 8M18 8l-8 8" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="10" cy="8" r="1.6" fill={stroke} />
          <circle cx="18" cy="8" r="1.6" fill={stroke} />
        </>
      );
      break;
    case "birthday":
      motif = <path d="M14 6c-3 3-4 6-4 9a4 4 0 008 0c0-3-1-6-4-9z" fill="none" stroke={stroke} strokeWidth="1.2" />;
      break;
    case "gold":
    case "royal":
    case "classic-cap":
      motif = (
        <path
          d="M8 12l3-4 3 2.5L17 8l1.5 4H8zm0 0v2h10.5v-2M10 14v4h6v-4"
          fill="none"
          stroke={stroke}
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      );
      break;
    case "diamond":
    case "legendary":
      motif = (
        <path d="M14 7l3 3-3 7-3-7 3-3zM11 10h6" fill="none" stroke={stroke} strokeWidth="1.15" strokeLinejoin="round" />
      );
      break;
    default:
      motif = <circle cx="14" cy="14" r="2.2" fill="none" stroke={stroke} strokeWidth="1.2" />;
  }

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
      <defs>
        <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse">
          {motif}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
