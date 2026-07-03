"use client";

import { useState } from "react";
import { formatTON, ProfileGift } from "@/lib/api";
import { giftGradient, giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";
import { Gift } from "lucide-react";

type Props = {
  gift: ProfileGift;
  selected?: boolean;
  onToggle?: (slug: string) => void;
  onInspect?: (gift: ProfileGift) => void;
};

export function GiftTile({ gift, selected, onToggle, onInspect }: Props) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = giftImageUrl(gift.slug, gift.image_url);

  if (gift.is_staked) {
    return (
      <button
        type="button"
        onClick={() => onInspect?.(gift)}
        className="relative w-full touch-manipulation overflow-hidden rounded-xl ring-1 ring-success/30 transition-all active:scale-[0.97]"
      >
        <div className="relative aspect-square overflow-hidden bg-surface-raised">
          {!imgError ? (
            <img
              src={imageSrc}
              alt={gift.name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: giftGradient(gift.slug) }}
            >
              <Gift className="h-5 w-5 text-white/40" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-6">
            <p className="truncate text-[9px] font-medium text-white/80">{gift.name}</p>
            <p className="text-[10px] font-bold tabular-nums text-success">
              +{formatTON(gift.earned_nanoton)}
            </p>
          </div>
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_var(--success)]" />
        </div>
      </button>
    );
  }

  const isSelectable = !!onToggle;

  return (
    <button
      type="button"
      onClick={() => isSelectable && onToggle?.(gift.slug)}
      disabled={!isSelectable}
      className={cn(
        "relative w-full touch-manipulation overflow-hidden rounded-xl bg-surface-raised transition-all active:scale-[0.97]",
        isSelectable && selected && "ring-2 ring-accent",
        isSelectable && !selected && "ring-1 ring-border opacity-70",
      )}
    >
      <div className="relative aspect-square overflow-hidden">
        {!imgError ? (
          <img
            src={imageSrc}
            alt={gift.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: giftGradient(gift.slug) }}
          >
            <Gift className="h-5 w-5 text-white/40" />
          </div>
        )}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/50 px-1 py-px text-[8px] font-medium tabular-nums text-white backdrop-blur-sm">
          {formatTON(gift.price_nanoton)}
        </span>
        {isSelectable && selected && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-surface">
            ✓
          </span>
        )}
      </div>
    </button>
  );
}

export function GiftTileSkeleton() {
  return <div className="aspect-square animate-pulse rounded-xl bg-surface-raised" />;
}
