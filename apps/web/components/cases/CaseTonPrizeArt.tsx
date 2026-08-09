"use client";

import { TonIcon } from "@/components/icons/TonIcon";
import { formatCompactTON } from "@/components/cases/case-ui";
import { cn } from "@/lib/utils";

/** Crystal TON mark for case loot / live / reveal — not the flat brand badge. */
export function CaseTonPrizeArt({
  className,
  title = "TON",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("case-ton-prize", className)} role="img" aria-label={title}>
      <span className="case-ton-prize__aura" aria-hidden />
      <span className="case-ton-prize__orb" aria-hidden>
        <span className="case-ton-prize__ring" />
        <span className="case-ton-prize__core">
          <TonIcon variant="mono" className="case-ton-prize__mark" title="" />
        </span>
        <span className="case-ton-prize__shine" />
        <span className="case-ton-prize__spark case-ton-prize__spark--a" />
        <span className="case-ton-prize__spark case-ton-prize__spark--b" />
      </span>
    </span>
  );
}

/** Soft crystal backdrop for TON prize tiles (loot / live / reveal). */
export const CASE_TON_TILE_BACKGROUND =
  "radial-gradient(circle at 50% 28%, #7ad4ff 0%, #2aa0ef 36%, #135ea8 68%, #0a2a52 100%)";

/** Compact price + TON mark for narrow loot/live badges. */
export function CaseMiniTonPrice({
  nanoton,
  className,
}: {
  nanoton: number;
  className?: string;
}) {
  if (!(nanoton > 0)) return null;
  return (
    <span className={cn("case-mini-ton-price", className)}>
      <span className="case-mini-ton-price__value">{formatCompactTON(nanoton)}</span>
      <span className="case-mini-ton-price__icon" aria-hidden>
        <TonIcon variant="mono" title="" />
      </span>
    </span>
  );
}
